//! Device Flow 编排。流程与轮询语义见 HTTP 对接文档 §4.3。
//!
//! 设备 token 12 小时且没有刷新机制，过期只能重走整个流程。

use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use teaching_platform::error::{PlatformError, Result};
use teaching_platform::http::device::{DeviceCode, DeviceTokenPoll, PollStatus};
use teaching_platform::http::HttpClient;

use crate::platform::config::RobotConfig;
use crate::platform::events::{now_ms, ConnectionState, DeviceFlowInfo, LogLevel, LogSource};
use crate::platform::state::PlatformState;

/// 轮询间隔的上限。服务端要是给了个离谱的值，照它做等于放弃轮询。
const MAX_INTERVAL: Duration = Duration::from_secs(30);

/// 授权成功后拿到的东西。
pub struct DeviceSession {
    pub access_token: String,
    /// 秒。到期没有刷新可用，只能重走 Device Flow
    pub expires_in: u64,
    pub lesson_id: Option<i64>,
    pub classroom_id: Option<i64>,
}

/// 走完一次 Device Flow。返回 `Err` 且 `is_credential()` 为真时不要自动重来。
pub async fn authorize(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &RobotConfig,
) -> Result<DeviceSession> {
    let code = http
        .device_code(&config.device_no, &config.device_secret)
        .await?;
    let info = info_of(&code);

    state.set_device_flow(Some(info.clone()));
    state.update(app, |connection| {
        connection.state = ConnectionState::Authorizing;
        connection.last_error = None;
    });
    state.log(
        app,
        LogLevel::Info,
        LogSource::Connection,
        format!("等待授权，授权码 {}", info.user_code),
        Some(info.verification_uri_complete.clone()),
    );

    let mut interval = Duration::from_secs(code.interval.max(1));
    let deadline = tokio::time::Instant::now() + Duration::from_secs(code.expires_in);

    loop {
        tokio::time::sleep(interval).await;

        if tokio::time::Instant::now() >= deadline {
            return Err(give_up(app, state, "授权码已过期，请重新申请"));
        }

        match http.device_token(&code.device_code).await {
            Ok(DeviceTokenPoll::Ok {
                access_token,
                expires_in,
                lesson_id,
                classroom_id,
            }) => {
                state.set_device_flow(None);
                state.log(
                    app,
                    LogLevel::Success,
                    LogSource::Connection,
                    "设备授权成功",
                    None,
                );
                return Ok(DeviceSession {
                    access_token,
                    expires_in,
                    lesson_id,
                    classroom_id,
                });
            }

            Ok(DeviceTokenPoll::Pending {
                status,
                interval: suggested,
            }) => {
                if status.is_terminal() {
                    let message = match status {
                        PollStatus::Denied => "老师拒绝了这次授权，请重新申请",
                        _ => "授权码已过期，请重新申请",
                    };
                    return Err(give_up(app, state, message));
                }
                interval = next_interval(interval, status, suggested);
            }

            // 轮询期间的网络抖动不该让老师白扫一次码
            Err(error) if error.is_transient() => {
                log::warn!("轮询设备 token 失败，继续等待：{error}");
            }

            Err(error) => {
                state.set_device_flow(None);
                return Err(error);
            }
        }
    }
}

/// 清掉待授权信息、记一条错误日志，并给出一个「不要自动重来」的错误。
fn give_up(app: &AppHandle, state: &Arc<PlatformState>, message: &str) -> PlatformError {
    state.set_device_flow(None);
    state.log(app, LogLevel::Error, LogSource::Connection, message, None);
    refuse(message)
}

/// 用 403 表达「不要自动重来」：连接循环把 `is_credential()` 当停止信号。
fn refuse(message: impl Into<String>) -> PlatformError {
    PlatformError::Status {
        status: 403,
        message: message.into(),
    }
}

fn next_interval(current: Duration, status: PollStatus, suggested: Option<u64>) -> Duration {
    let base = match suggested {
        Some(secs) => Duration::from_secs(secs),
        None if status == PollStatus::SlowDown => current + Duration::from_secs(1),
        None => current,
    };
    base.min(MAX_INTERVAL)
}

fn info_of(code: &DeviceCode) -> DeviceFlowInfo {
    let complete = if code.verification_uri_complete.trim().is_empty() {
        code.verification_uri.clone()
    } else {
        code.verification_uri_complete.clone()
    };

    DeviceFlowInfo {
        user_code: code.user_code.clone(),
        verification_uri: code.verification_uri.clone(),
        verification_uri_complete: complete,
        expires_at: now_ms() + (code.expires_in as i64) * 1_000,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use teaching_platform::http::device::{DeviceCode, PollStatus};

    fn code() -> DeviceCode {
        DeviceCode {
            device_code: "dc".into(),
            user_code: "H7K2QP".into(),
            verification_uri: "http://h:8084/device".into(),
            verification_uri_complete: "http://h:8084/device?code=H7K2QP".into(),
            expires_in: 600,
            interval: 5,
        }
    }

    #[test]
    fn 待授权时间隔不变() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::Pending, None),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn 收到_slow_down_时间隔加一秒() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::SlowDown, None),
            Duration::from_secs(6)
        );
    }

    #[test]
    fn 服务端给了间隔就照它的来() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::SlowDown, Some(12)),
            Duration::from_secs(12)
        );
    }

    #[test]
    fn 间隔有上限免得实际上放弃轮询() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::Pending, Some(600)),
            MAX_INTERVAL
        );
    }

    #[test]
    fn 授权信息取完整地址与短码() {
        let info = info_of(&code());
        assert_eq!(info.user_code, "H7K2QP");
        assert_eq!(
            info.verification_uri_complete,
            "http://h:8084/device?code=H7K2QP"
        );
    }

    #[test]
    fn 后端没给完整地址时退回裸地址() {
        // 扫出来还得手动输码，但总比给前端一个空串好
        let info = info_of(&DeviceCode {
            verification_uri_complete: "  ".into(),
            ..code()
        });
        assert_eq!(info.verification_uri_complete, "http://h:8084/device");
    }

    #[test]
    fn 过期时间是当前时间加有效期() {
        let info = info_of(&code());
        let now = crate::platform::events::now_ms();
        assert!(info.expires_at > now, "过期时间必须在将来");
        assert!(info.expires_at <= now + 600_000);
    }

    #[test]
    fn 拒绝与过期被标成凭证错误好让重连循环停下() {
        assert!(refuse("老师拒绝了这次授权").is_credential());
    }
}
