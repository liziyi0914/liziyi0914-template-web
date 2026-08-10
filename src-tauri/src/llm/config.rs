//! LLM 的编译期常量。密钥由 scripts/voice-env.sh 注入构建期环境变量。
//!
//! 与 `voice/config.rs` 各自 `option_env!` 读同一个 `DASHSCOPE_API_KEY`：
//! ASR 与 LLM 用的是同一个百炼账号，但两个模块不该因此互相依赖。

/// 为空时构造模型直接失败，而不是等到请求被拒。
pub const DASHSCOPE_API_KEY: &str = match option_env!("DASHSCOPE_API_KEY") {
    Some(value) => value,
    None => "",
};

/// 百炼的 OpenAI 兼容端点。async-openai 会在其后自行拼 `/chat/completions`。
pub const BASE_URL: &str = match option_env!("LLM_BASE_URL") {
    Some(value) => value,
    None => "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

pub const MODEL: &str = match option_env!("LLM_MODEL") {
    Some(value) => value,
    None => "qwen3.7-plus",
};

/// 单次请求的等待上限。工具循环最多两轮，所以最坏等两倍。
pub const TIMEOUT_SECS: u64 = 15;
