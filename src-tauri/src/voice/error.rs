//! 错误按「前端需要区别对待的环节」分类：麦克风没权限要引导用户去设置，
//! LLM 超时只需提示重说一次，两者不能糊成同一个 message。

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Permission,
    Audio,
    Asr,
    Llm,
}

#[derive(Debug, thiserror::Error)]
pub enum VoiceError {
    #[error("麦克风权限被拒绝")]
    PermissionDenied,

    #[error("录音失败：{0}")]
    Audio(String),

    #[error("语音识别失败：{0}")]
    Asr(String),

    #[error("命令解析失败：{0}")]
    Llm(String),

    #[error("缺少配置项 {key}，请检查 scripts/voice-env.sh")]
    Config { key: &'static str, stage: Stage },
}

impl VoiceError {
    pub fn stage(&self) -> Stage {
        match self {
            Self::PermissionDenied => Stage::Permission,
            Self::Audio(_) => Stage::Audio,
            Self::Asr(_) => Stage::Asr,
            Self::Llm(_) => Stage::Llm,
            Self::Config { stage, .. } => *stage,
        }
    }

    pub fn audio(source: impl std::fmt::Display) -> Self {
        Self::Audio(source.to_string())
    }

    pub fn asr(source: impl std::fmt::Display) -> Self {
        Self::Asr(source.to_string())
    }

    pub fn llm(source: impl std::fmt::Display) -> Self {
        Self::Llm(source.to_string())
    }
}

pub type Result<T> = std::result::Result<T, VoiceError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_serializes_to_frontend_literals() {
        let json = serde_json::to_string(&Stage::Permission).unwrap();
        assert_eq!(json, "\"permission\"");
        assert_eq!(serde_json::to_string(&Stage::Asr).unwrap(), "\"asr\"");
        assert_eq!(serde_json::to_string(&Stage::Llm).unwrap(), "\"llm\"");
        assert_eq!(serde_json::to_string(&Stage::Audio).unwrap(), "\"audio\"");
    }

    #[test]
    fn config_error_carries_its_stage() {
        let err = VoiceError::Config {
            key: "ASR_WS_URL",
            stage: Stage::Asr,
        };
        assert_eq!(err.stage(), Stage::Asr);
        assert!(err.to_string().contains("ASR_WS_URL"));
    }
}
