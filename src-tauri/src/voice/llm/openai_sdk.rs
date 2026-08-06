//! SDK 调用层。用 async-openai 对接百炼的 OpenAI 兼容端点。
//!
//! OpenAI 官方没有 Rust SDK，async-openai 是 OpenAI 文档中列出的社区库，
//! 选型理由见设计文档。

use std::time::Duration;

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs, ResponseFormat,
};
use async_openai::Client;
use async_trait::async_trait;

use super::{ChatRequest, TextModel};
use crate::voice::config;
use crate::voice::error::{Result, Stage, VoiceError};
use crate::voice::tls;

pub struct OpenAiCompatibleModel {
    client: Client<OpenAIConfig>,
    model: String,
    timeout: Duration,
}

impl OpenAiCompatibleModel {
    pub fn from_config() -> Result<Self> {
        if config::DASHSCOPE_API_KEY.is_empty() {
            return Err(VoiceError::Config {
                key: "DASHSCOPE_API_KEY",
                stage: Stage::Llm,
            });
        }

        // 必须注入自建 TLS 的客户端：默认客户端会走 rustls-platform-verifier，
        // 那玩意在安卓上没做 JNI 初始化会 panic
        let http = tls::http_client()
            .map_err(|e| VoiceError::Llm(format!("构造 HTTP 客户端失败：{e}")))?;

        let openai = OpenAIConfig::new()
            .with_api_base(config::LLM_BASE_URL)
            .with_api_key(config::DASHSCOPE_API_KEY);

        Ok(Self {
            client: Client::build(http, openai),
            model: config::LLM_MODEL.to_string(),
            timeout: Duration::from_secs(config::LLM_TIMEOUT_SECS),
        })
    }
}

#[async_trait]
impl TextModel for OpenAiCompatibleModel {
    async fn complete(&self, request: ChatRequest) -> Result<String> {
        let system = ChatCompletionRequestSystemMessageArgs::default()
            .content(request.system)
            .build()
            .map_err(|e| VoiceError::Llm(format!("组装 system 消息失败：{e}")))?;
        let user = ChatCompletionRequestUserMessageArgs::default()
            .content(request.user)
            .build()
            .map_err(|e| VoiceError::Llm(format!("组装 user 消息失败：{e}")))?;

        let mut builder = CreateChatCompletionRequestArgs::default();
        builder
            .model(self.model.as_str())
            .messages(vec![system.into(), user.into()]);
        if request.json_mode {
            // 用 json_object 而非 json_schema：百炼兼容模式对后者支持不稳定，
            // schema 改在 system 提示里描述
            builder.response_format(ResponseFormat::JsonObject);
        }
        let payload = builder
            .build()
            .map_err(|e| VoiceError::Llm(format!("组装请求失败：{e}")))?;

        let response = tokio::time::timeout(self.timeout, self.client.chat().create(payload))
            .await
            .map_err(|_| VoiceError::Llm("命令解析超时".to_string()))?
            .map_err(|e| VoiceError::Llm(format!("命令解析请求失败：{e}")))?;

        response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| VoiceError::Llm("模型没有返回内容".to_string()))
    }
}
