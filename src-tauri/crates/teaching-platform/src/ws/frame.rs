use crate::error::{PlatformError, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    Req {
        package_id: String,
        op: String,
        ts: i64,
        params: Value,
    },
    Ack {
        package_id: String,
        op: String,
        ts: i64,
        data: Value,
    },
    Error {
        package_id: String,
        op: String,
        ts: i64,
        code: i32,
        message: String,
    },
    Event {
        package_id: String,
        op: String,
        ts: i64,
        data: Value,
    },
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

pub fn new_package_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Deserialize)]
struct RawFrame {
    #[serde(rename = "packageId", default)]
    package_id: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    op: String,
    #[serde(default)]
    ts: i64,
    #[serde(default)]
    params: Option<Value>,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    code: Option<i32>,
    #[serde(default)]
    message: Option<String>,
}

/// 字段缺失与显式 null 都归一成空对象，下游不必到处判空。
fn payload(value: Option<Value>) -> Value {
    match value {
        Some(Value::Null) | None => json!({}),
        Some(value) => value,
    }
}

impl Frame {
    pub fn req(op: impl Into<String>, params: Value) -> Self {
        Self::Req {
            package_id: new_package_id(),
            op: op.into(),
            ts: now_ms(),
            params,
        }
    }

    pub fn ack(package_id: String, op: String, data: Value) -> Self {
        Self::Ack {
            package_id,
            op,
            ts: now_ms(),
            data,
        }
    }

    pub fn error(package_id: String, op: String, code: i32, message: String) -> Self {
        Self::Error {
            package_id,
            op,
            ts: now_ms(),
            code,
            message,
        }
    }

    pub fn package_id(&self) -> &str {
        match self {
            Self::Req { package_id, .. }
            | Self::Ack { package_id, .. }
            | Self::Error { package_id, .. }
            | Self::Event { package_id, .. } => package_id,
        }
    }

    pub fn op(&self) -> &str {
        match self {
            Self::Req { op, .. }
            | Self::Ack { op, .. }
            | Self::Error { op, .. }
            | Self::Event { op, .. } => op,
        }
    }

    /// req 取 params，ack / event 取 data，error 没有载荷时给空对象
    pub fn params_or_data(&self) -> &Value {
        static EMPTY: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
        match self {
            Self::Req { params, .. } => params,
            Self::Ack { data, .. } | Self::Event { data, .. } => data,
            Self::Error { .. } => EMPTY.get_or_init(|| json!({})),
        }
    }

    pub fn decode(raw: &str) -> Result<Self> {
        let frame: RawFrame = serde_json::from_str(raw)
            .map_err(|e| PlatformError::Decode(format!("无法解析帧：{e}")))?;

        Ok(match frame.kind.as_str() {
            "req" => Self::Req {
                package_id: frame.package_id,
                op: frame.op,
                ts: frame.ts,
                params: payload(frame.params),
            },
            "ack" => Self::Ack {
                package_id: frame.package_id,
                op: frame.op,
                ts: frame.ts,
                data: payload(frame.data),
            },
            "error" => Self::Error {
                package_id: frame.package_id,
                op: frame.op,
                ts: frame.ts,
                code: frame.code.unwrap_or_default(),
                message: frame.message.unwrap_or_default(),
            },
            "event" => Self::Event {
                package_id: frame.package_id,
                op: frame.op,
                ts: frame.ts,
                data: payload(frame.data),
            },
            other => return Err(PlatformError::Decode(format!("未知的帧类型：{other}"))),
        })
    }

    pub fn encode(&self) -> String {
        let value = match self {
            Self::Req {
                package_id,
                op,
                ts,
                params,
            } => json!({
                "packageId": package_id, "type": "req", "op": op, "ts": ts, "params": params
            }),
            Self::Ack {
                package_id,
                op,
                ts,
                data,
            } => json!({
                "packageId": package_id, "type": "ack", "op": op, "ts": ts, "data": data
            }),
            Self::Error {
                package_id,
                op,
                ts,
                code,
                message,
            } => json!({
                "packageId": package_id, "type": "error", "op": op, "ts": ts,
                "code": code, "message": message
            }),
            Self::Event {
                package_id,
                op,
                ts,
                data,
            } => json!({
                "packageId": package_id, "type": "event", "op": op, "ts": ts, "data": data
            }),
        };
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 解析_req_帧() {
        let raw = r#"{"packageId":"p1","type":"req","op":"app.open_url","ts":17,
                      "params":{"url":"https://x"}}"#;
        assert_eq!(
            Frame::decode(raw).unwrap(),
            Frame::Req {
                package_id: "p1".into(),
                op: "app.open_url".into(),
                ts: 17,
                params: json!({ "url": "https://x" }),
            }
        );
    }

    #[test]
    fn 解析_ack_帧() {
        let raw = r#"{"packageId":"p2","type":"ack","op":"auth.login","ts":18,
                      "data":{"conn_id":"c1"}}"#;
        assert_eq!(
            Frame::decode(raw).unwrap(),
            Frame::Ack {
                package_id: "p2".into(),
                op: "auth.login".into(),
                ts: 18,
                data: json!({ "conn_id": "c1" }),
            }
        );
    }

    #[test]
    fn 解析_error_帧() {
        let raw = r#"{"packageId":"p3","type":"error","op":"ppt.goto","ts":19,
                      "code":40006,"message":"不支持的指令"}"#;
        assert_eq!(
            Frame::decode(raw).unwrap(),
            Frame::Error {
                package_id: "p3".into(),
                op: "ppt.goto".into(),
                ts: 19,
                code: 40006,
                message: "不支持的指令".into(),
            }
        );
    }

    #[test]
    fn 解析_event_帧() {
        let raw = r#"{"packageId":"p4","type":"event","op":"conn.kicked","ts":20,
                      "data":{"reason":"别处登录"}}"#;
        assert_eq!(
            Frame::decode(raw).unwrap(),
            Frame::Event {
                package_id: "p4".into(),
                op: "conn.kicked".into(),
                ts: 20,
                data: json!({ "reason": "别处登录" }),
            }
        );
    }

    #[test]
    fn params_与_data_缺省成空对象() {
        let req =
            Frame::decode(r#"{"packageId":"p5","type":"req","op":"conn.ping","ts":1}"#).unwrap();
        assert_eq!(
            req,
            Frame::Req {
                package_id: "p5".into(),
                op: "conn.ping".into(),
                ts: 1,
                params: json!({})
            }
        );

        let ack =
            Frame::decode(r#"{"packageId":"p6","type":"ack","op":"conn.pong","ts":2}"#).unwrap();
        assert_eq!(
            ack,
            Frame::Ack {
                package_id: "p6".into(),
                op: "conn.pong".into(),
                ts: 2,
                data: json!({})
            }
        );
    }

    #[test]
    fn 显式_null_的_params_也当作空对象() {
        let frame =
            Frame::decode(r#"{"packageId":"p7","type":"req","op":"x","ts":1,"params":null}"#)
                .unwrap();
        assert_eq!(frame.params_or_data(), &json!({}));
    }

    #[test]
    fn 未知_type_报解析错误() {
        assert!(Frame::decode(r#"{"packageId":"p8","type":"heartbeat","op":"x","ts":1}"#).is_err());
    }

    #[test]
    fn 非法_json_报解析错误() {
        assert!(Frame::decode("这不是 json").is_err());
    }

    #[test]
    fn 出站_req_用_camel_case_的_package_id() {
        let frame = Frame::req("conn.ping", json!({}));
        let parsed: serde_json::Value = serde_json::from_str(&frame.encode()).unwrap();

        assert!(parsed.get("packageId").is_some(), "字段名必须是 packageId");
        assert!(parsed.get("package_id").is_none());
        assert_eq!(parsed["type"], "req");
        assert_eq!(parsed["op"], "conn.ping");
        assert!(parsed["ts"].as_i64().unwrap() > 1_700_000_000_000);
    }

    #[test]
    fn 每条出站_req_的_package_id_都不同() {
        // 服务端按 packageId 去重最近 200 条，复用会被直接丢弃
        let a = Frame::req("conn.ping", json!({}));
        let b = Frame::req("conn.ping", json!({}));
        assert_ne!(a.package_id(), b.package_id());
    }

    #[test]
    fn 编码后能原样解回来() {
        for frame in [
            Frame::req("app.status", json!({ "a": 1 })),
            Frame::ack("p9".into(), "app.status".into(), json!({ "ok": true })),
            Frame::error(
                "p10".into(),
                "app.open_url".into(),
                50001,
                "拉起失败".into(),
            ),
        ] {
            assert_eq!(Frame::decode(&frame.encode()).unwrap(), frame);
        }
    }
}
