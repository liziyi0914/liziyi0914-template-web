//! SDK 调用层。用 async-openai 对接百炼的 OpenAI 兼容端点。
//!
//! OpenAI 官方没有 Rust SDK，async-openai 是 OpenAI 文档中列出的社区库，
//! 选型理由见设计文档。本文件是整个项目里唯一 import async-openai 的地方。

use std::time::Duration;

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionMessageToolCall, ChatCompletionMessageToolCalls,
    ChatCompletionRequestAssistantMessage, ChatCompletionRequestAssistantMessageContent,
    ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
    ChatCompletionRequestSystemMessageContent, ChatCompletionRequestToolMessage,
    ChatCompletionRequestToolMessageContent, ChatCompletionRequestUserMessage,
    ChatCompletionRequestUserMessageContent, ChatCompletionResponseMessage, ChatCompletionTool,
    ChatCompletionTools, CreateChatCompletionRequestArgs, FunctionCall, FunctionObject,
};
use async_openai::Client;
use async_trait::async_trait;

use super::config;
use super::{
    ChatMessage, ChatRequest, ChatResponse, LlmError, Result, TextModel, ToolCall, ToolSpec,
};

pub struct OpenAiCompatibleModel {
    client: Client<OpenAIConfig>,
    model: String,
    timeout: Duration,
}

impl OpenAiCompatibleModel {
    pub fn from_config() -> Result<Self> {
        if config::DASHSCOPE_API_KEY.is_empty() {
            return Err(LlmError::Config("DASHSCOPE_API_KEY"));
        }

        // 必须注入自建 TLS 的客户端：默认客户端会走 rustls-platform-verifier，
        // 那玩意在安卓上没做 JNI 初始化会 panic
        let http = crate::voice::tls::http_client()
            .map_err(|e| LlmError::Transport(format!("构造 HTTP 客户端失败：{e}")))?;

        let openai = OpenAIConfig::new()
            .with_api_base(config::BASE_URL)
            .with_api_key(config::DASHSCOPE_API_KEY);

        Ok(Self {
            client: Client::build(http, openai),
            model: config::MODEL.to_string(),
            timeout: Duration::from_secs(config::TIMEOUT_SECS),
        })
    }
}

#[async_trait]
impl TextModel for OpenAiCompatibleModel {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let messages: Vec<ChatCompletionRequestMessage> =
            request.messages.into_iter().map(to_message).collect();

        let mut builder = CreateChatCompletionRequestArgs::default();
        builder.model(self.model.as_str()).messages(messages);
        if !request.tools.is_empty() {
            // 空数组会被部分兼容端点当成参数错误，没有工具时干脆不带这个字段
            let tools: Vec<ChatCompletionTools> =
                request.tools.into_iter().map(to_tool).collect();
            builder.tools(tools);
        }
        let payload = builder
            .build()
            .map_err(|e| LlmError::Transport(format!("组装请求失败：{e}")))?;

        let response = tokio::time::timeout(self.timeout, self.client.chat().create(payload))
            .await
            .map_err(|_| LlmError::Timeout(config::TIMEOUT_SECS))?
            .map_err(|e| LlmError::Transport(e.to_string()))?;

        let message = response
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message)
            .ok_or(LlmError::Empty)?;

        Ok(from_response(message))
    }
}

fn to_message(message: ChatMessage) -> ChatCompletionRequestMessage {
    match message {
        ChatMessage::System(text) => {
            ChatCompletionRequestMessage::System(ChatCompletionRequestSystemMessage {
                content: ChatCompletionRequestSystemMessageContent::Text(text),
                name: None,
            })
        }
        ChatMessage::User(text) => {
            ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
                content: ChatCompletionRequestUserMessageContent::Text(text),
                name: None,
            })
        }
        ChatMessage::Assistant {
            content,
            tool_calls,
        } => {
            ChatCompletionRequestMessage::Assistant(ChatCompletionRequestAssistantMessage {
                content: content.map(ChatCompletionRequestAssistantMessageContent::Text),
                // 用 Default 补齐其余字段：结构里有个 deprecated 的 function_call，
                // 显式写出来会引来 warning
                tool_calls: (!tool_calls.is_empty()).then(|| {
                    tool_calls
                        .into_iter()
                        .map(|call| {
                            ChatCompletionMessageToolCalls::Function(
                                ChatCompletionMessageToolCall {
                                    id: call.id,
                                    function: FunctionCall {
                                        name: call.name,
                                        arguments: call.arguments,
                                    },
                                },
                            )
                        })
                        .collect()
                }),
                ..Default::default()
            })
        }
        ChatMessage::Tool { call_id, content } => {
            ChatCompletionRequestMessage::Tool(ChatCompletionRequestToolMessage {
                content: ChatCompletionRequestToolMessageContent::Text(content),
                tool_call_id: call_id,
            })
        }
    }
}

fn to_tool(spec: ToolSpec) -> ChatCompletionTools {
    ChatCompletionTools::Function(ChatCompletionTool {
        function: FunctionObject {
            name: spec.name,
            description: Some(spec.description),
            parameters: Some(spec.parameters),
            // 不开 strict：百炼兼容模式对 structured outputs 支持不稳定，
            // 参数合法性由我们自己在 agent 里校验
            strict: None,
        },
    })
}

fn from_response(message: ChatCompletionResponseMessage) -> ChatResponse {
    // 先留一份原文再拆结构：模型跑偏时日志里只有这个能看
    let raw = serde_json::to_string(&message).unwrap_or_default();

    ChatResponse {
        raw,
        content: message
            .content
            .filter(|text| !text.trim().is_empty())
            .map(|text| text.trim().to_string()),
        tool_calls: message
            .tool_calls
            .unwrap_or_default()
            .into_iter()
            .filter_map(|call| match call {
                ChatCompletionMessageToolCalls::Function(function) => Some(ToolCall {
                    id: function.id,
                    name: function.function.name,
                    arguments: function.function.arguments,
                }),
                // 我们只声明 function 工具，custom 只能是模型跑偏
                ChatCompletionMessageToolCalls::Custom(_) => None,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn wire(message: ChatMessage) -> serde_json::Value {
        serde_json::to_value(to_message(message)).unwrap()
    }

    #[test]
    fn system_and_user_messages_carry_plain_text() {
        assert_eq!(
            wire(ChatMessage::System("你是教室机器人".into())),
            json!({ "role": "system", "content": "你是教室机器人" })
        );
        assert_eq!(
            wire(ChatMessage::User("翻到下一页".into())),
            json!({ "role": "user", "content": "翻到下一页" })
        );
    }

    #[test]
    fn assistant_tool_calls_use_the_openai_shape() {
        assert_eq!(
            wire(ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: "call_1".into(),
                    name: "ppt_next".into(),
                    arguments: r#"{"expect_page":3}"#.into(),
                }],
            }),
            json!({
                "role": "assistant",
                "tool_calls": [{
                    "type": "function",
                    "id": "call_1",
                    "function": { "name": "ppt_next", "arguments": r#"{"expect_page":3}"# }
                }]
            })
        );
    }

    #[test]
    fn assistant_without_tool_calls_omits_the_field() {
        // 带上空数组有些兼容端点会 400
        assert_eq!(
            wire(ChatMessage::Assistant {
                content: Some("好的".into()),
                tool_calls: Vec::new(),
            }),
            json!({ "role": "assistant", "content": "好的" })
        );
    }

    #[test]
    fn tool_result_is_keyed_by_tool_call_id() {
        assert_eq!(
            wire(ChatMessage::Tool {
                call_id: "call_1".into(),
                content: r#"{"ok":true}"#.into(),
            }),
            json!({
                "role": "tool",
                "content": r#"{"ok":true}"#,
                "tool_call_id": "call_1"
            })
        );
    }

    #[test]
    fn tool_spec_becomes_a_function_tool() {
        let tool = to_tool(ToolSpec {
            name: "ppt_goto".into(),
            description: "跳到指定页".into(),
            parameters: json!({ "type": "object", "properties": {} }),
        });
        assert_eq!(
            serde_json::to_value(tool).unwrap(),
            json!({
                "type": "function",
                "function": {
                    "name": "ppt_goto",
                    "description": "跳到指定页",
                    "parameters": { "type": "object", "properties": {} }
                }
            })
        );
    }

    fn response_of(raw: serde_json::Value) -> ChatResponse {
        from_response(serde_json::from_value(raw).unwrap())
    }

    #[test]
    fn reads_plain_text_replies() {
        let response = response_of(json!({ "role": "assistant", "content": "已经翻页了" }));
        assert_eq!(response.content.as_deref(), Some("已经翻页了"));
        assert!(response.tool_calls.is_empty());
    }

    #[test]
    fn keeps_the_raw_message_for_logging() {
        // 排查模型跑偏时唯一能看的东西，不能因为解析成结构体就把原文丢了
        let response = response_of(json!({ "role": "assistant", "content": "已经翻页了" }));
        assert!(
            response.raw.contains("已经翻页了"),
            "raw 应保留原始 JSON，实际是 {}",
            response.raw
        );
    }

    #[test]
    fn reads_tool_calls() {
        let response = response_of(json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [{
                "type": "function",
                "id": "call_9",
                "function": { "name": "tts_speak", "arguments": "{\"text\":\"你好\"}" }
            }]
        }));
        assert_eq!(response.content, None);
        assert_eq!(
            response.tool_calls,
            vec![ToolCall {
                id: "call_9".into(),
                name: "tts_speak".into(),
                arguments: "{\"text\":\"你好\"}".into(),
            }]
        );
    }

    #[test]
    fn blank_content_counts_as_no_text() {
        // 带工具调用时模型常给个空串，当成有回复会让 Agent 播一句空话
        let response = response_of(json!({ "role": "assistant", "content": "   " }));
        assert_eq!(response.content, None);
    }

    #[test]
    fn ignores_custom_tool_calls() {
        // 我们只声明 function 工具，出现 custom 只能是模型跑偏，忽略比 panic 好
        let response = response_of(json!({
            "role": "assistant",
            "content": "在想",
            "tool_calls": [{
                "type": "custom",
                "id": "call_x",
                "custom_tool": { "name": "whatever", "input": "hi" }
            }]
        }));
        assert_eq!(response.content.as_deref(), Some("在想"));
        assert!(response.tool_calls.is_empty());
    }
}
