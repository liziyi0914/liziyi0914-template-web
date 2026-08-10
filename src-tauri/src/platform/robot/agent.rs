//! 一条 `cmd` 的处理流程：带工具问一次 → 执行 → 不带工具再问一次要中文回复。
//!
//! 工具执行抽成 `ToolInvoker`，所以这里的测试不需要真的 WebSocket。

use std::collections::VecDeque;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use teaching_platform::error::{code, ApiError};

use super::tools;
use crate::llm::{ChatMessage, ChatRequest, Result, TextModel, ToolCall};

/// 历史保留的轮数。一轮 = 一条 cmd 及其全部消息。
pub const HISTORY_TURNS: usize = 10;

/// 模型没给回复时的兜底话术。宁可说句废话也不能一声不出。
const UNCLEAR_REPLY: &str = "我没太听明白，可以再说一次吗";
const DONE_REPLY: &str = "好的，已经处理了";

const SYSTEM_PROMPT: &str = "\
你是教室里的教学助手机器人，通过工具操作教学平台。老师的话由语音识别转成文本，可能有错别字或口语化表达。

规则：
- 只能通过工具改变现场状态，不要声称自己做了没调工具的事。
- 翻页时必须从下面的现场信息读出当前页码并填进 expect_page，读不到就先说明情况。
- 现场信息里标为「无法获取」的内容不要编造，如实告诉老师查不到。
- 回复控制在 30 字以内，口语化，这句话会展示给老师，也可能被朗读出来。
- 老师只是闲聊或询问现状时，直接回答，不要调用工具。";

/// 执行一条平台指令。实现方负责发 WebSocket req 并等 ack。
#[async_trait]
pub trait ToolInvoker: Send + Sync {
    async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError>;
}

/// 一轮对话的产物。
#[derive(Debug, Clone)]
pub struct Outcome {
    /// 给老师的中文回复
    pub reply: String,
    /// 这一轮实际发出去的 op，供日志
    pub invoked: Vec<String>,
    /// 模型每轮的原始输出，写进日志 detail
    pub raw: Vec<String>,
}

/// 以「轮」为单位的环形缓冲。按条裁会把 `tool_calls` 与它的 `tool` 结果拆散，
/// 只留一半会被服务端拒绝。
#[derive(Debug, Default)]
pub struct History {
    turns: VecDeque<Vec<ChatMessage>>,
}

impl History {
    pub fn push_turn(&mut self, messages: Vec<ChatMessage>) {
        self.turns.push_back(messages);
        while self.turns.len() > HISTORY_TURNS {
            self.turns.pop_front();
        }
    }

    pub fn messages(&self) -> Vec<ChatMessage> {
        self.turns.iter().flatten().cloned().collect()
    }
}

pub struct Agent {
    model: Arc<dyn TextModel>,
    history: History,
}

impl Agent {
    pub fn new(model: Arc<dyn TextModel>) -> Self {
        Self {
            model,
            history: History::default(),
        }
    }

    /// 处理一条命令。`site` 是 `ContextStore::render()` 出来的现场段落。
    /// 返回 `Err` 表示这一条丢掉了，会话继续。
    pub async fn handle(
        &mut self,
        cmd: &str,
        site: &str,
        invoker: &dyn ToolInvoker,
    ) -> Result<Outcome> {
        let mut messages = vec![ChatMessage::System(format!("{SYSTEM_PROMPT}\n\n{site}"))];
        messages.extend(self.history.messages());
        messages.push(ChatMessage::User(cmd.to_string()));

        let first = self
            .model
            .chat(ChatRequest {
                messages: messages.clone(),
                tools: tools::specs(),
            })
            .await?;
        let mut raw = vec![first.raw];

        if first.tool_calls.is_empty() {
            let reply = first
                .content
                .unwrap_or_else(|| UNCLEAR_REPLY.to_string());
            self.history.push_turn(vec![
                ChatMessage::User(cmd.to_string()),
                ChatMessage::Assistant {
                    content: Some(reply.clone()),
                    tool_calls: Vec::new(),
                },
            ]);
            return Ok(Outcome {
                reply,
                invoked: Vec::new(),
                raw,
            });
        }

        // 串行执行：并发发指令会让 PPT 一次翻两页，这正是协议做 packageId 去重
        // 想避免的事故
        let mut invoked = Vec::new();
        let mut results = Vec::new();
        for call in &first.tool_calls {
            let (op, content) = execute(call, invoker).await;
            if let Some(op) = op {
                invoked.push(op);
            }
            results.push(ChatMessage::Tool {
                call_id: call.id.clone(),
                content,
            });
        }

        let assistant = ChatMessage::Assistant {
            content: first.content,
            tool_calls: first.tool_calls,
        };

        let mut second = messages;
        second.push(assistant.clone());
        second.extend(results.iter().cloned());

        // 第二轮不给 tools：这一轮只要中文回复，给了工具模型容易再调一次
        let reply = match self
            .model
            .chat(ChatRequest {
                messages: second,
                tools: Vec::new(),
            })
            .await
        {
            Ok(response) => {
                raw.push(response.raw);
                response.content.unwrap_or_else(|| DONE_REPLY.to_string())
            }
            Err(error) => {
                // 指令已经执行了，不能因为组织不出话就当整条命令失败
                log::warn!("生成回复失败：{error}");
                raw.push(format!("生成回复失败：{error}"));
                DONE_REPLY.to_string()
            }
        };

        let mut turn = vec![ChatMessage::User(cmd.to_string()), assistant];
        turn.extend(results);
        turn.push(ChatMessage::Assistant {
            content: Some(reply.clone()),
            tool_calls: Vec::new(),
        });
        self.history.push_turn(turn);

        Ok(Outcome {
            reply,
            invoked,
            raw,
        })
    }
}

/// 返回（真正发出去的 op，回给模型的 JSON 字符串）。
async fn execute(call: &ToolCall, invoker: &dyn ToolInvoker) -> (Option<String>, String) {
    let Some(op) = tools::op_of(&call.name) else {
        log::warn!("模型调了清单外的工具 {}", call.name);
        return (None, tool_result_error(code::UNSUPPORTED_OP, "不支持的指令"));
    };

    // 模型给的 arguments 常有截断或多余引号。当空参数发出去，让服务端的参数
    // 校验去报错——比在这里静默丢掉整条指令好排查
    let params = match serde_json::from_str::<Value>(&call.arguments) {
        Ok(Value::Object(map)) => Value::Object(map),
        _ => {
            log::warn!("{op} 的参数不是 JSON 对象，按空参数执行：{}", call.arguments);
            json!({})
        }
    };

    let content = match invoker.invoke(op, params).await {
        Ok(data) => json!({ "ok": true, "data": data }).to_string(),
        // message 是后端给的中文，直接交给模型措辞
        Err(error) => tool_result_error(error.code, &error.message),
    };
    (Some(op.to_string()), content)
}

fn tool_result_error(code: i32, message: &str) -> String {
    json!({ "ok": false, "code": code, "message": message }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use crate::llm::{ChatResponse, LlmError};

    /// 按脚本回复的假模型，同时记下每次收到的（消息, 工具名）。
    struct ScriptedModel {
        script: Mutex<VecDeque<crate::llm::Result<ChatResponse>>>,
        seen: Mutex<Vec<(Vec<ChatMessage>, Vec<String>)>>,
    }

    impl ScriptedModel {
        fn new(script: Vec<crate::llm::Result<ChatResponse>>) -> Arc<Self> {
            Arc::new(Self {
                script: Mutex::new(script.into()),
                seen: Mutex::new(Vec::new()),
            })
        }

        fn round(&self, index: usize) -> (Vec<ChatMessage>, Vec<String>) {
            self.seen.lock().unwrap()[index].clone()
        }

        fn rounds(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
    }

    #[async_trait]
    impl TextModel for ScriptedModel {
        async fn chat(&self, request: ChatRequest) -> crate::llm::Result<ChatResponse> {
            self.seen.lock().unwrap().push((
                request.messages,
                request.tools.iter().map(|tool| tool.name.clone()).collect(),
            ));
            self.script
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(LlmError::Empty))
        }
    }

    /// 记下调用并按脚本返回的假执行器。
    struct RecordingInvoker {
        calls: Mutex<Vec<(String, Value)>>,
        result: std::result::Result<Value, ApiError>,
    }

    impl RecordingInvoker {
        fn ok() -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                result: Ok(json!({ "page": 6 })),
            }
        }

        fn failing(code: i32, message: &str) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                result: Err(ApiError {
                    code,
                    message: message.to_string(),
                }),
            }
        }

        fn calls(&self) -> Vec<(String, Value)> {
            self.calls.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl ToolInvoker for RecordingInvoker {
        async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError> {
            self.calls.lock().unwrap().push((op.to_string(), params));
            self.result.clone()
        }
    }

    fn reply(content: &str) -> crate::llm::Result<ChatResponse> {
        Ok(ChatResponse {
            content: Some(content.to_string()),
            tool_calls: Vec::new(),
            raw: format!(r#"{{"content":"{content}"}}"#),
        })
    }

    fn calls(name: &str, arguments: &str) -> crate::llm::Result<ChatResponse> {
        Ok(ChatResponse {
            content: None,
            tool_calls: vec![ToolCall {
                id: "call_1".to_string(),
                name: name.to_string(),
                arguments: arguments.to_string(),
            }],
            raw: String::from(r#"{"tool_calls":[...]}"#),
        })
    }

    /// 用真的 `ContextStore` 渲染，好让「系统提示带上现场段落」那条测试有意义。
    fn site() -> String {
        super::super::context::ContextStore::default().render()
    }

    fn tool_content(messages: &[ChatMessage]) -> String {
        messages
            .iter()
            .find_map(|message| match message {
                ChatMessage::Tool { content, .. } => Some(content.clone()),
                _ => None,
            })
            .expect("第二轮消息里应有工具结果")
    }

    #[tokio::test]
    async fn 模型不调工具时只问一次() {
        let model = ScriptedModel::new(vec![reply("现在是第 5 页")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("现在第几页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "现在是第 5 页");
        assert!(outcome.invoked.is_empty());
        assert_eq!(model.rounds(), 1);
        assert!(invoker.calls().is_empty());
    }

    #[tokio::test]
    async fn 第一轮带工具第二轮不带() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", r#"{"expect_page":5}"#),
            reply("已经翻到第 6 页"),
        ]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "已经翻到第 6 页");
        assert_eq!(outcome.invoked, vec!["ppt.next".to_string()]);
        assert_eq!(
            invoker.calls(),
            vec![("ppt.next".to_string(), json!({ "expect_page": 5 }))]
        );

        let (_, first_tools) = model.round(0);
        assert!(first_tools.contains(&"ppt_next".to_string()));
        let (second_messages, second_tools) = model.round(1);
        // 第二轮再给工具，模型容易又调一次，把 PPT 翻两页
        assert!(second_tools.is_empty());
        assert!(tool_content(&second_messages).contains(r#""ok":true"#));
    }

    #[tokio::test]
    async fn 工具执行失败时把后端中文交给模型() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", r#"{"expect_page":3}"#),
            reply("页码已经变了，我重新看一下"),
        ]);
        let invoker = RecordingInvoker::failing(40007, "当前页已变化");
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "页码已经变了，我重新看一下");
        let (second_messages, _) = model.round(1);
        let content = tool_content(&second_messages);
        assert!(content.contains(r#""ok":false"#));
        assert!(content.contains("当前页已变化"));
        assert!(content.contains("40007"));
    }

    #[tokio::test]
    async fn 幻觉出的工具名不执行只回不支持() {
        let model = ScriptedModel::new(vec![calls("ppt_burn", "{}"), reply("这个我做不到")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("烧掉课件", &site(), &invoker).await.unwrap();

        assert!(invoker.calls().is_empty(), "白名单外的工具不能真发出去");
        assert!(outcome.invoked.is_empty());
        let content = tool_content(&model.round(1).0);
        assert!(content.contains("不支持的指令"), "实际是 {content}");
    }

    #[tokio::test]
    async fn 非法参数按空参数执行() {
        let model = ScriptedModel::new(vec![calls("ppt_next", "{\"expect_page\":"), reply("好的")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        agent.handle("下一页", &site(), &invoker).await.unwrap();

        // 丢掉整条指令还不如让服务端的参数校验去报错，那样日志里能看出原因
        assert_eq!(invoker.calls(), vec![("ppt.next".to_string(), json!({}))]);
    }

    #[tokio::test]
    async fn 参数不是对象时也按空参数执行() {
        let model = ScriptedModel::new(vec![calls("tts_stop", "\"停\""), reply("好的")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        agent.handle("别念了", &site(), &invoker).await.unwrap();

        assert_eq!(invoker.calls(), vec![("tts.stop".to_string(), json!({}))]);
    }

    #[tokio::test]
    async fn 第二轮失败时指令已执行仍给兜底回复() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", "{}"),
            Err(LlmError::Timeout(15)),
        ]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.invoked, vec!["ppt.next".to_string()]);
        assert!(!outcome.reply.trim().is_empty(), "得有话可播");
    }

    #[tokio::test]
    async fn 第一轮失败时整条命令丢弃() {
        let model = ScriptedModel::new(vec![Err(LlmError::Timeout(15))]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model);

        assert!(agent.handle("下一页", &site(), &invoker).await.is_err());
        assert!(invoker.calls().is_empty());
    }

    #[tokio::test]
    async fn 模型没给回复时用兜底文案() {
        let model = ScriptedModel::new(vec![Ok(ChatResponse::default())]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model);

        let outcome = agent.handle("嗯", &site(), &invoker).await.unwrap();
        assert!(!outcome.reply.trim().is_empty());
    }

    #[tokio::test]
    async fn 系统提示带上现场段落与工具约束() {
        let model = ScriptedModel::new(vec![reply("好")]);
        let mut agent = Agent::new(model.clone());
        agent
            .handle("现在第几页", &site(), &RecordingInvoker::ok())
            .await
            .unwrap();

        let ChatMessage::System(system) = &model.round(0).0[0] else {
            panic!("首条消息必须是 system");
        };
        assert!(system.contains("[无法获取]"), "要带上现场段落");
        assert!(system.contains("expect_page"), "要交代翻页的乐观锁约束");
    }

    #[tokio::test]
    async fn 上一轮对话会进入下一轮请求() {
        let model = ScriptedModel::new(vec![reply("第 5 页"), reply("第 5 页")]);
        let mut agent = Agent::new(model.clone());
        let invoker = RecordingInvoker::ok();

        agent.handle("现在第几页", &site(), &invoker).await.unwrap();
        agent.handle("再说一次", &site(), &invoker).await.unwrap();

        let (messages, _) = model.round(1);
        assert!(messages.contains(&ChatMessage::User("现在第几页".to_string())));
        assert!(messages.contains(&ChatMessage::Assistant {
            content: Some("第 5 页".to_string()),
            tool_calls: Vec::new(),
        }));
    }

    fn turn_with_tool(index: usize) -> Vec<ChatMessage> {
        let id = format!("call_{index}");
        vec![
            ChatMessage::User(format!("命令 {index}")),
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: id.clone(),
                    name: "ppt_next".to_string(),
                    arguments: "{}".to_string(),
                }],
            },
            ChatMessage::Tool {
                call_id: id,
                content: r#"{"ok":true}"#.to_string(),
            },
            ChatMessage::Assistant {
                content: Some(format!("回复 {index}")),
                tool_calls: Vec::new(),
            },
        ]
    }

    #[test]
    fn 历史只留最近十轮() {
        let mut history = History::default();
        for index in 0..12 {
            history.push_turn(turn_with_tool(index));
        }

        let messages = history.messages();
        assert_eq!(messages.len(), HISTORY_TURNS * 4);
        assert!(messages.contains(&ChatMessage::User("命令 2".to_string())));
        assert!(!messages.contains(&ChatMessage::User("命令 1".to_string())));
    }

    #[test]
    fn 裁剪不会留下没有配对的工具结果() {
        let mut history = History::default();
        for index in 0..12 {
            history.push_turn(turn_with_tool(index));
        }

        // 每个 tool 结果都必须能在它前面找到声明了同一个 id 的 assistant 消息，
        // 否则服务端会拒掉整个请求
        let messages = history.messages();
        let mut declared: Vec<String> = Vec::new();
        for message in &messages {
            match message {
                ChatMessage::Assistant { tool_calls, .. } => {
                    declared.extend(tool_calls.iter().map(|call| call.id.clone()));
                }
                ChatMessage::Tool { call_id, .. } => {
                    assert!(declared.contains(call_id), "{call_id} 没有配对的 tool_calls");
                }
                _ => {}
            }
        }
        assert_eq!(declared.len(), HISTORY_TURNS, "每轮一个工具调用");
    }
}
