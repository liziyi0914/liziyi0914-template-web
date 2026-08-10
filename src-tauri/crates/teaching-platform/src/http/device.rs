//! 机器人 Device Flow。流程与轮询语义见 HTTP 对接文档 §4.3。

use crate::envelope::{read_envelope, read_envelope_unit};
use crate::error::{PlatformError, Result};
use crate::http::HttpClient;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const DEVICE_TIMEOUT_SECS: u64 = 15;
/// 文档给的授权码有效期是 10 分钟。
const DEFAULT_EXPIRES_IN: u64 = 600;
const DEFAULT_INTERVAL: u64 = 5;
/// 设备 token 12 小时，且**没有刷新机制**，过期只能重走整个流程。
pub const DEVICE_TOKEN_TTL_SECS: u64 = 12 * 3600;

/// `POST /device/code` 的响应。
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DeviceCode {
    pub device_code: String,
    /// 给老师念/输入的短码。
    pub user_code: String,
    pub verification_uri: String,
    /// 已经带上 user_code 的完整地址，二维码就编码这个。
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

impl Default for DeviceCode {
    fn default() -> Self {
        Self {
            device_code: String::new(),
            user_code: String::new(),
            verification_uri: String::new(),
            verification_uri_complete: String::new(),
            expires_in: DEFAULT_EXPIRES_IN,
            interval: DEFAULT_INTERVAL,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PollStatus {
    Pending,
    SlowDown,
    Denied,
    Expired,
}

impl PollStatus {
    fn parse(raw: &str) -> Self {
        match raw {
            "slow_down" => Self::SlowDown,
            "denied" => Self::Denied,
            "expired" => Self::Expired,
            // 认不出来的一律继续轮询：多发几次请求的代价远小于让老师白扫一次码
            _ => Self::Pending,
        }
    }

    /// 终态：停止轮询，要人重新申请。
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Denied | Self::Expired)
    }
}

/// `POST /device/token` 的两种响应形态。
#[derive(Debug, Clone, PartialEq)]
pub enum DeviceTokenPoll {
    Ok {
        access_token: String,
        expires_in: u64,
        lesson_id: Option<i64>,
        classroom_id: Option<i64>,
    },
    Pending {
        status: PollStatus,
        /// 服务端建议的新间隔，没给就沿用原来的。
        interval: Option<u64>,
    },
}

impl DeviceTokenPoll {
    /// 两种形态靠有没有 `access_token` 区分，不靠 `status` 是否存在——
    /// 成功响应里本来就没有 `status`。
    pub fn from_value(data: &Value) -> Self {
        let token = data
            .get("access_token")
            .and_then(Value::as_str)
            .unwrap_or_default();

        if !token.is_empty() {
            return Self::Ok {
                access_token: token.to_string(),
                expires_in: data
                    .get("expires_in")
                    .and_then(Value::as_u64)
                    .filter(|secs| *secs > 0)
                    .unwrap_or(DEVICE_TOKEN_TTL_SECS),
                lesson_id: data.get("lesson_id").and_then(Value::as_i64),
                classroom_id: data.get("classroom_id").and_then(Value::as_i64),
            };
        }

        Self::Pending {
            status: PollStatus::parse(
                data.get("status").and_then(Value::as_str).unwrap_or_default(),
            ),
            interval: data
                .get("interval")
                .and_then(Value::as_u64)
                .filter(|secs| *secs > 0),
        }
    }
}

impl HttpClient {
    pub async fn device_code(&self, no: &str, secret: &str) -> Result<DeviceCode> {
        let response = self
            .inner()
            .post(self.api("/device/code"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .json(&json!({ "device_no": no, "device_secret": secret }))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        let code: DeviceCode = read_envelope(response).await?;

        if code.device_code.is_empty() || code.user_code.is_empty() {
            return Err(PlatformError::Decode(
                "授权码响应缺少 device_code 或 user_code".into(),
            ));
        }
        Ok(code)
    }

    /// 轮询换 token。`device_code` 换过一次即作废，拿到 token 后不要再调。
    pub async fn device_token(&self, device_code: &str) -> Result<DeviceTokenPoll> {
        let response = self
            .inner()
            .post(self.api("/device/token"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .json(&json!({ "device_code": device_code }))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        let data: Value = read_envelope(response).await?;
        Ok(DeviceTokenPoll::from_value(&data))
    }

    /// 设备自己登出，带设备 token。
    pub async fn device_logout(&self, token: &str) -> Result<()> {
        let response = self
            .inner()
            .post(self.api("/device/logout"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .bearer_auth(token)
            .json(&json!({}))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        read_envelope_unit(response).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 有_access_token_就是成功形态() {
        let poll = DeviceTokenPoll::from_value(&json!({
            "access_token": "dev-token", "expires_in": 43200,
            "lesson_id": 88, "classroom_id": 3
        }));
        assert_eq!(
            poll,
            DeviceTokenPoll::Ok {
                access_token: "dev-token".into(),
                expires_in: 43_200,
                lesson_id: Some(88),
                classroom_id: Some(3),
            }
        );
    }

    #[test]
    fn 成功形态即使带着_status_也按成功处理() {
        // 判别只看 access_token：后端将来在成功响应里加个 status 不该让客户端卡住
        let poll = DeviceTokenPoll::from_value(&json!({
            "access_token": "t", "status": "pending"
        }));
        assert!(matches!(poll, DeviceTokenPoll::Ok { .. }));
    }

    #[test]
    fn 成功形态缺_expires_in_时按_12_小时兜底() {
        let DeviceTokenPoll::Ok { expires_in, .. } =
            DeviceTokenPoll::from_value(&json!({ "access_token": "t" }))
        else {
            panic!("应为 Ok");
        };
        assert_eq!(expires_in, DEVICE_TOKEN_TTL_SECS);
    }

    #[test]
    fn 没有_access_token_就是未完成形态() {
        assert_eq!(
            DeviceTokenPoll::from_value(&json!({ "status": "pending", "interval": 5 })),
            DeviceTokenPoll::Pending {
                status: PollStatus::Pending,
                interval: Some(5)
            }
        );
    }

    #[test]
    fn access_token_是空串时按未完成处理() {
        assert!(matches!(
            DeviceTokenPoll::from_value(&json!({ "access_token": "", "status": "pending" })),
            DeviceTokenPoll::Pending { .. }
        ));
    }

    #[test]
    fn 解析四种轮询状态() {
        for (raw, expected) in [
            ("pending", PollStatus::Pending),
            ("slow_down", PollStatus::SlowDown),
            ("denied", PollStatus::Denied),
            ("expired", PollStatus::Expired),
        ] {
            let DeviceTokenPoll::Pending { status, .. } =
                DeviceTokenPoll::from_value(&json!({ "status": raw }))
            else {
                panic!("{raw} 应为 Pending 形态");
            };
            assert_eq!(status, expected);
        }
    }

    #[test]
    fn 认不出的状态按_pending_处理() {
        // 继续轮询最多浪费几次请求，直接放弃会让老师白扫一次码
        let DeviceTokenPoll::Pending { status, .. } =
            DeviceTokenPoll::from_value(&json!({ "status": "brand_new" }))
        else {
            panic!("应为 Pending 形态");
        };
        assert_eq!(status, PollStatus::Pending);
    }

    #[test]
    fn 只有拒绝与过期是终态() {
        assert!(PollStatus::Denied.is_terminal());
        assert!(PollStatus::Expired.is_terminal());
        assert!(!PollStatus::Pending.is_terminal());
        assert!(!PollStatus::SlowDown.is_terminal());
    }

    #[test]
    fn interval_为_0_时当作没给() {
        let DeviceTokenPoll::Pending { interval, .. } =
            DeviceTokenPoll::from_value(&json!({ "status": "pending", "interval": 0 }))
        else {
            panic!("应为 Pending 形态");
        };
        assert_eq!(interval, None);
    }

    #[test]
    fn 授权码响应缺字段时用默认有效期与间隔() {
        let code: DeviceCode = serde_json::from_value(json!({
            "device_code": "dc", "user_code": "ABCD"
        }))
        .unwrap();
        assert_eq!(code.expires_in, DEFAULT_EXPIRES_IN);
        assert_eq!(code.interval, DEFAULT_INTERVAL);
        assert_eq!(code.verification_uri_complete, "");
    }
}
