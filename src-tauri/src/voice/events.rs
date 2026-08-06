//! 前端事件契约。改这里必须同步改 src/lib/voice/types.ts。

use serde::Serialize;

use super::error::{Stage, VoiceError};
use super::llm::prompt::VoiceCommand;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionState {
    Starting,
    Listening,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum VoiceEvent {
    State {
        state: SessionState,
    },
    Transcript {
        text: String,
        /// 句子序号，前端据此原地更新同一句的中间结果。
        index: u32,
        #[serde(rename = "final")]
        is_final: bool,
    },
    /// 命中唤醒词。同句就带出命令时也会先发这条，
    /// 前端的唤醒提示逻辑不必区分命令来自同句还是下一句。
    Wake,
    Command {
        command: VoiceCommand,
        /// 触发这条命令的 ASR 原句。
        source: String,
        /// 模型返回的原始字符串，解析失败时用于排查。
        raw: String,
    },
    Error {
        stage: Stage,
        message: String,
    },
}

impl VoiceEvent {
    pub fn error(error: &VoiceError) -> Self {
        Self::Error {
            stage: error.stage(),
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn json_of(event: VoiceEvent) -> Value {
        serde_json::to_value(event).unwrap()
    }

    #[test]
    fn state_event_matches_the_contract() {
        assert_eq!(
            json_of(VoiceEvent::State {
                state: SessionState::Listening
            }),
            json!({ "type": "state", "state": "listening" })
        );
    }

    #[test]
    fn transcript_event_uses_final_not_is_final() {
        // 前端契约里的字段名是 final，Rust 侧因为它是保留字才叫 is_final
        assert_eq!(
            json_of(VoiceEvent::Transcript {
                text: "你好小财".to_string(),
                index: 3,
                is_final: true,
            }),
            json!({ "type": "transcript", "text": "你好小财", "index": 3, "final": true })
        );
    }

    #[test]
    fn wake_event_has_no_payload() {
        assert_eq!(json_of(VoiceEvent::Wake), json!({ "type": "wake" }));
    }

    #[test]
    fn error_event_carries_the_stage_of_its_error() {
        assert_eq!(
            json_of(VoiceEvent::error(&VoiceError::PermissionDenied)),
            json!({
                "type": "error",
                "stage": "permission",
                "message": "麦克风权限被拒绝"
            })
        );
    }

    #[test]
    fn command_event_matches_the_contract() {
        let command = VoiceCommand {
            intent: "open_projector".to_string(),
            params: serde_json::Map::new(),
            reply: "好的".to_string(),
        };
        assert_eq!(
            json_of(VoiceEvent::Command {
                command,
                source: "打开投影仪".to_string(),
                raw: "{}".to_string(),
            }),
            json!({
                "type": "command",
                "command": { "intent": "open_projector", "params": {}, "reply": "好的" },
                "source": "打开投影仪",
                "raw": "{}"
            })
        );
    }
}
