use crate::envelope::read_envelope;
use crate::error::{PlatformError, Result};
use crate::http::HttpClient;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

const TOKEN_TIMEOUT_SECS: u64 = 15;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ScreenToken {
    pub access_token: String,
    pub expires_in: u64,
    pub ws_url: String,
    pub is_app: bool,
    pub classroom_id: Option<i64>,
    pub lesson_id: Option<i64>,
}

impl Default for ScreenToken {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            // 文档给的大屏 token 有效期是 24 小时，缺字段时按此兜底
            expires_in: 86_400,
            ws_url: "/ws/app".to_string(),
            is_app: true,
            classroom_id: None,
            lesson_id: None,
        }
    }
}

impl HttpClient {
    pub async fn screen_token(&self, app_key: &str, app_secret: &str) -> Result<ScreenToken> {
        let response = self
            .inner()
            .post(self.api("/screen/token"))
            .timeout(Duration::from_secs(TOKEN_TIMEOUT_SECS))
            .json(&json!({ "app_key": app_key, "app_secret": app_secret }))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        let token: ScreenToken = read_envelope(response).await?;

        if token.access_token.is_empty() {
            return Err(PlatformError::Decode("换票响应缺少 access_token".into()));
        }
        Ok(token)
    }
}
