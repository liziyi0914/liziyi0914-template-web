use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

pub const CONNECTION_EVENT: &str = "platform://connection";
pub const LOG_EVENT: &str = "platform://log";

/// 字段变更必须同步修改 src/lib/platform-api/types.ts
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
    Idle,
    /// 机器人 Device Flow 等待老师扫码，桌面端不会出现
    Authorizing,
    Connecting,
    Connected,
    Reconnecting,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub state: ConnectionState,
    pub classroom_id: Option<i64>,
    pub lesson_id: Option<i64>,
    pub lesson_title: Option<String>,
    pub course_name: Option<String>,
    pub connected_at: Option<i64>,
    pub reconnect_count: u32,
    pub last_error: Option<String>,
    /// 顶号后为 true，UI 提示且不自动重连
    pub kicked: bool,
}

impl Default for ConnectionInfo {
    fn default() -> Self {
        Self {
            state: ConnectionState::Idle,
            classroom_id: None,
            lesson_id: None,
            lesson_title: None,
            course_name: None,
            connected_at: None,
            reconnect_count: 0,
            last_error: None,
            kicked: false,
        }
    }
}

/// Device Flow 待授权信息。老师看着 `user_code` 或扫二维码去网页确认。
/// 只在机器人端产生，字段变更必须同步修改 src/lib/platform-api/types.ts。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowInfo {
    pub user_code: String,
    pub verification_uri: String,
    /// 已经带上 user_code 的完整地址，二维码编码的就是这个
    pub verification_uri_complete: String,
    /// 毫秒时间戳。前端据此显示剩余时间，过期后不必再等后端
    pub expires_at: i64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LogLevel {
    Info,
    Success,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LogSource {
    Connection,
    Command,
    Agent,
    Browser,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub at: i64,
    pub level: LogLevel,
    pub source: LogSource,
    pub message: String,
    /// 折叠展示：完整帧 JSON、模型原始输出等
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

impl LogEntry {
    pub fn new(
        seq: u64,
        level: LogLevel,
        source: LogSource,
        message: String,
        detail: Option<String>,
    ) -> Self {
        let at = now_ms();
        Self {
            // 同一毫秒可能产生多条，光用时间戳当 key 会让 React 报重复
            id: format!("{at}-{seq}"),
            at,
            level,
            source,
            message,
            detail,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 连接状态序列化成小写字符串() {
        let cases = [
            (ConnectionState::Idle, "idle"),
            (ConnectionState::Authorizing, "authorizing"),
            (ConnectionState::Connecting, "connecting"),
            (ConnectionState::Connected, "connected"),
            (ConnectionState::Reconnecting, "reconnecting"),
            (ConnectionState::Disconnected, "disconnected"),
            (ConnectionState::Error, "error"),
        ];
        for (state, expected) in cases {
            assert_eq!(serde_json::to_value(state).unwrap(), expected);
        }
    }

    #[test]
    fn 连接信息用_camel_case_并保留_null() {
        let value = serde_json::to_value(ConnectionInfo::default()).unwrap();

        assert_eq!(value["state"], "idle");
        assert!(value["classroomId"].is_null());
        assert!(value["lessonTitle"].is_null());
        assert_eq!(value["reconnectCount"], 0);
        assert_eq!(value["kicked"], false);
        assert!(
            value.get("classroom_id").is_none(),
            "不能出现 snake_case 字段"
        );
    }

    #[test]
    fn 日志项没有_detail_时不输出该字段() {
        let entry = LogEntry::new(
            1,
            LogLevel::Info,
            LogSource::Connection,
            "已连接".into(),
            None,
        );
        let value = serde_json::to_value(&entry).unwrap();

        assert_eq!(value["level"], "info");
        assert_eq!(value["source"], "connection");
        assert_eq!(value["message"], "已连接");
        assert!(value.get("detail").is_none());
    }

    #[test]
    fn 日志项的_id_随序号递增且唯一() {
        let a = LogEntry::new(1, LogLevel::Warn, LogSource::Browser, "a".into(), None);
        let b = LogEntry::new(2, LogLevel::Warn, LogSource::Browser, "b".into(), None);
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn 授权信息用_camel_case_并带上完整地址() {
        let value = serde_json::to_value(DeviceFlowInfo {
            user_code: "H7K2QP".into(),
            verification_uri: "http://8.163.33.11:8084/device".into(),
            verification_uri_complete: "http://8.163.33.11:8084/device?code=H7K2QP".into(),
            expires_at: 1_754_800_000_000,
        })
        .unwrap();

        assert_eq!(value["userCode"], "H7K2QP");
        assert_eq!(value["verificationUri"], "http://8.163.33.11:8084/device");
        assert_eq!(
            value["verificationUriComplete"],
            "http://8.163.33.11:8084/device?code=H7K2QP"
        );
        assert_eq!(value["expiresAt"], 1_754_800_000_000_i64);
        assert!(value.get("user_code").is_none(), "不能出现 snake_case 字段");
    }
}
