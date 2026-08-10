//! Text 模型抽象层。调用方只见本模块的中立类型，
//! async-openai 只出现在 `openai_sdk.rs`，这样上层测试能用假模型。

pub mod config;
pub mod openai_sdk;

use async_trait::async_trait;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("缺少配置项 {0}，请检查 scripts/voice-env.sh")]
    Config(&'static str),

    #[error("模型调用失败：{0}")]
    Transport(String),

    #[error("模型 {0} 秒内没有响应")]
    Timeout(u64),

    #[error("模型既没给回复也没给工具调用")]
    Empty,
}

pub type Result<T> = std::result::Result<T, LlmError>;

/// 模型请求的一次工具调用。`arguments` 保留模型给的原始字符串而不是解析成
/// `Value`：模型经常输出不合法 JSON，解析失败时要把原文回给它让它自己改。
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ChatMessage {
    System(String),
    User(String),
    /// 模型上一轮的回复。带工具调用时 `content` 往往是 `None`
    Assistant {
        content: Option<String>,
        tool_calls: Vec<ToolCall>,
    },
    /// 工具执行结果。`call_id` 必须与对应 `ToolCall` 的 id 一致，否则服务端会 400
    Tool {
        call_id: String,
        content: String,
    },
}

/// 一个工具的声明。`parameters` 是 JSON Schema（`type: object`）。
#[derive(Debug, Clone, PartialEq)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    /// 空表示这轮不给工具，模型只能出文本
    pub tools: Vec<ToolSpec>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    /// 模型这条回复的原始 JSON，写进日志 detail 供排查
    pub raw: String,
}

#[async_trait]
pub trait TextModel: Send + Sync {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse>;
}
