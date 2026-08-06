//! 本阶段的配置全部是编译期常量。密钥由 scripts/voice-env.sh 注入环境变量，
//! 该文件被 gitignore 排除，因此仓库里不会出现真实凭据。

/// 展开成一个读取构建期环境变量、缺失时回落到默认值的常量。
macro_rules! env_or {
    ($name:literal, $fallback:expr) => {
        match option_env!($name) {
            Some(value) => value,
            None => $fallback,
        }
    };
}

/// 百炼 API Key。为空时会话会在启动阶段直接失败，而不是等到握手被拒。
pub const DASHSCOPE_API_KEY: &str = env_or!("DASHSCOPE_API_KEY", "");

/// 实时语音识别的 WebSocket 端点，形如
/// `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/`。
pub const ASR_WS_URL: &str = env_or!("ASR_WS_URL", "");

pub const ASR_MODEL: &str = "fun-asr-realtime";

/// 百炼的 OpenAI 兼容端点。async-openai 会在其后自行拼 `/chat/completions`。
pub const LLM_BASE_URL: &str = env_or!(
    "LLM_BASE_URL",
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
);

pub const LLM_MODEL: &str = env_or!("LLM_MODEL", "qwen3.7-plus");

pub const WAKE_WORD: &str = "你好小财";

/// 唤醒后等待命令句的时长，超时则退回待唤醒状态。
pub const ARMED_TIMEOUT_SECS: u64 = 10;

pub const SAMPLE_RATE: u32 = 16_000;

/// 单个 PCM 帧的字节数。16 kHz 单声道 PCM16 下 6400 字节即 200 ms，
/// 取这个长度是为了把跨语言调用压到每秒 5 次。
pub const FRAME_BYTES: usize = 6_400;

/// 启动前的配置自检，返回缺失项的名字。
pub fn missing_keys() -> Vec<&'static str> {
    let mut missing = Vec::new();
    if DASHSCOPE_API_KEY.is_empty() {
        missing.push("DASHSCOPE_API_KEY");
    }
    if ASR_WS_URL.is_empty() {
        missing.push("ASR_WS_URL");
    }
    missing
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_bytes_matches_200ms_at_16khz() {
        // 16000 采样/秒 × 2 字节/采样 × 0.2 秒
        assert_eq!(FRAME_BYTES, (SAMPLE_RATE as usize) * 2 / 5);
    }

    #[test]
    fn frame_is_whole_samples() {
        assert_eq!(FRAME_BYTES % 2, 0);
    }
}
