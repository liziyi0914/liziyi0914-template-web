//! Text 模型抽象层。提示词组装与 SDK 调用互不知情，只通过 `ChatRequest` 相接。

pub mod openai_sdk;
pub mod prompt;

use async_trait::async_trait;

use crate::voice::error::Result;

pub struct ChatRequest {
    pub system: String,
    pub user: String,
    /// 要求模型只输出 JSON 对象。
    pub json_mode: bool,
}

#[async_trait]
pub trait TextModel: Send + Sync {
    async fn complete(&self, request: ChatRequest) -> Result<String>;
}
