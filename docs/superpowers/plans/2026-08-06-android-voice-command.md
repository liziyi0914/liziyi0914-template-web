# 安卓端语音唤醒与命令识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在安卓端向前端暴露 `startASR` / `stopASR` 与 `onCommand` 回调，实现「麦克风 → Fun-ASR-Realtime 实时识别 → 唤醒词『你好小财』→ qwen3.7-plus 解析结构化命令」的完整链路，并提供一个 demo 页面观察全过程。

**Architecture:** Kotlin 插件只负责 `AudioRecord` 采集，PCM 以 base64 经 `tauri::ipc::Channel` 推给 Rust；Rust 侧分两条链路，链路一是「录音 → ASR 抽象层 → WS 协议层」，链路二是「提示词组装 → Text 模型抽象层 → SDK 调用层」，`session.rs` 是唯一同时持有两条链路的编排器。前端通过一条 `Channel<VoiceEvent>` 接收所有事件并分发成回调。

**Tech Stack:** Tauri 2.11 / Rust 1.96 / tokio-tungstenite 0.29 / async-openai 0.41 / rustls 0.23 + webpki-roots 1.0 / Kotlin AudioRecord / React 19 + shadcn/ui

设计文档：`docs/superpowers/specs/2026-08-06-android-voice-command-design.md`

---

## 开始前必读

### 三个必须先拿到的外部值

以下三项无法从代码推导，缺一不可，全部填在 `src-tauri/src/voice/config.rs`：

1. DashScope API Key（北京地域与新加坡地域的 Key 不通用）
2. WebSocket URL 中的真实 WorkspaceId，替换 `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/` 里的占位符
3. 确认 `qwen3.7-plus` 在 DashScope OpenAI 兼容端点上的准确模型名

### 已知的最大风险：Android 上的 TLS 根证书

`async-openai 0.41` 依赖 `reqwest 0.13`。reqwest 0.13 删除了 0.12 时代的 `rustls-tls-webpki-roots` feature，改为一律使用 `rustls-platform-verifier`。该 crate 在 Android 上**必须先做 JNI 初始化**，否则任何 HTTPS 请求都会 panic：

```
thread panicked at rustls-platform-verifier-0.6.2/src/android.rs:94:
Expect rustls-platform-verifier to be initialized
```

本计划采取的规避方式是**完全绕开 platform-verifier**：自己用 `webpki-roots` 构造 `rustls::ClientConfig`，通过 `reqwest::ClientBuilder::use_preconfigured_tls()` 注入，再用 `Client::with_http_client()` 交给 async-openai。这样是纯 Rust 方案，不需要 JNI 初始化、不需要往 Android 工程里塞 Kotlin 组件、不需要额外 ProGuard 规则。

Task 1 会在写任何业务代码之前先在真机上验证这条 TLS 通路。**如果 Task 1 的冒烟测试不过，不要继续往下做**，先解决 TLS。备选方案是改用 JNI 初始化 platform-verifier（参考 tauri-apps/tauri#13267）。

### 参考资料

- 实时语音识别文档（含 WebSocket 原始协议示例）：https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide
- Tauri 移动端插件开发：https://v2.tauri.app/develop/plugins/develop-mobile/
- async-openai 兼容第三方服务：https://docs.rs/async-openai/0.41.3/async_openai/

### 项目约定

- 前端检查用 `pnpm check`（Biome）。注意 `AGENTS.md` 里写的 `pnpm run lint` 在 `package.json` 中并不存在。
- Rust 测试用 `cargo test`，在 `src-tauri/` 目录下执行。
- 注释用中文，与现有代码风格一致。只解释代码本身表达不了的约束，不要复述代码在做什么。

---

## 文件结构

### 新建

| 路径 | 职责 |
|---|---|
| `src-tauri/plugins/mic/Cargo.toml` | 本地插件 crate 清单 |
| `src-tauri/plugins/mic/build.rs` | 插件构建脚本，声明命令列表 |
| `src-tauri/plugins/mic/src/lib.rs` | 插件入口，暴露 `Mic` 句柄 |
| `src-tauri/plugins/mic/src/error.rs` | 插件错误类型 |
| `src-tauri/plugins/mic/android/` | Android Gradle 子工程 |
| `src-tauri/plugins/mic/android/src/main/java/MicPlugin.kt` | `AudioRecord` 采集与权限申请 |
| `src-tauri/src/voice/mod.rs` | 模块聚合，只对外导出 commands |
| `src-tauri/src/voice/config.rs` | 编译期常量 |
| `src-tauri/src/voice/error.rs` | `VoiceError` 与 `Result` 别名 |
| `src-tauri/src/voice/event.rs` | `VoiceEvent`，前后端事件契约 |
| `src-tauri/src/voice/wake.rs` | 唤醒词状态机（纯逻辑） |
| `src-tauri/src/voice/audio/mod.rs` | `AudioSource` trait |
| `src-tauri/src/voice/audio/android.rs` | `AndroidMic` 实现 |
| `src-tauri/src/voice/asr/mod.rs` | `AsrProvider` / `AsrSession` trait 与 `AsrEvent` |
| `src-tauri/src/voice/asr/protocol.rs` | DashScope WS 帧编解码（纯函数） |
| `src-tauri/src/voice/asr/dashscope_ws.rs` | WS 连接与会话 |
| `src-tauri/src/voice/llm/mod.rs` | `TextModel` trait 与 `ChatRequest` |
| `src-tauri/src/voice/llm/prompt.rs` | 提示词组装与响应解析 |
| `src-tauri/src/voice/llm/openai_sdk.rs` | async-openai 实现 |
| `src-tauri/src/voice/tls.rs` | webpki-roots 的 rustls 配置 |
| `src-tauri/src/voice/session.rs` | 编排器 |
| `src-tauri/src/voice/commands.rs` | `start_asr` / `stop_asr` |
| `src/lib/voice/types.ts` | 前端事件类型 |
| `src/lib/voice/index.ts` | `startASR` / `stopASR` 绑定 |
| `src/components/voice-demo.tsx` | demo UI |

### 修改

| 路径 | 改动 |
|---|---|
| `src-tauri/Cargo.toml` | 提升 `rust-version`，新增依赖 |
| `src-tauri/src/lib.rs` | 注册 mic 插件与 voice commands |
| `src/lib/platform.ts` | 新增 `IS_ANDROID` |
| `src/components/mobile/home.tsx` | 挂载 demo 组件 |

---

## Task 1: 提升 MSRV、接入依赖、验证 Android TLS 通路

这个任务不写业务代码，只把地基和最大风险点先解决掉。

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/voice/mod.rs`
- Create: `src-tauri/src/voice/tls.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 提升 rust-version**

当前 `src-tauri/Cargo.toml` 里 `rust-version = "1.77.2"` 会让 Cargo 拒绝解析较新的依赖，实测会看到这样的警告：

```
warning: ignoring tokio-tungstenite@0.30.0 (which requires rustc 1.85) to maintain app's rust-version of 1.77.2
warning: ignoring reqwest@0.13.4 (which requires rustc 1.85.0) to maintain app's rust-version of 1.77.2
```

本机工具链是 1.96.0，把这一行改成：

```toml
rust-version = "1.85"
```

- [ ] **Step 2: 加依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 末尾追加。注意 `async-openai` 的 chat 功能 feature 名是 `chat-completion` 而不是 `chat`，且必须 `default-features = false` 才能关掉会拉入 platform-verifier 的默认 `rustls`：

```toml
tokio = { version = "1.53", features = ["rt-multi-thread", "macros", "sync", "time"] }
tokio-tungstenite = { version = "0.29", features = ["rustls-tls-webpki-roots"] }
futures-util = "0.3"
async-trait = "0.1"
uuid = { version = "1.20", features = ["v4"] }
base64 = "0.23"
thiserror = "2"
rustls = { version = "0.23", default-features = false, features = ["std", "tls12", "ring"] }
webpki-roots = "1.0"
reqwest = { version = "0.13", default-features = false, features = ["json", "stream", "multipart", "charset", "http2", "rustls-no-provider"] }
async-openai = { version = "0.41", default-features = false, features = ["chat-completion", "rustls-no-provider"] }
tauri-plugin-mic = { path = "plugins/mic" }
```

`tauri-plugin-mic` 这一行先注释掉，Task 8 建好插件后再放开。

- [ ] **Step 3: 写 TLS 配置模块**

创建 `src-tauri/src/voice/tls.rs`：

```rust
//! reqwest 0.13 起一律使用 rustls-platform-verifier 取根证书，而它在 Android 上
//! 必须先做 JNI 初始化，否则首次 HTTPS 请求就会 panic。这里改用 webpki-roots
//! 自带的根证书自行构造 ClientConfig，绕开对 JVM 的依赖。

use std::sync::Arc;
use std::sync::OnceLock;

/// ring 的 crypto provider 只能安装一次，重复安装会返回 Err，因此用 OnceLock 兜住。
fn ensure_crypto_provider() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn client_config() -> Arc<rustls::ClientConfig> {
    ensure_crypto_provider();

    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// 供 async-openai 使用的 HTTP 客户端，TLS 用上面的配置而非平台验证器。
pub fn http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::ClientBuilder::new()
        .use_preconfigured_tls((*client_config()).clone())
        .build()
}
```

- [ ] **Step 4: 建模块骨架并挂上冒烟命令**

创建 `src-tauri/src/voice/mod.rs`：

```rust
pub mod tls;

/// 冒烟验证：确认在目标平台上能完成一次 HTTPS 握手。
/// Task 1 验证通过后由 Task 11 删除。
#[tauri::command]
pub async fn tls_smoke_test() -> Result<u16, String> {
    let client = tls::http_client().map_err(|e| e.to_string())?;
    let response = client
        .get("https://dashscope.aliyuncs.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(response.status().as_u16())
}
```

在 `src-tauri/src/lib.rs` 顶部加 `mod voice;`，并在 builder 链上加 invoke handler。改动后 `run()` 的开头是：

```rust
#[cfg(desktop)]
mod tray;
mod voice;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .invoke_handler(tauri::generate_handler![voice::tls_smoke_test])
    .setup(|app| {
```

- [ ] **Step 5: 桌面端先编译过**

```bash
cd src-tauri && cargo check
```

Expected: 编译通过，无 error。若报 `unrecognized feature`，核对 Step 2 的 feature 名拼写。

- [ ] **Step 6: 真机验证 TLS**

```bash
pnpm android:dev
```

在设备上打开浏览器控制台（`chrome://inspect`），执行：

```js
await window.__TAURI_INTERNALS__.invoke('tls_smoke_test')
```

Expected: 返回一个数字状态码（200 或 404 都算成功，说明 TLS 握手完成）。

若抛出包含 `Expect rustls-platform-verifier to be initialized` 的错误，说明 `use_preconfigured_tls` 没生效，检查 `async-openai` 与 `reqwest` 的 `default-features = false` 是否都写了。**这一步不过就停下来，不要继续后面的任务。**

- [ ] **Step 7: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/voice/
git commit -m "feat(voice): 接入语音链路依赖并绕开 Android 平台证书验证器"
```

---

## Task 2: 配置常量与错误类型

**Files:**
- Create: `src-tauri/src/voice/config.rs`
- Create: `src-tauri/src/voice/error.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写配置模块**

创建 `src-tauri/src/voice/config.rs`：

```rust
//! 本阶段不做配置 UI，全部走编译期常量。
//! 需要改值时优先用环境变量，例如：
//!   ASR_WS_URL=wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/ pnpm android:build

macro_rules! env_or {
    ($key:literal, $fallback:literal) => {
        match option_env!($key) {
            Some(value) => value,
            None => $fallback,
        }
    };
}

/// 百炼 API Key。北京地域与新加坡地域的 Key 不通用。
pub const DASHSCOPE_API_KEY: &str = env_or!("DASHSCOPE_API_KEY", "sk-REPLACE_ME");

/// 实时识别 WebSocket 地址。{WorkspaceId} 必须替换成真实业务空间 ID。
pub const ASR_WS_URL: &str = env_or!(
    "ASR_WS_URL",
    "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/"
);

pub const ASR_MODEL: &str = env_or!("ASR_MODEL", "fun-asr-realtime");

/// OpenAI 兼容端点。async-openai 会在其后拼 /chat/completions。
pub const LLM_BASE_URL: &str = env_or!(
    "LLM_BASE_URL",
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
);

pub const LLM_MODEL: &str = env_or!("LLM_MODEL", "qwen3.7-plus");

pub const WAKE_WORD: &str = env_or!("WAKE_WORD", "你好小财");

pub const SAMPLE_RATE: u32 = 16_000;

/// 200 ms 一帧。跨语言要 base64，帧太小会让序列化次数成倍上升。
pub const FRAME_BYTES: usize = 6_400;

/// 唤醒后等待命令句的时长，超时回到待唤醒状态，避免误触发。
pub const ARMED_TIMEOUT_SECS: u64 = 10;

/// LLM 单次请求超时。
pub const LLM_TIMEOUT_SECS: u64 = 20;
```

- [ ] **Step 2: 写错误类型**

创建 `src-tauri/src/voice/error.rs`：

```rust
use serde::Serialize;

/// 与 VoiceEvent 的 stage 字段对应，决定前端如何提示以及会话是否终止。
#[derive(Debug, Clone, Copy, Serialize)]
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

    #[error("录音失败: {0}")]
    Audio(String),

    #[error("语音识别失败: {0}")]
    Asr(String),

    #[error("命令解析失败: {0}")]
    Llm(String),

    #[error("会话已在运行")]
    AlreadyRunning,

    #[error("当前平台不支持语音识别")]
    UnsupportedPlatform,
}

impl VoiceError {
    pub fn stage(&self) -> Stage {
        match self {
            Self::PermissionDenied => Stage::Permission,
            Self::Audio(_) | Self::UnsupportedPlatform => Stage::Audio,
            Self::Asr(_) | Self::AlreadyRunning => Stage::Asr,
            Self::Llm(_) => Stage::Llm,
        }
    }
}

pub type Result<T> = std::result::Result<T, VoiceError>;
```

- [ ] **Step 3: 挂进模块树**

`src-tauri/src/voice/mod.rs` 改为：

```rust
pub mod config;
pub mod error;
pub mod tls;

/// 冒烟验证：确认在目标平台上能完成一次 HTTPS 握手。
/// Task 1 验证通过后由 Task 11 删除。
#[tauri::command]
pub async fn tls_smoke_test() -> Result<u16, String> {
    let client = tls::http_client().map_err(|e| e.to_string())?;
    let response = client
        .get("https://dashscope.aliyuncs.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(response.status().as_u16())
}
```

- [ ] **Step 4: 编译**

```bash
cd src-tauri && cargo check
```

Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): 新增配置常量与分级错误类型"
```

---

## Task 3: 唤醒词状态机

纯逻辑、无 IO，是全项目最适合 TDD 的部分。

**Files:**
- Create: `src-tauri/src/voice/wake.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/src/voice/wake.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn detector() -> WakeDetector {
        WakeDetector::new("你好小财", Duration::from_secs(10))
    }

    #[test]
    fn 同句唤醒词后有剩余时直接成命令() {
        let mut d = detector();
        let now = Instant::now();
        assert_eq!(
            d.on_final("你好小财，打开投影仪", now),
            WakeOutcome::Command("打开投影仪".into())
        );
    }

    #[test]
    fn 同句只有唤醒词时进入待命状态() {
        let mut d = detector();
        let now = Instant::now();
        assert_eq!(d.on_final("你好小财", now), WakeOutcome::Awakened);
    }

    #[test]
    fn 待命状态下整句成为命令() {
        let mut d = detector();
        let now = Instant::now();
        d.on_final("你好小财", now);
        assert_eq!(
            d.on_final("把灯关掉", now + Duration::from_secs(2)),
            WakeOutcome::Command("把灯关掉".into())
        );
    }

    #[test]
    fn 未唤醒时普通句子被忽略() {
        let mut d = detector();
        assert_eq!(d.on_final("今天天气不错", Instant::now()), WakeOutcome::None);
    }

    #[test]
    fn 待命超时后回落且本句重新按未唤醒处理() {
        let mut d = detector();
        let now = Instant::now();
        d.on_final("你好小财", now);
        // 超时后这句不该被当成命令
        assert_eq!(
            d.on_final("随便说点什么", now + Duration::from_secs(11)),
            WakeOutcome::None
        );
    }

    #[test]
    fn 待命超时后同一句里的唤醒词仍然生效() {
        let mut d = detector();
        let now = Instant::now();
        d.on_final("你好小财", now);
        assert_eq!(
            d.on_final("你好小财，开空调", now + Duration::from_secs(11)),
            WakeOutcome::Command("开空调".into())
        );
    }

    #[test]
    fn 唤醒词内部的标点和空格被忽略() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好，小财！打开窗帘", Instant::now()),
            WakeOutcome::Command("打开窗帘".into())
        );
    }

    #[test]
    fn 一句里出现多次唤醒词时取最后一次() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财你好小财关灯", Instant::now()),
            WakeOutcome::Command("关灯".into())
        );
    }

    #[test]
    fn 命令文本保留原始标点() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财，把空调调到 26 度。", Instant::now()),
            WakeOutcome::Command("把空调调到 26 度。".into())
        );
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri && cargo test wake
```

Expected: 编译失败，`cannot find type WakeDetector in this scope`。

- [ ] **Step 3: 实现**

在 `wake.rs` 的 `#[cfg(test)] mod tests` **之前**插入实现。

这里的关键设计是归一化与原文的对应关系：匹配要在去掉标点空格的归一化文本上做（这样「你好，小财！」也能命中），但返回的命令必须是原文切片（保留标点，便于 LLM 理解）。因此归一化时同步记录每个归一化字符在原文中的字节偏移。

```rust
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WakeOutcome {
    /// 本句与唤醒无关
    None,
    /// 命中唤醒词但句子到此为止，等待下一句
    Awakened,
    /// 得到一条待解析的命令
    Command(String),
}

enum State {
    Idle,
    /// 已唤醒，记录唤醒时刻用于超时判定
    Armed(Instant),
}

pub struct WakeDetector {
    state: State,
    /// 归一化后的唤醒词，与 normalize 的输出在同一空间比较
    wake_word: String,
    timeout: Duration,
}

/// 去掉空白与常见中英文标点。ASR 的断句标点位置不稳定，
/// 直接在原文上匹配唤醒词会因为「你好，小财」这类插入标点而漏掉。
fn is_ignorable(c: char) -> bool {
    c.is_whitespace() || matches!(c, '，' | '。' | '！' | '？' | '、' | '：' | '；'
        | ',' | '.' | '!' | '?' | ':' | ';' | '"' | '\'' | '“' | '”' | '‘' | '’')
}

/// 返回归一化文本，以及归一化文本中每个字符对应的原文起始字节偏移。
/// 末尾额外补一个 original.len()，方便取「唤醒词之后的全部原文」。
fn normalize(original: &str) -> (String, Vec<usize>) {
    let mut normalized = String::with_capacity(original.len());
    let mut offsets = Vec::with_capacity(original.len());

    for (byte_index, c) in original.char_indices() {
        if is_ignorable(c) {
            continue;
        }
        for _ in 0..c.len_utf8() {
            offsets.push(byte_index);
        }
        normalized.push(c);
    }
    offsets.push(original.len());

    (normalized, offsets)
}

impl WakeDetector {
    pub fn new(wake_word: &str, timeout: Duration) -> Self {
        let (normalized_wake_word, _) = normalize(wake_word);
        Self {
            state: State::Idle,
            wake_word: normalized_wake_word,
            timeout,
        }
    }

    pub fn reset(&mut self) {
        self.state = State::Idle;
    }

    pub fn on_final(&mut self, text: &str, now: Instant) -> WakeOutcome {
        if let State::Armed(awakened_at) = self.state {
            if now.duration_since(awakened_at) <= self.timeout {
                self.state = State::Idle;
                let command = text.trim();
                if !command.is_empty() {
                    return WakeOutcome::Command(command.to_string());
                }
                return WakeOutcome::None;
            }
            // 超时：回到 Idle，本句按未唤醒重新处理
            self.state = State::Idle;
        }

        self.detect_in_sentence(text, now)
    }

    fn detect_in_sentence(&mut self, text: &str, now: Instant) -> WakeOutcome {
        let (normalized, offsets) = normalize(text);

        // 一句里可能重复出现唤醒词，取最后一次，命令是它之后的内容
        let Some(match_start) = normalized.rfind(&self.wake_word) else {
            return WakeOutcome::None;
        };

        let normalized_rest_start = match_start + self.wake_word.len();
        let original_rest_start = offsets[normalized_rest_start];
        let rest = text[original_rest_start..].trim_start_matches(is_ignorable).trim();

        if rest.is_empty() {
            self.state = State::Armed(now);
            WakeOutcome::Awakened
        } else {
            self.state = State::Idle;
            WakeOutcome::Command(rest.to_string())
        }
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

在 `src-tauri/src/voice/mod.rs` 加 `pub mod wake;`，然后：

```bash
cd src-tauri && cargo test wake
```

Expected: `test result: ok. 9 passed; 0 failed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): 唤醒词状态机，支持同句命令与下一句命令两种路径"
```

---

## Task 4: DashScope WebSocket 帧编解码

同样是纯函数，先测后写。

**Files:**
- Create: `src-tauri/src/voice/asr/mod.rs`
- Create: `src-tauri/src/voice/asr/protocol.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写 ASR 抽象层**

创建 `src-tauri/src/voice/asr/mod.rs`：

```rust
pub mod dashscope_ws;
pub mod protocol;

use crate::voice::error::Result;
use async_trait::async_trait;

/// ASR 服务向上层汇报的事件，与具体厂商协议无关。
#[derive(Debug, Clone, PartialEq)]
pub enum AsrEvent {
    /// 服务端已就绪，此时才可以开始送音频
    Started,
    /// 中间结果，同一句会多次下发
    Partial { text: String, sentence_id: u64 },
    /// 一句话结束
    Final { text: String, sentence_id: u64 },
    Finished,
    Failed { message: String },
}

/// 一次识别会话。实现者负责把音频送到服务端。
#[async_trait]
pub trait AsrSession: Send {
    async fn send_audio(&mut self, pcm: Vec<u8>) -> Result<()>;
    /// 通知服务端音频已结束并等待收尾
    async fn finish(&mut self) -> Result<()>;
}

/// ASR 服务提供方，负责建立会话。
#[async_trait]
pub trait AsrProvider: Send + Sync {
    async fn open(
        &self,
        events: tokio::sync::mpsc::Sender<AsrEvent>,
    ) -> Result<Box<dyn AsrSession>>;
}
```

- [ ] **Step 2: 写失败的编解码测试**

创建 `src-tauri/src/voice/asr/protocol.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::asr::AsrEvent;

    #[test]
    fn run_task_帧包含协议要求的全部字段() {
        let frame = run_task_frame("abc123", "fun-asr-realtime", 16000);
        let parsed: serde_json::Value = serde_json::from_str(&frame).unwrap();

        assert_eq!(parsed["header"]["action"], "run-task");
        assert_eq!(parsed["header"]["task_id"], "abc123");
        assert_eq!(parsed["header"]["streaming"], "duplex");
        assert_eq!(parsed["payload"]["task_group"], "audio");
        assert_eq!(parsed["payload"]["task"], "asr");
        assert_eq!(parsed["payload"]["function"], "recognition");
        assert_eq!(parsed["payload"]["model"], "fun-asr-realtime");
        assert_eq!(parsed["payload"]["parameters"]["sample_rate"], 16000);
        assert_eq!(parsed["payload"]["parameters"]["format"], "pcm");
        assert!(parsed["payload"]["input"].is_object());
    }

    #[test]
    fn finish_task_帧格式正确() {
        let frame = finish_task_frame("abc123");
        let parsed: serde_json::Value = serde_json::from_str(&frame).unwrap();

        assert_eq!(parsed["header"]["action"], "finish-task");
        assert_eq!(parsed["header"]["task_id"], "abc123");
        assert_eq!(parsed["header"]["streaming"], "duplex");
    }

    #[test]
    fn 解析_task_started() {
        let raw = r#"{"header":{"event":"task-started","task_id":"t1"},"payload":{}}"#;
        assert_eq!(parse_event(raw).unwrap(), Some(AsrEvent::Started));
    }

    #[test]
    fn 解析中间结果() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": {
                "begin_time": 170, "end_time": null,
                "text": "打开投", "sentence_end": false
            }}}
        }"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(AsrEvent::Partial { text: "打开投".into(), sentence_id: 170 })
        );
    }

    #[test]
    fn 解析句子结束() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": {
                "begin_time": 170, "end_time": 920,
                "text": "打开投影仪", "sentence_end": true
            }}}
        }"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(AsrEvent::Final { text: "打开投影仪".into(), sentence_id: 170 })
        );
    }

    #[test]
    fn 解析任务失败时带出错误信息() {
        let raw = r#"{"header":{"event":"task-failed","error_message":"invalid api key"},"payload":{}}"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(AsrEvent::Failed { message: "invalid api key".into() })
        );
    }

    #[test]
    fn 解析任务完成() {
        let raw = r#"{"header":{"event":"task-finished"},"payload":{}}"#;
        assert_eq!(parse_event(raw).unwrap(), Some(AsrEvent::Finished));
    }

    #[test]
    fn 未知事件被忽略而不是报错() {
        let raw = r#"{"header":{"event":"something-new"},"payload":{}}"#;
        assert_eq!(parse_event(raw).unwrap(), None);
    }

    #[test]
    fn 空文本的中间结果被忽略() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": {
                "begin_time": 0, "text": "", "sentence_end": false
            }}}
        }"#;
        assert_eq!(parse_event(raw).unwrap(), None);
    }

    #[test]
    fn 非法_json_返回错误() {
        assert!(parse_event("not json").is_err());
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd src-tauri && cargo test protocol
```

Expected: 编译失败，`cannot find function run_task_frame`。

- [ ] **Step 4: 实现编解码**

在 `protocol.rs` 的测试模块之前插入：

```rust
use crate::voice::asr::AsrEvent;
use crate::voice::error::{Result, VoiceError};
use serde::Deserialize;
use serde_json::json;

/// 协议要求 task_id 为 32 位无短横 UUID。
pub fn new_task_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub fn run_task_frame(task_id: &str, model: &str, sample_rate: u32) -> String {
    json!({
        "header": {
            "action": "run-task",
            "task_id": task_id,
            "streaming": "duplex"
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": model,
            "parameters": {
                "sample_rate": sample_rate,
                "format": "pcm"
            },
            "input": {}
        }
    })
    .to_string()
}

pub fn finish_task_frame(task_id: &str) -> String {
    json!({
        "header": {
            "action": "finish-task",
            "task_id": task_id,
            "streaming": "duplex"
        },
        "payload": { "input": {} }
    })
    .to_string()
}

#[derive(Deserialize)]
struct Frame {
    header: Header,
    #[serde(default)]
    payload: Option<Payload>,
}

#[derive(Deserialize)]
struct Header {
    event: String,
    #[serde(default)]
    error_message: Option<String>,
}

#[derive(Deserialize)]
struct Payload {
    #[serde(default)]
    output: Option<Output>,
}

#[derive(Deserialize)]
struct Output {
    #[serde(default)]
    sentence: Option<Sentence>,
}

#[derive(Deserialize)]
struct Sentence {
    /// 句子在音频中的起始毫秒。同一句的多次中间结果里保持不变，
    /// 因此直接拿它当句子标识，前端据此原地更新。
    #[serde(default)]
    begin_time: u64,
    #[serde(default)]
    text: String,
    #[serde(default)]
    sentence_end: bool,
}

/// 返回 Ok(None) 表示这帧不需要上层关心（未知事件或空文本）。
pub fn parse_event(raw: &str) -> Result<Option<AsrEvent>> {
    let frame: Frame = serde_json::from_str(raw)
        .map_err(|e| VoiceError::Asr(format!("无法解析服务端帧: {e}")))?;

    match frame.header.event.as_str() {
        "task-started" => Ok(Some(AsrEvent::Started)),
        "task-finished" => Ok(Some(AsrEvent::Finished)),
        "task-failed" => Ok(Some(AsrEvent::Failed {
            message: frame
                .header
                .error_message
                .unwrap_or_else(|| "服务端未提供错误信息".to_string()),
        })),
        "result-generated" => {
            let Some(sentence) = frame
                .payload
                .and_then(|p| p.output)
                .and_then(|o| o.sentence)
            else {
                return Ok(None);
            };

            if sentence.text.is_empty() {
                return Ok(None);
            }

            Ok(Some(if sentence.sentence_end {
                AsrEvent::Final {
                    text: sentence.text,
                    sentence_id: sentence.begin_time,
                }
            } else {
                AsrEvent::Partial {
                    text: sentence.text,
                    sentence_id: sentence.begin_time,
                }
            }))
        }
        _ => Ok(None),
    }
}
```

- [ ] **Step 5: 跑测试确认通过**

在 `src-tauri/src/voice/mod.rs` 加 `pub mod asr;`。`dashscope_ws.rs` 还没建，先创建一个空文件占位：

```bash
touch src-tauri/src/voice/asr/dashscope_ws.rs
cd src-tauri && cargo test protocol
```

Expected: `test result: ok. 10 passed; 0 failed`

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): DashScope 实时识别帧编解码与 ASR 抽象层"
```

---

## Task 5: WebSocket 会话实现

**Files:**
- Modify: `src-tauri/src/voice/asr/dashscope_ws.rs`

- [ ] **Step 1: 实现 provider 与 session**

写入 `src-tauri/src/voice/asr/dashscope_ws.rs`：

```rust
use crate::voice::asr::protocol::{finish_task_frame, new_task_id, parse_event, run_task_frame};
use crate::voice::asr::{AsrEvent, AsrProvider, AsrSession};
use crate::voice::config;
use crate::voice::error::{Result, VoiceError};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

pub struct DashScopeWs {
    url: String,
    api_key: String,
    model: String,
}

impl DashScopeWs {
    pub fn from_config() -> Self {
        Self {
            url: config::ASR_WS_URL.to_string(),
            api_key: config::DASHSCOPE_API_KEY.to_string(),
            model: config::ASR_MODEL.to_string(),
        }
    }
}

/// 送往 WS 写端的指令。音频与控制帧共用一个队列，保证顺序。
enum Outbound {
    Audio(Vec<u8>),
    Finish,
}

pub struct DashScopeSession {
    outbound: mpsc::Sender<Outbound>,
    /// finish() 后等待写循环收尾
    writer: Option<tokio::task::JoinHandle<()>>,
}

#[async_trait]
impl AsrProvider for DashScopeWs {
    async fn open(&self, events: mpsc::Sender<AsrEvent>) -> Result<Box<dyn AsrSession>> {
        if self.url.contains("{WorkspaceId}") {
            return Err(VoiceError::Asr(
                "ASR_WS_URL 仍是占位符，请在 config.rs 中填入真实 WorkspaceId".into(),
            ));
        }

        let mut request = self
            .url
            .as_str()
            .into_client_request()
            .map_err(|e| VoiceError::Asr(format!("WebSocket 地址非法: {e}")))?;

        request.headers_mut().insert(
            "Authorization",
            format!("bearer {}", self.api_key)
                .parse()
                .map_err(|_| VoiceError::Asr("API Key 含有非法字符".into()))?,
        );

        let (stream, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| VoiceError::Asr(format!("连接失败: {e}")))?;

        let (mut sink, mut source) = stream.split();

        let task_id = new_task_id();
        sink.send(Message::Text(
            run_task_frame(&task_id, &self.model, config::SAMPLE_RATE).into(),
        ))
        .await
        .map_err(|e| VoiceError::Asr(format!("发送 run-task 失败: {e}")))?;

        // 读循环：把服务端帧翻译成 AsrEvent
        let events_for_reader = events.clone();
        tokio::spawn(async move {
            while let Some(message) = source.next().await {
                let payload = match message {
                    Ok(Message::Text(text)) => text.to_string(),
                    Ok(Message::Close(_)) => break,
                    Ok(_) => continue,
                    Err(e) => {
                        let _ = events_for_reader
                            .send(AsrEvent::Failed {
                                message: format!("连接中断: {e}"),
                            })
                            .await;
                        return;
                    }
                };

                match parse_event(&payload) {
                    Ok(Some(event)) => {
                        let terminal = matches!(
                            event,
                            AsrEvent::Finished | AsrEvent::Failed { .. }
                        );
                        if events_for_reader.send(event).await.is_err() || terminal {
                            return;
                        }
                    }
                    Ok(None) => {}
                    Err(e) => {
                        let _ = events_for_reader
                            .send(AsrEvent::Failed {
                                message: e.to_string(),
                            })
                            .await;
                        return;
                    }
                }
            }
        });

        // 写循环：串行发送音频与 finish-task
        let (outbound_tx, mut outbound_rx) = mpsc::channel::<Outbound>(64);
        let finish_task_id = task_id.clone();
        let writer = tokio::spawn(async move {
            while let Some(item) = outbound_rx.recv().await {
                let message = match item {
                    Outbound::Audio(pcm) => Message::Binary(pcm.into()),
                    Outbound::Finish => {
                        let _ = sink
                            .send(Message::Text(finish_task_frame(&finish_task_id).into()))
                            .await;
                        break;
                    }
                };
                if sink.send(message).await.is_err() {
                    break;
                }
            }
        });

        Ok(Box::new(DashScopeSession {
            outbound: outbound_tx,
            writer: Some(writer),
        }))
    }
}

#[async_trait]
impl AsrSession for DashScopeSession {
    async fn send_audio(&mut self, pcm: Vec<u8>) -> Result<()> {
        self.outbound
            .send(Outbound::Audio(pcm))
            .await
            .map_err(|_| VoiceError::Asr("识别会话已关闭".into()))
    }

    async fn finish(&mut self) -> Result<()> {
        // 发送端可能已经关闭，这里忽略错误，重点是等写循环收尾
        let _ = self.outbound.send(Outbound::Finish).await;
        if let Some(writer) = self.writer.take() {
            let _ = writer.await;
        }
        Ok(())
    }
}
```

- [ ] **Step 2: 编译**

```bash
cd src-tauri && cargo check
```

Expected: 通过。若 `Message::Text` 报类型不匹配，说明 tungstenite 0.29 的 `Text` 收的是 `Utf8Bytes`，`.into()` 已经处理；若仍报错，改用 `Message::text(...)` 构造器。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/voice/asr/dashscope_ws.rs
git commit -m "feat(voice): 实现 DashScope 实时识别 WebSocket 会话"
```

---

## Task 6: 提示词组装与响应解析

**Files:**
- Create: `src-tauri/src/voice/llm/mod.rs`
- Create: `src-tauri/src/voice/llm/prompt.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写 Text 模型抽象层**

创建 `src-tauri/src/voice/llm/mod.rs`：

```rust
pub mod openai_sdk;
pub mod prompt;

use crate::voice::error::Result;
use async_trait::async_trait;

pub struct ChatRequest {
    pub system: String,
    pub user: String,
    /// 要求服务端以 JSON 对象返回
    pub json_mode: bool,
}

/// 文本模型抽象。上层只关心「给一段对话拿一段文本」，不关心用哪家 SDK。
#[async_trait]
pub trait TextModel: Send + Sync {
    async fn complete(&self, request: ChatRequest) -> Result<String>;
}
```

- [ ] **Step 2: 写失败的解析测试**

创建 `src-tauri/src/voice/llm/prompt.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 组装的请求包含原话且开启_json_模式() {
        let request = build_request("打开投影仪");
        assert!(request.user.contains("打开投影仪"));
        assert!(request.json_mode);
        assert!(request.system.contains("intent"));
    }

    #[test]
    fn 解析标准_json() {
        let parsed = parse_command(r#"{"intent":"open_projector","params":{"room":"301"},"reply":"好的"}"#);
        assert_eq!(parsed.intent, "open_projector");
        assert_eq!(parsed.params["room"], "301");
        assert_eq!(parsed.reply, "好的");
    }

    #[test]
    fn 解析被_markdown_围栏包裹的_json() {
        let raw = "```json\n{\"intent\":\"close_light\",\"params\":{},\"reply\":\"关灯了\"}\n```";
        let parsed = parse_command(raw);
        assert_eq!(parsed.intent, "close_light");
        assert_eq!(parsed.reply, "关灯了");
    }

    #[test]
    fn 缺少可选字段时用默认值填充() {
        let parsed = parse_command(r#"{"intent":"open_door"}"#);
        assert_eq!(parsed.intent, "open_door");
        assert!(parsed.params.is_empty());
        assert_eq!(parsed.reply, "");
    }

    #[test]
    fn 完全不是_json_时降级为_unknown() {
        let parsed = parse_command("我不太明白你的意思");
        assert_eq!(parsed.intent, "unknown");
    }

    #[test]
    fn json_前后有多余说明文字时仍能提取() {
        let raw = "好的，解析结果如下：{\"intent\":\"open_ac\",\"params\":{},\"reply\":\"开空调\"} 以上。";
        let parsed = parse_command(raw);
        assert_eq!(parsed.intent, "open_ac");
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd src-tauri && cargo test prompt
```

Expected: 编译失败，`cannot find function build_request`。

- [ ] **Step 4: 实现**

在 `prompt.rs` 测试模块之前插入：

```rust
use crate::voice::llm::ChatRequest;
use serde::{Deserialize, Serialize};
use serde_json::Map;

/// 交给前端的命令。intent 为 "unknown" 表示没能识别。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommand {
    pub intent: String,
    #[serde(default)]
    pub params: Map<String, serde_json::Value>,
    #[serde(default)]
    pub reply: String,
}

impl VoiceCommand {
    pub fn unknown() -> Self {
        Self {
            intent: "unknown".to_string(),
            params: Map::new(),
            reply: String::new(),
        }
    }
}

const SYSTEM_PROMPT: &str = r#"你是教室智能机器人的命令解析器。用户会说一句中文指令，你要把它解析成结构化命令。

只输出一个 JSON 对象，不要输出任何解释文字或 markdown 代码块，字段如下：
- intent：命令意图，用小写下划线命名，例如 open_projector、close_light、set_ac_temperature。无法识别时固定填 unknown。
- params：命令参数对象，没有参数时填 {}。例如温度填 {"temperature": 26}。
- reply：一句简短的中文口播回复，不超过 20 字。

注意输入来自语音识别，可能有同音字错误，请结合教室场景合理推断。"#;

pub fn build_request(utterance: &str) -> ChatRequest {
    ChatRequest {
        system: SYSTEM_PROMPT.to_string(),
        user: utterance.to_string(),
        json_mode: true,
    }
}

/// 从模型输出里尽力提取命令。模型可能加代码围栏或前后缀说明，
/// 因此先截取第一个 { 到最后一个 } 之间的内容再解析。
pub fn parse_command(raw: &str) -> VoiceCommand {
    let Some(start) = raw.find('{') else {
        return VoiceCommand::unknown();
    };
    let Some(end) = raw.rfind('}') else {
        return VoiceCommand::unknown();
    };
    if end < start {
        return VoiceCommand::unknown();
    }

    serde_json::from_str::<VoiceCommand>(&raw[start..=end]).unwrap_or_else(|_| VoiceCommand::unknown())
}
```

- [ ] **Step 5: 跑测试确认通过**

在 `src-tauri/src/voice/mod.rs` 加 `pub mod llm;`。`openai_sdk.rs` 还没建，先占位：

```bash
touch src-tauri/src/voice/llm/openai_sdk.rs
cd src-tauri && cargo test prompt
```

Expected: `test result: ok. 6 passed; 0 failed`

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): 命令解析提示词与容错的响应解析"
```

---

## Task 7: async-openai 调用层

**Files:**
- Modify: `src-tauri/src/voice/llm/openai_sdk.rs`

- [ ] **Step 1: 实现**

写入 `src-tauri/src/voice/llm/openai_sdk.rs`：

```rust
use crate::voice::config;
use crate::voice::error::{Result, VoiceError};
use crate::voice::llm::{ChatRequest, TextModel};
use crate::voice::tls;
use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs, ResponseFormat,
};
use async_openai::Client;
use async_trait::async_trait;
use std::time::Duration;

pub struct OpenAiCompatibleModel {
    client: Client<OpenAIConfig>,
    model: String,
}

impl OpenAiCompatibleModel {
    pub fn from_config() -> Result<Self> {
        // 自带的 HTTP 客户端会走 rustls-platform-verifier，在 Android 上会 panic，
        // 因此这里换成 tls 模块用 webpki-roots 构造的客户端。
        let http_client = tls::http_client()
            .map_err(|e| VoiceError::Llm(format!("构造 HTTP 客户端失败: {e}")))?;

        let openai_config = OpenAIConfig::new()
            .with_api_base(config::LLM_BASE_URL)
            .with_api_key(config::DASHSCOPE_API_KEY);

        Ok(Self {
            client: Client::with_config(openai_config).with_http_client(http_client),
            model: config::LLM_MODEL.to_string(),
        })
    }
}

#[async_trait]
impl TextModel for OpenAiCompatibleModel {
    async fn complete(&self, request: ChatRequest) -> Result<String> {
        let system = ChatCompletionRequestSystemMessageArgs::default()
            .content(request.system)
            .build()
            .map_err(|e| VoiceError::Llm(e.to_string()))?;

        let user = ChatCompletionRequestUserMessageArgs::default()
            .content(request.user)
            .build()
            .map_err(|e| VoiceError::Llm(e.to_string()))?;

        let mut builder = CreateChatCompletionRequestArgs::default();
        builder
            .model(&self.model)
            .messages(vec![system.into(), user.into()]);

        // 不用 json_schema：DashScope 兼容模式对其支持不稳定，
        // 字段约束改由 system 提示词描述。
        if request.json_mode {
            builder.response_format(ResponseFormat::JsonObject);
        }

        let built = builder
            .build()
            .map_err(|e| VoiceError::Llm(e.to_string()))?;

        let response = tokio::time::timeout(
            Duration::from_secs(config::LLM_TIMEOUT_SECS),
            self.client.chat().create(built),
        )
        .await
        .map_err(|_| VoiceError::Llm("请求超时".into()))?
        .map_err(|e| VoiceError::Llm(e.to_string()))?;

        response
            .choices
            .first()
            .and_then(|choice| choice.message.content.clone())
            .ok_or_else(|| VoiceError::Llm("模型未返回内容".into()))
    }
}
```

- [ ] **Step 2: 编译**

```bash
cd src-tauri && cargo check
```

Expected: 通过。若报 `no module chat in types`，确认 `Cargo.toml` 里 async-openai 的 feature 写的是 `chat-completion`。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/voice/llm/openai_sdk.rs
git commit -m "feat(voice): 通过 async-openai 调用兼容端点解析命令"
```

---

## Task 8: Kotlin 录音插件

**Files:**
- Create: `src-tauri/plugins/mic/` 整个目录
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 生成插件骨架**

```bash
cd src-tauri && mkdir -p plugins && cd plugins
pnpm tauri plugin new mic --android --no-api --no-example
```

Expected: 生成 `src-tauri/plugins/tauri-plugin-mic/`。把目录改名成 `mic`：

```bash
mv tauri-plugin-mic mic
```

- [ ] **Step 2: 声明命令**

编辑 `src-tauri/plugins/mic/build.rs`，把命令列表改成：

```rust
const COMMANDS: &[&str] = &["start_recording", "stop_recording"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
```

- [ ] **Step 3: 写 Kotlin 采集实现**

替换 `src-tauri/plugins/mic/android/src/main/java/MicPlugin.kt`：

```kotlin
package cn.edu.gdufe.classroom.mic

import android.Manifest
import android.app.Activity
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private const val SAMPLE_RATE = 16000

// 200 ms 的 16 kHz 单声道 PCM16。跨语言要 base64，帧太小会让序列化次数成倍上升。
private const val FRAME_BYTES = 6400

@InvokeArg
class StartArgs {
    lateinit var onChunk: Channel
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class MicPlugin(private val activity: Activity) : Plugin(activity) {

    private var recorder: AudioRecord? = null
    private val running = AtomicBoolean(false)

    @Command
    fun startRecording(invoke: Invoke) {
        if (running.get()) {
            invoke.reject("录音已在进行")
            return
        }

        val args = invoke.parseArgs(StartArgs::class.java)

        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) {
            invoke.reject("当前设备不支持 16 kHz 单声道采集")
            return
        }

        val record = try {
            AudioRecord(
                // VOICE_RECOGNITION 会启用系统的降噪与增益，比 MIC 更适合识别
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuffer, FRAME_BYTES * 2)
            )
        } catch (e: SecurityException) {
            invoke.reject("麦克风权限被拒绝")
            return
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            invoke.reject("录音初始化失败")
            return
        }

        recorder = record
        running.set(true)
        record.startRecording()

        thread(name = "mic-capture") {
            val frame = ByteArray(FRAME_BYTES)
            var filled = 0

            while (running.get()) {
                val read = record.read(frame, filled, FRAME_BYTES - filled)
                if (read <= 0) {
                    continue
                }
                filled += read
                if (filled < FRAME_BYTES) {
                    continue
                }

                val encoded = Base64.encodeToString(frame, Base64.NO_WRAP)
                args.onChunk.send(JSObject().put("pcm", encoded))
                filled = 0
            }

            record.stop()
            record.release()
        }

        invoke.resolve()
    }

    @Command
    fun stopRecording(invoke: Invoke) {
        running.set(false)
        recorder = null
        invoke.resolve()
    }
}
```

- [ ] **Step 4: 声明权限**

在 `src-tauri/plugins/mic/android/src/main/AndroidManifest.xml` 的 `<manifest>` 下加：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

- [ ] **Step 5: 写 Rust 侧封装**

替换 `src-tauri/plugins/mic/src/lib.rs`：

```rust
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(target_os = "android")]
mod imp {
    use serde::{Deserialize, Serialize};
    use tauri::ipc::Channel;
    use tauri::plugin::PluginHandle;
    use tauri::Runtime;

    const PLUGIN_IDENTIFIER: &str = "cn.edu.gdufe.classroom.mic";

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StartArgs {
        on_chunk: Channel<serde_json::Value>,
    }

    #[derive(Deserialize)]
    pub struct PermissionStatus {
        pub microphone: String,
    }

    pub struct Mic<R: Runtime>(pub PluginHandle<R>);

    impl<R: Runtime> Mic<R> {
        pub fn check_permissions(&self) -> crate::Result<PermissionStatus> {
            self.0
                .run_mobile_plugin("checkPermissions", ())
                .map_err(Into::into)
        }

        pub fn request_permissions(&self) -> crate::Result<PermissionStatus> {
            self.0
                .run_mobile_plugin("requestPermissions", serde_json::json!({}))
                .map_err(Into::into)
        }

        pub fn start(&self, on_chunk: Channel<serde_json::Value>) -> crate::Result<()> {
            self.0
                .run_mobile_plugin::<()>("startRecording", StartArgs { on_chunk })
                .map_err(Into::into)
        }

        pub fn stop(&self) -> crate::Result<()> {
            self.0
                .run_mobile_plugin::<()>("stopRecording", ())
                .map_err(Into::into)
        }
    }
}

#[cfg(not(target_os = "android"))]
mod imp {
    use tauri::ipc::Channel;
    use tauri::Runtime;

    pub struct PermissionStatus {
        pub microphone: String,
    }

    /// 桌面端没有实现，所有调用都直接报不支持。
    pub struct Mic<R: Runtime>(pub std::marker::PhantomData<R>);

    impl<R: Runtime> Mic<R> {
        pub fn check_permissions(&self) -> crate::Result<PermissionStatus> {
            Err(crate::Error::Unsupported)
        }
        pub fn request_permissions(&self) -> crate::Result<PermissionStatus> {
            Err(crate::Error::Unsupported)
        }
        pub fn start(&self, _on_chunk: Channel<serde_json::Value>) -> crate::Result<()> {
            Err(crate::Error::Unsupported)
        }
        pub fn stop(&self) -> crate::Result<()> {
            Err(crate::Error::Unsupported)
        }
    }
}

pub use imp::{Mic, PermissionStatus};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("当前平台不支持麦克风采集")]
    Unsupported,
    #[cfg(target_os = "android")]
    #[error(transparent)]
    Plugin(#[from] tauri::plugin::mobile::PluginInvokeError),
}

pub type Result<T> = std::result::Result<T, Error>;

/// 让 App 能通过 `app.state::<Mic<R>>()` 拿到句柄。
pub trait MicExt<R: Runtime> {
    fn mic(&self) -> tauri::State<'_, Mic<R>>;
}

impl<R: Runtime, T: Manager<R>> MicExt<R> for T {
    fn mic(&self) -> tauri::State<'_, Mic<R>> {
        self.state::<Mic<R>>()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mic")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin(
                    "cn.edu.gdufe.classroom.mic",
                    "MicPlugin",
                )?;
                app.manage(Mic(handle));
            }
            #[cfg(not(target_os = "android"))]
            app.manage(Mic::<R>(std::marker::PhantomData));
            Ok(())
        })
        .build()
}
```

确保 `src-tauri/plugins/mic/Cargo.toml` 的 `[dependencies]` 含有：

```toml
tauri = { version = "2.11" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
```

- [ ] **Step 6: 接入主工程**

放开 `src-tauri/Cargo.toml` 里 Task 1 注释掉的那行：

```toml
tauri-plugin-mic = { path = "plugins/mic" }
```

`plugins/mic/Cargo.toml` 里的 `name` 要改成 `tauri-plugin-mic`（如果生成时不是这个名字）。

在 `src-tauri/src/lib.rs` 的 builder 链上加：

```rust
.plugin(tauri_plugin_mic::init())
```

- [ ] **Step 7: 编译并在真机上验证权限弹窗**

```bash
cd src-tauri && cargo check
cd .. && pnpm android:dev
```

Expected: 应用能启动。此时还没有触发录音的入口，本步只验证插件被正确注册、Gradle 能编过。若 Gradle 报找不到 `MicPlugin`，检查 `MicPlugin.kt` 的 `package` 是否与 `register_android_plugin` 的第一个参数一致。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/plugins src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "feat(mic): 新增安卓录音插件，AudioRecord 采集并以 base64 回传 PCM"
```

---

## Task 9: 录音抽象层与安卓实现

**Files:**
- Create: `src-tauri/src/voice/audio/mod.rs`
- Create: `src-tauri/src/voice/audio/android.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写抽象层**

创建 `src-tauri/src/voice/audio/mod.rs`：

```rust
pub mod android;

use crate::voice::error::Result;
use async_trait::async_trait;
use tokio::sync::mpsc;

/// 音频采集源。上层只关心「拿到一串 PCM 帧」，不关心来自哪个平台。
#[async_trait]
pub trait AudioSource: Send + Sync {
    /// 申请必要权限。已授权时应当直接返回 Ok。
    async fn ensure_permission(&self) -> Result<()>;

    /// 开始采集，返回 PCM 帧接收端。帧格式为 16 kHz 单声道 PCM16。
    async fn start(&self) -> Result<mpsc::Receiver<Vec<u8>>>;

    async fn stop(&self) -> Result<()>;
}
```

- [ ] **Step 2: 写安卓实现**

创建 `src-tauri/src/voice/audio/android.rs`：

```rust
use crate::voice::audio::AudioSource;
use crate::voice::error::{Result, VoiceError};
use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::mpsc;

pub struct AndroidMic<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> AndroidMic<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

#[async_trait]
impl<R: Runtime> AudioSource for AndroidMic<R> {
    async fn ensure_permission(&self) -> Result<()> {
        let mic = self.app.state::<tauri_plugin_mic::Mic<R>>();

        let status = mic
            .check_permissions()
            .map_err(|e| VoiceError::Audio(e.to_string()))?;

        if status.microphone == "granted" {
            return Ok(());
        }

        let status = mic
            .request_permissions()
            .map_err(|e| VoiceError::Audio(e.to_string()))?;

        if status.microphone == "granted" {
            Ok(())
        } else {
            Err(VoiceError::PermissionDenied)
        }
    }

    async fn start(&self) -> Result<mpsc::Receiver<Vec<u8>>> {
        // 容量给足，避免网络抖动时阻塞 Kotlin 采集线程
        let (tx, rx) = mpsc::channel::<Vec<u8>>(64);

        let channel = Channel::new(move |response| {
            let body = response.deserialize::<serde_json::Value>().unwrap_or_default();
            if let Some(encoded) = body.get("pcm").and_then(|v| v.as_str()) {
                if let Ok(pcm) = BASE64.decode(encoded) {
                    // 满了就丢帧。实时识别里迟到的音频没有价值，
                    // 阻塞采集线程反而会让延迟越积越多。
                    let _ = tx.try_send(pcm);
                }
            }
            Ok(())
        });

        self.app
            .state::<tauri_plugin_mic::Mic<R>>()
            .start(channel)
            .map_err(|e| VoiceError::Audio(e.to_string()))?;

        Ok(rx)
    }

    async fn stop(&self) -> Result<()> {
        self.app
            .state::<tauri_plugin_mic::Mic<R>>()
            .stop()
            .map_err(|e| VoiceError::Audio(e.to_string()))
    }
}
```

- [ ] **Step 3: 挂进模块树并编译**

`src-tauri/src/voice/mod.rs` 加 `pub mod audio;`。

```bash
cd src-tauri && cargo check
```

Expected: 通过。注意 `Channel::new` 的回调签名在 Tauri 2.11 是 `Fn(InvokeResponseBody) -> Result<()>`，若编译报参数类型不符，按编译器提示调整 `deserialize` 的写法。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): 录音抽象层与安卓 PCM 解码实现"
```

---

## Task 10: 事件契约与会话编排器

**Files:**
- Create: `src-tauri/src/voice/event.rs`
- Create: `src-tauri/src/voice/session.rs`
- Modify: `src-tauri/src/voice/mod.rs`

- [ ] **Step 1: 写事件契约**

创建 `src-tauri/src/voice/event.rs`：

```rust
use crate::voice::error::Stage;
use crate::voice::llm::prompt::VoiceCommand;
use serde::Serialize;

/// 推给前端的全部事件。前端按 type 分发到不同回调。
/// 字段变更必须同步修改 src/lib/voice/types.ts。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum VoiceEvent {
    State {
        state: SessionState,
    },
    Transcript {
        text: String,
        // final 是 Rust 保留字，字段名加下划线但按前端契约序列化成 final
        #[serde(rename = "final")]
        final_: bool,
        /// 句子标识，前端据此原地更新同一句的中间结果
        index: u64,
    },
    Wake,
    Command {
        command: VoiceCommand,
        /// 触发这条命令的 ASR 原句
        source: String,
        /// 模型返回的原始字符串，便于排查解析失败
        raw: String,
    },
    Error {
        stage: Stage,
        message: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionState {
    Starting,
    Listening,
    Stopped,
}
```

- [ ] **Step 2: 写编排器**

创建 `src-tauri/src/voice/session.rs`：

```rust
use crate::voice::asr::{AsrEvent, AsrProvider};
use crate::voice::audio::AudioSource;
use crate::voice::config;
use crate::voice::error::{Result, VoiceError};
use crate::voice::event::{SessionState, VoiceEvent};
use crate::voice::llm::prompt::{build_request, parse_command};
use crate::voice::llm::TextModel;
use crate::voice::wake::{WakeDetector, WakeOutcome};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio::sync::mpsc;

pub struct SessionHandle {
    audio: Arc<dyn AudioSource>,
    /// 通知泵循环退出
    shutdown: mpsc::Sender<()>,
}

impl SessionHandle {
    pub async fn stop(self) -> Result<()> {
        let _ = self.shutdown.send(()).await;
        self.audio.stop().await
    }
}

pub struct SessionDeps {
    pub audio: Arc<dyn AudioSource>,
    pub asr: Arc<dyn AsrProvider>,
    pub llm: Arc<dyn TextModel>,
}

/// 启动一次会话。返回后音频泵已在后台运行。
pub async fn start(deps: SessionDeps, events: Channel<VoiceEvent>) -> Result<SessionHandle> {
    let _ = events.send(VoiceEvent::State {
        state: SessionState::Starting,
    });

    deps.audio.ensure_permission().await?;

    let (asr_tx, mut asr_rx) = mpsc::channel::<AsrEvent>(64);
    let mut asr_session = deps.asr.open(asr_tx).await?;

    // 协议要求收到 task-started 之后才能送音频，否则服务端会直接断开
    match tokio::time::timeout(Duration::from_secs(10), asr_rx.recv()).await {
        Ok(Some(AsrEvent::Started)) => {}
        Ok(Some(AsrEvent::Failed { message })) => return Err(VoiceError::Asr(message)),
        Ok(_) => return Err(VoiceError::Asr("服务端未按协议返回 task-started".into())),
        Err(_) => return Err(VoiceError::Asr("等待服务端就绪超时".into())),
    }

    let mut pcm_rx = deps.audio.start().await?;
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    let _ = events.send(VoiceEvent::State {
        state: SessionState::Listening,
    });

    let llm = deps.llm.clone();
    let events_for_pump = events.clone();

    tokio::spawn(async move {
        let mut detector = WakeDetector::new(
            config::WAKE_WORD,
            Duration::from_secs(config::ARMED_TIMEOUT_SECS),
        );

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    let _ = asr_session.finish().await;
                    break;
                }

                frame = pcm_rx.recv() => {
                    let Some(pcm) = frame else {
                        let _ = asr_session.finish().await;
                        break;
                    };
                    if let Err(e) = asr_session.send_audio(pcm).await {
                        let _ = events_for_pump.send(VoiceEvent::Error {
                            stage: e.stage(),
                            message: e.to_string(),
                        });
                        break;
                    }
                }

                event = asr_rx.recv() => {
                    let Some(event) = event else { break };

                    match event {
                        AsrEvent::Partial { text, sentence_id } => {
                            let _ = events_for_pump.send(VoiceEvent::Transcript {
                                text, final_: false, index: sentence_id,
                            });
                        }
                        AsrEvent::Final { text, sentence_id } => {
                            let _ = events_for_pump.send(VoiceEvent::Transcript {
                                text: text.clone(), final_: true, index: sentence_id,
                            });

                            match detector.on_final(&text, Instant::now()) {
                                WakeOutcome::None => {}
                                WakeOutcome::Awakened => {
                                    let _ = events_for_pump.send(VoiceEvent::Wake);
                                }
                                WakeOutcome::Command(utterance) => {
                                    let _ = events_for_pump.send(VoiceEvent::Wake);
                                    // 命令解析可能要几秒，不能卡住音频泵
                                    spawn_command_resolution(
                                        llm.clone(),
                                        events_for_pump.clone(),
                                        utterance,
                                    );
                                }
                            }
                        }
                        AsrEvent::Failed { message } => {
                            let _ = events_for_pump.send(VoiceEvent::Error {
                                stage: crate::voice::error::Stage::Asr,
                                message,
                            });
                            break;
                        }
                        AsrEvent::Finished => break,
                        AsrEvent::Started => {}
                    }
                }
            }
        }

        let _ = events_for_pump.send(VoiceEvent::State {
            state: SessionState::Stopped,
        });
    });

    Ok(SessionHandle {
        audio: deps.audio,
        shutdown: shutdown_tx,
    })
}

/// LLM 失败只报错，不终止会话：一次命令没解析出来，不该把麦克风也关掉。
fn spawn_command_resolution(
    llm: Arc<dyn TextModel>,
    events: Channel<VoiceEvent>,
    utterance: String,
) {
    tokio::spawn(async move {
        match llm.complete(build_request(&utterance)).await {
            Ok(raw) => {
                let _ = events.send(VoiceEvent::Command {
                    command: parse_command(&raw),
                    source: utterance,
                    raw,
                });
            }
            Err(e) => {
                let _ = events.send(VoiceEvent::Error {
                    stage: e.stage(),
                    message: e.to_string(),
                });
            }
        }
    });
}
```

- [ ] **Step 3: 挂进模块树并编译**

`src-tauri/src/voice/mod.rs` 加 `pub mod event;` 与 `pub mod session;`。

```bash
cd src-tauri && cargo check
```

Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/voice/
git commit -m "feat(voice): 会话编排器，串联识别链路与命令解析链路"
```

---

## Task 11: 对外命令

**Files:**
- Create: `src-tauri/src/voice/commands.rs`
- Modify: `src-tauri/src/voice/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写命令**

创建 `src-tauri/src/voice/commands.rs`：

```rust
use crate::voice::asr::dashscope_ws::DashScopeWs;
use crate::voice::audio::android::AndroidMic;
use crate::voice::error::VoiceError;
use crate::voice::event::{SessionState, VoiceEvent};
use crate::voice::llm::openai_sdk::OpenAiCompatibleModel;
use crate::voice::session::{self, SessionDeps, SessionHandle};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct VoiceState(pub Mutex<Option<SessionHandle>>);

#[tauri::command]
pub async fn start_asr<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
    on_event: Channel<VoiceEvent>,
) -> Result<(), String> {
    let mut slot = state.0.lock().await;
    if slot.is_some() {
        return Err(VoiceError::AlreadyRunning.to_string());
    }

    let deps = SessionDeps {
        audio: Arc::new(AndroidMic::new(app.clone())),
        asr: Arc::new(DashScopeWs::from_config()),
        llm: Arc::new(OpenAiCompatibleModel::from_config().map_err(|e| e.to_string())?),
    };

    match session::start(deps, on_event.clone()).await {
        Ok(handle) => {
            *slot = Some(handle);
            Ok(())
        }
        Err(e) => {
            // 启动阶段失败时编排器还没起来，这里补发终态，
            // 否则前端会一直停在 starting
            let _ = on_event.send(VoiceEvent::Error {
                stage: e.stage(),
                message: e.to_string(),
            });
            let _ = on_event.send(VoiceEvent::State {
                state: SessionState::Stopped,
            });
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn stop_asr(state: State<'_, VoiceState>) -> Result<(), String> {
    let handle = state.0.lock().await.take();
    match handle {
        Some(handle) => handle.stop().await.map_err(|e| e.to_string()),
        None => Ok(()),
    }
}
```

- [ ] **Step 2: 删掉冒烟命令并注册**

`src-tauri/src/voice/mod.rs` 改为：

```rust
pub mod asr;
pub mod audio;
pub mod commands;
pub mod config;
pub mod error;
pub mod event;
pub mod llm;
pub mod session;
pub mod tls;
pub mod wake;
```

`src-tauri/src/lib.rs` 的 builder 链改为：

```rust
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_mic::init())
    .manage(voice::commands::VoiceState::default())
    .invoke_handler(tauri::generate_handler![
      voice::commands::start_asr,
      voice::commands::stop_asr
    ])
    .setup(|app| {
```

- [ ] **Step 3: 编译并跑全部测试**

```bash
cd src-tauri && cargo check && cargo test
```

Expected: 编译通过，`25 passed`（wake 9 + protocol 10 + prompt 6）。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src
git commit -m "feat(voice): 暴露 start_asr 与 stop_asr 命令"
```

---

## Task 12: 前端绑定层

**Files:**
- Create: `src/lib/voice/types.ts`
- Create: `src/lib/voice/index.ts`
- Modify: `src/lib/platform.ts`

- [ ] **Step 1: 写类型**

创建 `src/lib/voice/types.ts`：

```ts
/** 与 src-tauri/src/voice/event.rs 的 VoiceEvent 一一对应，改动需同步两侧 */

export type SessionState = 'starting' | 'listening' | 'stopped';

export type ErrorStage = 'permission' | 'audio' | 'asr' | 'llm';

export type VoiceCommand = {
  intent: string;
  params: Record<string, unknown>;
  reply: string;
};

export type VoiceEvent =
  | { type: 'state'; state: SessionState }
  | { type: 'transcript'; text: string; final: boolean; index: number }
  | { type: 'wake' }
  | { type: 'command'; command: VoiceCommand; source: string; raw: string }
  | { type: 'error'; stage: ErrorStage; message: string };

export type VoiceHandlers = {
  onState?: (state: SessionState) => void;
  onTranscript?: (text: string, final: boolean, index: number) => void;
  onWake?: () => void;
  onCommand?: (command: VoiceCommand, source: string, raw: string) => void;
  onError?: (stage: ErrorStage, message: string) => void;
};
```

- [ ] **Step 2: 写绑定**

创建 `src/lib/voice/index.ts`：

```ts
import { Channel, invoke } from '@tauri-apps/api/core';
import type { VoiceEvent, VoiceHandlers } from './types';

export type * from './types';

/**
 * 开启语音识别。原生侧会持续采集麦克风、做唤醒词判定，
 * 命中后把命令通过 onCommand 交回来。
 */
export async function startASR(handlers: VoiceHandlers): Promise<void> {
  const channel = new Channel<VoiceEvent>();

  channel.onmessage = (event) => {
    switch (event.type) {
      case 'state':
        handlers.onState?.(event.state);
        break;
      case 'transcript':
        handlers.onTranscript?.(event.text, event.final, event.index);
        break;
      case 'wake':
        handlers.onWake?.();
        break;
      case 'command':
        handlers.onCommand?.(event.command, event.source, event.raw);
        break;
      case 'error':
        handlers.onError?.(event.stage, event.message);
        break;
    }
  };

  await invoke('start_asr', { onEvent: channel });
}

export async function stopASR(): Promise<void> {
  await invoke('stop_asr');
}
```

- [ ] **Step 3: 加平台常量**

在 `src/lib/platform.ts` 末尾追加：

```ts
/** 语音识别只在安卓端有原生实现 */
export const IS_ANDROID = __TAURI_PLATFORM__ === 'android';
```

- [ ] **Step 4: 检查**

```bash
pnpm check
```

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/lib
git commit -m "feat(voice): 前端语音识别绑定层"
```

---

## Task 13: Demo 界面

**Files:**
- Create: `src/components/voice-demo.tsx`
- Modify: `src/components/mobile/home.tsx`

- [ ] **Step 1: 写 demo 组件**

创建 `src/components/voice-demo.tsx`：

```tsx
import { Mic, MicOff } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { IS_ANDROID } from '@/lib/platform';
import { startASR, stopASR } from '@/lib/voice';
import type { SessionState, VoiceCommand } from '@/lib/voice';
import { cn } from '@/lib/utils';

type LogEntry =
  | { kind: 'transcript'; id: string; index: number; text: string; final: boolean }
  | { kind: 'command'; id: string; command: VoiceCommand; source: string }
  | { kind: 'wake'; id: string }
  | { kind: 'error'; id: string; stage: string; message: string };

const BUTTON_LABEL: Record<SessionState, string> = {
  starting: '正在启动…',
  listening: '停止识别',
  stopped: '开始识别',
};

export function VoiceDemo() {
  const [state, setState] = useState<SessionState>('stopped');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const append = useCallback((entry: LogEntry) => {
    setEntries((current) => [...current, entry]);
  }, []);

  const upsertTranscript = useCallback(
    (text: string, final: boolean, index: number) => {
      setEntries((current) => {
        const at = current.findIndex(
          (entry) => entry.kind === 'transcript' && entry.index === index,
        );
        const next: LogEntry = {
          kind: 'transcript',
          id: `t-${index}`,
          index,
          text,
          final,
        };
        if (at === -1) return [...current, next];
        return current.with(at, next);
      });
    },
    [],
  );

  const handleToggle = useCallback(async () => {
    if (state === 'listening') {
      await stopASR();
      return;
    }

    setEntries([]);
    try {
      await startASR({
        onState: setState,
        onTranscript: upsertTranscript,
        onWake: () => append({ kind: 'wake', id: `w-${Date.now()}` }),
        onCommand: (command, source) =>
          append({ kind: 'command', id: `c-${Date.now()}`, command, source }),
        onError: (stage, message) =>
          append({ kind: 'error', id: `e-${Date.now()}`, stage, message }),
      });
    } catch (error) {
      append({
        kind: 'error',
        id: `e-${Date.now()}`,
        stage: 'asr',
        message: String(error),
      });
    }
  }, [append, state, upsertTranscript]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>语音命令</CardTitle>
        <CardDescription>
          {IS_ANDROID
            ? '说「你好小财」唤醒，紧接着说出指令'
            : '语音识别只在安卓端有原生实现'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          onClick={handleToggle}
          disabled={!IS_ANDROID || state === 'starting'}
          variant={state === 'listening' ? 'destructive' : 'default'}
        >
          {state === 'listening' ? (
            <MicOff data-icon="inline-start" />
          ) : (
            <Mic data-icon="inline-start" />
          )}
          {BUTTON_LABEL[state]}
        </Button>

        <div
          ref={scrollRef}
          className="h-80 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm"
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground">识别结果会显示在这里</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <LogLine entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case 'transcript':
      return (
        <span
          className={cn(
            entry.final ? 'text-foreground' : 'text-muted-foreground italic',
          )}
        >
          {entry.text}
        </span>
      );
    case 'wake':
      return <span className="text-primary">— 已唤醒 —</span>;
    case 'command':
      return (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
          <div className="font-medium text-primary">{entry.command.intent}</div>
          <div className="text-muted-foreground text-xs">原句：{entry.source}</div>
          {entry.command.reply ? <div>{entry.command.reply}</div> : null}
          {Object.keys(entry.command.params).length > 0 ? (
            <pre className="mt-1 overflow-x-auto text-xs">
              {JSON.stringify(entry.command.params, null, 2)}
            </pre>
          ) : null}
        </div>
      );
    case 'error':
      return (
        <span className="text-destructive">
          [{entry.stage}] {entry.message}
        </span>
      );
  }
}
```

- [ ] **Step 2: 挂到移动端首页**

`MobilePage` 的 `children` 会渲染进一个已经带滚动的 `<main>` 里，把组件作为子节点传进去即可。把 `src/components/mobile/home.tsx` 整体替换为：

```tsx
import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { MobilePage } from '@/components/mobile/page';
import { Button } from '@/components/ui/button';
import { VoiceDemo } from '@/components/voice-demo';

/**
 * 移动端首页。连接状态与配置都在设置页里。
 * 连接的建立由根路由的 useConnectionBootstrap 负责，不依赖本页挂载。
 */
export function MobileHome() {
  return (
    <MobilePage
      actions={
        <Button asChild variant="outline" size="icon" aria-label="设置">
          <Link to="/settings">
            <Settings />
          </Link>
        </Button>
      }
    >
      <VoiceDemo />
    </MobilePage>
  );
}
```

- [ ] **Step 3: 检查**

```bash
pnpm check && pnpm build
```

Expected: 无错误。若 `current.with(...)` 报 TS 错误，确认 `tsconfig.json` 的 `lib` 含 `ES2023`；不含则改用 `current.map((e, i) => (i === at ? next : e))`。

- [ ] **Step 4: 提交**

```bash
git add src/components
git commit -m "feat(voice): 语音命令 demo 界面"
```

---

## Task 14: 真机端到端验证

**Files:** 无代码改动

- [ ] **Step 1: 填入真实配置**

编辑 `src-tauri/src/voice/config.rs`，把 `DASHSCOPE_API_KEY` 和 `ASR_WS_URL` 换成真值，确认 `LLM_MODEL` 是兼容端点上可用的模型名。

- [ ] **Step 2: 装到真机**

```bash
pnpm android:dev
```

- [ ] **Step 3: 逐项验证**

| 操作 | 预期 |
|---|---|
| 首次点「开始识别」 | 弹出麦克风权限申请 |
| 拒绝权限 | 日志区出现 `[permission]` 错误，按钮回到「开始识别」 |
| 授权后点「开始识别」 | 按钮变成「停止识别」 |
| 说「今天天气不错」 | 日志区出现该句文本，先斜体后转正 |
| 说「你好小财，打开投影仪」 | 出现「已唤醒」，随后出现 intent 为 `open_projector` 的命令卡片 |
| 说「你好小财」后停顿，再说「把灯关掉」 | 先「已唤醒」，第二句后出现命令卡片 |
| 说「你好小财」后静默超过 10 秒，再说一句普通话 | 该句只作为文本出现，不产生命令 |
| 点「停止识别」 | 按钮回到「开始识别」，不再出现新文本 |
| 停止后再次开始 | 能正常重新识别 |

- [ ] **Step 4: 排查参考**

| 现象 | 排查方向 |
|---|---|
| `Expect rustls-platform-verifier to be initialized` | Task 1 的 `use_preconfigured_tls` 没生效，检查 `default-features = false` |
| 连接立刻失败 | `ASR_WS_URL` 的 WorkspaceId 未替换，或 API Key 与地域不匹配 |
| 有权限但收不到文本 | 确认送的是 `task-started` 之后的音频；确认帧是 16 kHz 单声道 PCM16 |
| 有 ASR 文本但没有命令 | 唤醒词匹配失败，把 ASR 原文打出来看归一化后是否含「你好小财」 |
| 命令 intent 总是 unknown | 看 `raw` 字段里模型的原始输出，多半是模型名不对或没按 JSON 返回 |

- [ ] **Step 5: 提交验证记录**

把实际可用的模型名、WorkspaceId 格式等信息补进设计文档的「待办前提」一节，然后：

```bash
git add docs/superpowers/specs/2026-08-06-android-voice-command-design.md
git commit -m "docs: 补充语音链路真机联调结论"
```
