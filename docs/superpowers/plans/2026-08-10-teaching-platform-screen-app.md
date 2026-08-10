# 辅助教学平台接入（一）协议层与大屏 APP 端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成 `teaching-platform` 协议 crate（HTTP 信封 / 大屏换票 / WS 帧编解码 / 连接生命周期 / 退避），并在桌面端实现大屏 APP 端：换票 → `/ws/app` → 响应 `app.open_url` / `app.close_browser` / `app.status` → 托管 Chrome 进程；连接状态机整体下沉 Rust，前端只订阅事件与填表。

**Architecture:** 新增 `src-tauri/crates/teaching-platform` 纯协议 crate，不依赖 tauri，帧编解码与连接配对全部可 `cargo test`。app crate 的 `platform/` 模块把它接到 Tauri 的 command / event / state 上；`platform/screen_app/` 提供大屏角色的入站处理与 Chrome 托管。前端删掉 `MockConnectionClient`，改为订阅 `platform://connection` 与 `platform://log`。

**Tech Stack:** Rust 1.96 / tokio-tungstenite 0.29 / reqwest 0.13（`rustls-no-provider`）/ tauri 2.11 / tauri-plugin-store 2.4 / React 19 + shadcn/ui + jotai

设计文档：`docs/superpowers/specs/2026-08-10-teaching-platform-integration-design.md`

---

## 开始前必读

### 这份计划的边界

设计文档的实施顺序共 7 步，本计划只做前 4 步。机器人端（Device Flow、`/ws/robot`、`ContextStore`、`llm/` 上移、Agent 两轮工具循环）是第二份计划的内容，做完本计划后再写。

因此本计划里**刻意不做**这些东西，遇到时不要顺手补：

- `ws/catalog.rs`（22 个 op 的 schema）—— 只有机器人当工具用，大屏端一条都不发
- `http/device.rs`（Device Flow）
- `ws/event.rs` 里除 `conn.kicked` / `lesson.started` / `lesson.ended` 之外的事件枚举
  （前三个大屏端必须处理：一个是顶号，两个是常驻连接跨课堂时的房间迁移）
- 任何对 `voice/` 与 `voice/llm/` 的改动

但本计划要保证 **Android 也能编过**：`platform/` 模块在两个平台都编译，移动端的 `run()` 只写一条「尚未实现」日志。这样前端只需要一套绑定层。

### 联调用的两个外部值

测试服务器 `http://8.163.33.11:8084`，无 SSL。大屏凭证 `app_key=123456` / `app_secret=1234567890`。这两个值填进应用的配置表单，不进版本库。

### 已经踩过的坑

**`ws_url` 是路径不是绝对地址。** `POST /api/v1/screen/token` 返回 `"ws_url": "/ws/app"`。WebSocket 对接文档 §1 说「直接用它，不要自己拼」是不准确的，实际必须拼到 base URL 上并做 `http→ws` 替换。Task 5 的 `resolve_ws_url` 对两种形态都要兼容。

**配对只认 `packageId`。** `conn.ping` 的 ack 里 `op` 是 `conn.pong`。顺手比对 `op` 会让心跳永远超时，25 秒一次，很难发现。

**macOS 上 `/Applications/Google Chrome.app` 是目录不是可执行文件。** 直接 `Command::new` 会得到 `Permission denied (os error 13)`。Task 9 的 `normalize_chrome_path` 负责转成 `Contents/MacOS/Google Chrome`。

**登录快照里的 `lesson_id` 只在首帧正确。** 大屏开机常驻，一条连接可能持续数天、跨越十几次课堂，服务端会在课堂起止时把它重挂到新房间（WS 文档 §5.1）。只认快照的话，界面上的课堂会永远停在开机那一刻，而且因为不报错、不断连，很难被发现。Task 4 与 Task 10 处理 `lesson.started` / `lesson.ended`。

### 项目约定

- 前端检查要跑两条：`pnpm check`（Biome，`biome check --write`，只管 lint 与格式）和
  `pnpm exec tsc --noEmit`（类型）。**Biome 不做类型检查**，构建也不做——`pnpm build` 是
  `rsbuild build`，没装类型检查插件，改错了类型它照样打包成功。本计划改的都是跨文件的类型，
  漏跑 `tsc` 等于没验证。`AGENTS.md` 里写的 `pnpm run lint` 在 `package.json` 中不存在。
- 跑整个桌面应用用 `pnpm pc:dev`（`tauri dev`）。`pnpm dev` 只起 rsbuild，没有原生侧，
  `isTauri()` 为假，所有 command 都会走降级分支。
- Rust 测试在 `src-tauri/` 下 `cargo test`；协议 crate 单独跑用 `cargo test -p teaching-platform`。
- 注释用中文。只解释代码本身表达不了的约束，不要复述代码在做什么。
- `src-tauri/` 不是 workspace，`plugins/mic` 已经是 path 依赖，新 crate 照这个模式加即可。

---

## 文件结构

### 新建

| 路径 | 职责 |
|---|---|
| `src-tauri/crates/teaching-platform/Cargo.toml` | 协议 crate 清单 |
| `src-tauri/crates/teaching-platform/src/lib.rs` | 模块聚合与再导出 |
| `src-tauri/crates/teaching-platform/src/error.rs` | `ApiError` / `PlatformError` / 错误分类 |
| `src-tauri/crates/teaching-platform/src/envelope.rs` | HTTP 统一信封解析 |
| `src-tauri/crates/teaching-platform/src/http/mod.rs` | `HttpClient` 与 `resolve_ws_url` |
| `src-tauri/crates/teaching-platform/src/http/screen.rs` | 大屏换票 |
| `src-tauri/crates/teaching-platform/src/ws/mod.rs` | ws 子模块聚合 |
| `src-tauri/crates/teaching-platform/src/ws/frame.rs` | 四种帧的编解码 |
| `src-tauri/crates/teaching-platform/src/ws/snapshot.rs` | `auth.login` ack 的现场快照 |
| `src-tauri/crates/teaching-platform/src/ws/event.rs` | 服务端事件枚举 |
| `src-tauri/crates/teaching-platform/src/ws/backoff.rs` | 指数退避 + 抖动 |
| `src-tauri/crates/teaching-platform/src/ws/conn.rs` | 连接生命周期、packageId 配对、心跳 |
| `src-tauri/src/platform/mod.rs` | 角色分派与启动入口 |
| `src-tauri/src/platform/config.rs` | 按角色分化的配置读写 |
| `src-tauri/src/platform/events.rs` | `ConnectionInfo` / `LogEntry` 前后端契约 |
| `src-tauri/src/platform/state.rs` | 连接状态、日志环形缓冲、事件广播 |
| `src-tauri/src/platform/commands.rs` | 对前端暴露的 command |
| `src-tauri/src/platform/screen_app/mod.rs` | 大屏连接循环与入站 `app.*` 分发 |
| `src-tauri/src/platform/screen_app/browser.rs` | Chrome 进程托管 |
| `src/lib/platform-api/types.ts` | 与 Rust 对齐的类型 |
| `src/lib/platform-api/index.ts` | command / event 薄封装 |
| `src/hooks/use-platform-log.ts` | 订阅 `platform://log` |
| `src/components/log-panel.tsx` | 日志区，两端共用 |

### 修改

| 路径 | 改动 |
|---|---|
| `src-tauri/Cargo.toml` | 加 `teaching-platform` path 依赖与 `libc`（unix） |
| `src-tauri/src/lib.rs` | 注册 platform state 与 command，启动时自动连接 |
| `src-tauri/src/tray.rs` | 托盘改为 Rust 内部同步，去掉前端 emit 绕路 |
| `src/hooks/use-connection.ts` | 改为订阅 `platform://connection` |
| `src/hooks/use-server-config.ts` | 改为调 command |
| `src/hooks/use-save-server-config.ts` | 配置类型换成 `RoleConfig` |
| `src/hooks/use-server-config-draft.ts` | 类型换成 `RoleConfig` |
| `src/lib/format.ts` | `formatText` 放宽到收 `number`，删掉 `formatLatency` |
| `src/components/server-config-fields.tsx` | 按角色渲染字段 |
| `src/components/server-config-form.tsx` | 类型换成 `RoleConfig` |
| `src/components/connection-state-badge.tsx` | 补 `authorizing` 状态 |
| `src/components/connection-status-card.tsx` | 字段对齐新 `ConnectionInfo` |
| `src/components/connection-details.tsx` | 字段对齐新 `ConnectionInfo` |
| `src/components/desktop/home.tsx` | 加 `<LogPanel>` |
| `src/components/mobile/home.tsx` | 加 `<LogPanel>` |
| `src/components/mobile/settings.tsx` | 凭据字段按角色分化 |
| `src/routes/__root.tsx` | 去掉 `useConnectionBootstrap` |

### 删除

| 路径 | 原因 |
|---|---|
| `src/lib/connection/mock-client.ts` | 被 Rust 连接层取代 |
| `src/lib/connection/client.ts` | 同上 |
| `src/lib/connection/types.ts` | 被 `src/lib/platform-api/types.ts` 取代 |
| `src/lib/connection/tray-bridge.ts` | 托盘改为 Rust 内部同步 |
| `src/lib/config/store.ts` | 配置读写移到 Rust |

---

## Task 1: 协议 crate 骨架、错误类型与信封

**Files:**
- Create: `src-tauri/crates/teaching-platform/Cargo.toml`
- Create: `src-tauri/crates/teaching-platform/src/lib.rs`
- Create: `src-tauri/crates/teaching-platform/src/error.rs`
- Create: `src-tauri/crates/teaching-platform/src/envelope.rs`

- [ ] **Step 1: 建 crate 清单**

```bash
mkdir -p src-tauri/crates/teaching-platform/src/http src-tauri/crates/teaching-platform/src/ws
```

创建 `src-tauri/crates/teaching-platform/Cargo.toml`：

```toml
[package]
name = "teaching-platform"
version = "0.1.0"
description = "辅助教学平台的 HTTP 与 WebSocket 协议实现"
edition = "2021"
rust-version = "1.85"

[dependencies]
async-trait = "0.1"
futures-util = "0.3"
log = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tokio = { version = "1.53", features = ["rt", "sync", "time", "macros"] }
tokio-tungstenite = { version = "0.29", features = ["rustls-tls-webpki-roots"] }
uuid = { version = "1.20", features = ["v4"] }

# reqwest 0.13 默认走 rustls-platform-verifier，在 Android 上要 JNI 初始化。
# 这里关掉默认 feature，由调用方注入自己构造的 TLS 客户端。
[dependencies.reqwest]
version = "0.13"
default-features = false
features = ["json", "charset", "http2", "rustls-no-provider"]

[dev-dependencies]
tokio = { version = "1.53", features = ["rt-multi-thread", "macros", "net", "time", "sync"] }
```

- [ ] **Step 2: 写失败的错误分类测试**

创建 `src-tauri/crates/teaching-platform/src/error.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn api(code: i32) -> PlatformError {
        PlatformError::Api(ApiError { code, message: "测试".into() })
    }

    #[test]
    fn 业务码_401xx_视为凭证错误() {
        assert!(api(40101).is_credential());
        assert!(api(40102).is_credential());
        assert!(api(40299).is_credential());
    }

    #[test]
    fn 业务码_403xx_之外不算凭证错误() {
        assert!(!api(40300).is_credential());
        assert!(!api(40001).is_credential());
    }

    #[test]
    fn http_401_与_403_视为凭证错误() {
        for status in [401u16, 403] {
            let error = PlatformError::Status { status, message: String::new() };
            assert!(error.is_credential(), "status {status} 应判为凭证错误");
        }
    }

    #[test]
    fn 服务端_5xx_与限流视为临时故障() {
        for status in [500u16, 502, 503, 504, 408, 429] {
            let error = PlatformError::Status { status, message: String::new() };
            assert!(error.is_transient(), "status {status} 应判为临时故障");
        }
    }

    #[test]
    fn 网络与超时视为临时故障() {
        assert!(PlatformError::Http("connection refused".into()).is_transient());
        assert!(PlatformError::Ws("broken pipe".into()).is_transient());
        assert!(PlatformError::Timeout.is_transient());
    }

    #[test]
    fn 顶号不可重试而其他关闭码可以() {
        assert!(!PlatformError::Closed { code: 4005 }.is_transient());
        assert!(PlatformError::Closed { code: 4009 }.is_transient());
    }

    #[test]
    fn 认证失败的关闭码算凭证错误() {
        assert!(PlatformError::Closed { code: 4001 }.is_credential());
    }

    #[test]
    fn api_错误直接展示后端中文文案() {
        let error = PlatformError::Api(ApiError { code: 40006, message: "不支持的指令".into() });
        assert_eq!(error.to_string(), "不支持的指令");
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: 编译失败，`cannot find type PlatformError in this scope`。

- [ ] **Step 4: 实现错误类型**

在 `error.rs` 测试模块**之前**插入：

```rust
/// 后端返回的业务错误。message 保证是可直接展示或朗读的中文，不做二次翻译。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub code: i32,
    pub message: String,
}

/// 只把客户端要分支处理的码做成常量，全表见 HTTP 对接文档 §3.1。
pub mod code {
    pub const UNSUPPORTED_OP: i32 = 40006;
    pub const EXPIRED_COMMAND: i32 = 40007;
    pub const TOKEN_EXPIRED: i32 = 40102;
    pub const DUPLICATE_PACKAGE: i32 = 40902;
    pub const INTERNAL: i32 = 50001;
    pub const SCREEN_OFFLINE: i32 = 50401;
    pub const DEVICE_OFFLINE: i32 = 50402;
}

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("网络请求失败：{0}")]
    Http(String),

    #[error("{}", .0.message)]
    Api(ApiError),

    /// 非 2xx 且响应体不是标准信封，只能拿状态码分类
    #[error("服务端返回 {status}")]
    Status { status: u16, message: String },

    #[error("WebSocket 错误：{0}")]
    Ws(String),

    #[error("连接已关闭（{code}）")]
    Closed { code: u16 },

    #[error("等待响应超时")]
    Timeout,

    #[error("解析失败：{0}")]
    Decode(String),
}

pub type Result<T> = std::result::Result<T, PlatformError>;

impl PlatformError {
    /// 凭证或授权错误：重试没有意义，要人工改配置
    pub fn is_credential(&self) -> bool {
        match self {
            Self::Api(error) => (40100..40300).contains(&error.code),
            Self::Status { status, .. } => matches!(status, 401 | 403),
            Self::Closed { code } => *code == 4001,
            _ => false,
        }
    }

    /// 临时故障：退避后重试
    pub fn is_transient(&self) -> bool {
        match self {
            Self::Http(_) | Self::Ws(_) | Self::Timeout => true,
            Self::Status { status, .. } => *status >= 500 || matches!(status, 408 | 429),
            // 4005 是顶号，重连会和新连接来回顶成死循环
            Self::Closed { code } => *code != 4005,
            _ => false,
        }
    }
}
```

- [ ] **Step 5: 写失败的信封测试**

创建 `src-tauri/crates/teaching-platform/src/envelope.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Payload {
        name: String,
    }

    fn parse(raw: &str) -> Result<Payload> {
        serde_json::from_str::<Envelope<Payload>>(raw)
            .map_err(|e| PlatformError::Decode(e.to_string()))?
            .into_data()
    }

    #[test]
    fn code_为_0_时取出_data() {
        let parsed = parse(r#"{"code":0,"message":"ok","data":{"name":"甲"}}"#).unwrap();
        assert_eq!(parsed, Payload { name: "甲".into() });
    }

    #[test]
    fn code_非_0_时转成_api_错误并保留中文文案() {
        let error = parse(r#"{"code":40101,"message":"凭证无效","data":null}"#).unwrap_err();
        match error {
            PlatformError::Api(api) => {
                assert_eq!(api.code, 40101);
                assert_eq!(api.message, "凭证无效");
            }
            other => panic!("应为 Api 错误，实际是 {other:?}"),
        }
    }

    #[test]
    fn code_为_0_但_data_缺失时报解析错误() {
        let error = parse(r#"{"code":0,"message":"ok"}"#).unwrap_err();
        assert!(matches!(error, PlatformError::Decode(_)));
    }

    #[test]
    fn 缺少_code_字段时按成功处理() {
        // 少数接口省略 code，文档约定等价于 0
        let parsed = parse(r#"{"data":{"name":"乙"}}"#).unwrap();
        assert_eq!(parsed.name, "乙");
    }

    #[test]
    fn into_unit_忽略_data_只看_code() {
        let ok: Envelope<serde_json::Value> =
            serde_json::from_str(r#"{"code":0,"message":"ok","data":null}"#).unwrap();
        assert!(ok.into_unit().is_ok());

        let bad: Envelope<serde_json::Value> =
            serde_json::from_str(r#"{"code":50001,"message":"服务异常"}"#).unwrap();
        assert!(matches!(bad.into_unit(), Err(PlatformError::Api(_))));
    }
}
```

- [ ] **Step 6: 实现信封**

在 `envelope.rs` 测试模块之前插入：

```rust
use crate::error::{ApiError, PlatformError, Result};
use serde::de::DeserializeOwned;
use serde::Deserialize;

/// 后端所有 HTTP 响应共用的外层结构。
#[derive(Debug, Deserialize)]
pub struct Envelope<T> {
    #[serde(default)]
    pub code: i32,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub data: Option<T>,
    #[serde(default)]
    pub request_id: Option<String>,
}

impl<T> Envelope<T> {
    fn check(&self) -> Result<()> {
        if self.code == 0 {
            return Ok(());
        }
        Err(PlatformError::Api(ApiError {
            code: self.code,
            message: self.message.clone(),
        }))
    }

    pub fn into_data(self) -> Result<T> {
        self.check()?;
        self.data
            .ok_or_else(|| PlatformError::Decode("响应缺少 data 字段".into()))
    }

    pub fn into_unit(self) -> Result<()> {
        self.check()
    }
}

/// 先按 HTTP 状态码分流，再用业务码区分原因——顺序与 HTTP 对接文档 §3 的建议一致。
async fn read_body(response: reqwest::Response) -> Result<(u16, String)> {
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| PlatformError::Http(e.to_string()))?;
    Ok((status, body))
}

pub async fn read_envelope<T: DeserializeOwned>(response: reqwest::Response) -> Result<T> {
    let (status, body) = read_body(response).await?;
    match serde_json::from_str::<Envelope<T>>(&body) {
        Ok(envelope) => envelope.into_data(),
        Err(_) if !(200..300).contains(&status) => {
            Err(PlatformError::Status { status, message: body })
        }
        Err(e) => Err(PlatformError::Decode(format!("响应不是标准信封：{e}"))),
    }
}

pub async fn read_envelope_unit(response: reqwest::Response) -> Result<()> {
    let (status, body) = read_body(response).await?;
    match serde_json::from_str::<Envelope<serde_json::Value>>(&body) {
        Ok(envelope) => envelope.into_unit(),
        Err(_) if !(200..300).contains(&status) => {
            Err(PlatformError::Status { status, message: body })
        }
        Err(e) => Err(PlatformError::Decode(format!("响应不是标准信封：{e}"))),
    }
}
```

- [ ] **Step 7: 写 lib.rs 并跑测试**

创建 `src-tauri/crates/teaching-platform/src/lib.rs`：

```rust
//! 辅助教学平台协议层。不依赖 tauri，可以直接 cargo test。

pub mod envelope;
pub mod error;

pub use error::{ApiError, PlatformError, Result};
```

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: `test result: ok. 13 passed; 0 failed`

- [ ] **Step 8: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): 新增协议 crate，实现错误分类与 HTTP 信封"
```

---

## Task 2: WebSocket 帧编解码

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/ws/mod.rs`
- Create: `src-tauri/crates/teaching-platform/src/ws/frame.rs`
- Modify: `src-tauri/crates/teaching-platform/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/crates/teaching-platform/src/ws/frame.rs`，先只写测试：

```rust
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
        let req = Frame::decode(r#"{"packageId":"p5","type":"req","op":"conn.ping","ts":1}"#).unwrap();
        assert_eq!(req, Frame::Req { package_id: "p5".into(), op: "conn.ping".into(), ts: 1, params: json!({}) });

        let ack = Frame::decode(r#"{"packageId":"p6","type":"ack","op":"conn.pong","ts":2}"#).unwrap();
        assert_eq!(ack, Frame::Ack { package_id: "p6".into(), op: "conn.pong".into(), ts: 2, data: json!({}) });
    }

    #[test]
    fn 显式_null_的_params_也当作空对象() {
        let frame = Frame::decode(r#"{"packageId":"p7","type":"req","op":"x","ts":1,"params":null}"#).unwrap();
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
            Frame::error("p10".into(), "app.open_url".into(), 50001, "拉起失败".into()),
        ] {
            assert_eq!(Frame::decode(&frame.encode()).unwrap(), frame);
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test frame
```

Expected: 编译失败，`cannot find type Frame in this scope`。

- [ ] **Step 3: 实现**

在 `frame.rs` 测试模块之前插入：

```rust
use crate::error::{PlatformError, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    Req { package_id: String, op: String, ts: i64, params: Value },
    Ack { package_id: String, op: String, ts: i64, data: Value },
    Error { package_id: String, op: String, ts: i64, code: i32, message: String },
    Event { package_id: String, op: String, ts: i64, data: Value },
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
        Self::Req { package_id: new_package_id(), op: op.into(), ts: now_ms(), params }
    }

    pub fn ack(package_id: String, op: String, data: Value) -> Self {
        Self::Ack { package_id, op, ts: now_ms(), data }
    }

    pub fn error(package_id: String, op: String, code: i32, message: String) -> Self {
        Self::Error { package_id, op, ts: now_ms(), code, message }
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
            Self::Req { op, .. } | Self::Ack { op, .. } | Self::Error { op, .. } | Self::Event { op, .. } => op,
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
            Self::Req { package_id, op, ts, params } => json!({
                "packageId": package_id, "type": "req", "op": op, "ts": ts, "params": params
            }),
            Self::Ack { package_id, op, ts, data } => json!({
                "packageId": package_id, "type": "ack", "op": op, "ts": ts, "data": data
            }),
            Self::Error { package_id, op, ts, code, message } => json!({
                "packageId": package_id, "type": "error", "op": op, "ts": ts,
                "code": code, "message": message
            }),
            Self::Event { package_id, op, ts, data } => json!({
                "packageId": package_id, "type": "event", "op": op, "ts": ts, "data": data
            }),
        };
        value.to_string()
    }
}
```

- [ ] **Step 4: 挂进模块树并跑测试**

创建 `src-tauri/crates/teaching-platform/src/ws/mod.rs`：

```rust
pub mod frame;
```

`src-tauri/crates/teaching-platform/src/lib.rs` 加一行 `pub mod ws;`（放在 `pub mod error;` 之后）。

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: `test result: ok. 24 passed; 0 failed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): WebSocket 四种帧的编解码"
```

---

## Task 3: 指数退避

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/ws/backoff.rs`
- Modify: `src-tauri/crates/teaching-platform/src/ws/mod.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/crates/teaching-platform/src/ws/backoff.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 无抖动时按_2_的幂次递增() {
        assert_eq!(delay_for(0, 0.0).as_millis(), 1_000);
        assert_eq!(delay_for(1, 0.0).as_millis(), 2_000);
        assert_eq!(delay_for(2, 0.0).as_millis(), 4_000);
        assert_eq!(delay_for(3, 0.0).as_millis(), 8_000);
    }

    #[test]
    fn 上限是_30_秒() {
        assert_eq!(delay_for(5, 0.0).as_millis(), 30_000);
        assert_eq!(delay_for(50, 0.0).as_millis(), 30_000);
        // 极端 attempt 不能让 2 的幂次溢出 panic
        assert_eq!(delay_for(u32::MAX, 0.0).as_millis(), 30_000);
    }

    #[test]
    fn 抖动上下各_20_个百分点() {
        assert_eq!(delay_for(0, 1.0).as_millis(), 1_200);
        assert_eq!(delay_for(0, -1.0).as_millis(), 800);
    }

    #[test]
    fn 连续取值单调递增直到封顶() {
        let mut backoff = Backoff::new();
        let mut previous = 0u128;
        for _ in 0..5 {
            let current = backoff.next_delay().as_millis();
            assert!(current > previous, "{current} 应大于 {previous}");
            previous = current;
        }
    }

    #[test]
    fn 实际抖动落在正负_20_个百分点内() {
        for _ in 0..200 {
            let mut backoff = Backoff::new();
            let millis = backoff.next_delay().as_millis();
            assert!((800..=1_200).contains(&millis), "首次退避 {millis}ms 越界");
        }
    }

    #[test]
    fn reset_后回到首次退避() {
        let mut backoff = Backoff::new();
        for _ in 0..6 {
            backoff.next_delay();
        }
        backoff.reset();
        assert!((800..=1_200).contains(&backoff.next_delay().as_millis()));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test backoff
```

Expected: 编译失败，`cannot find function delay_for`。

- [ ] **Step 3: 实现**

在 `backoff.rs` 测试模块之前插入：

```rust
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const BASE_MS: u64 = 1_000;
const MAX_MS: u64 = 30_000;
const JITTER: f64 = 0.2;

/// 纯函数形式的退避计算，`jitter_ratio` 取 [-1, 1]。
pub fn delay_for(attempt: u32, jitter_ratio: f64) -> Duration {
    let steps = attempt.min(20);
    let base = BASE_MS.saturating_mul(1u64 << steps).min(MAX_MS);
    let scaled = base as f64 * (1.0 + JITTER * jitter_ratio.clamp(-1.0, 1.0));
    Duration::from_millis(scaled.round() as u64)
}

/// 不引入 rand 依赖，用系统时钟的纳秒位当熵源。
/// 抖动的目的只是把同一栋楼里几十台大屏错开，不需要密码学强度。
fn jitter_ratio() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or_default();
    (nanos % 2_000_001) as f64 / 1_000_000.0 - 1.0
}

#[derive(Debug, Default)]
pub struct Backoff {
    attempt: u32,
}

impl Backoff {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn attempt(&self) -> u32 {
        self.attempt
    }

    pub fn next_delay(&mut self) -> Duration {
        let delay = delay_for(self.attempt, jitter_ratio());
        self.attempt = self.attempt.saturating_add(1);
        delay
    }

    /// 连接成功后调用，否则短暂抖动过后仍然按上一轮的长间隔重连
    pub fn reset(&mut self) {
        self.attempt = 0;
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

`src-tauri/crates/teaching-platform/src/ws/mod.rs` 加 `pub mod backoff;`。

```bash
cd src-tauri/crates/teaching-platform && cargo test backoff
```

Expected: `test result: ok. 6 passed; 0 failed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): 带抖动的指数退避"
```

---

## Task 4: 现场快照与服务端事件

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/ws/snapshot.rs`
- Create: `src-tauri/crates/teaching-platform/src/ws/event.rs`
- Modify: `src-tauri/crates/teaching-platform/src/ws/mod.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/crates/teaching-platform/src/ws/snapshot.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 解析完整快照() {
        let snapshot = Snapshot::from_value(json!({
            "conn_id": "c1",
            "client_type": "app",
            "lesson_id": 88,
            "classroom_id": 3,
            "lesson": { "id": 88, "title": "第 5 讲 决策树", "status": "ongoing",
                        "course_id": 12, "course_name": "机器学习导论" },
            "screen_state": { "view": "ppt", "courseware_id": 17, "page": 5,
                              "page_count": 32, "ideology_material_id": null },
            "active_quiz": null,
            "active_discussion": null,
            "attendance_open": true,
            "sign_in": { "status": "open", "code": "7K3M9Q", "signed": 31, "total": 45, "rate": 0.6889 }
        }))
        .unwrap();

        assert_eq!(snapshot.classroom_id, Some(3));
        assert_eq!(snapshot.lesson.as_ref().unwrap().title, "第 5 讲 决策树");
        assert_eq!(snapshot.lesson.as_ref().unwrap().course_name.as_deref(), Some("机器学习导论"));
        assert_eq!(snapshot.screen_state.as_ref().unwrap().page, 5);
        assert_eq!(snapshot.sign_in.as_ref().unwrap().signed, 31);
    }

    #[test]
    fn 未绑定课堂时_lesson_为_null() {
        let snapshot = Snapshot::from_value(json!({
            "conn_id": "c2", "client_type": "app",
            "lesson_id": null, "classroom_id": 3, "lesson": null,
            "screen_state": null, "attendance_open": false, "sign_in": null
        }))
        .unwrap();

        assert!(snapshot.lesson.is_none());
        assert_eq!(snapshot.lesson_id, None);
        assert_eq!(snapshot.classroom_id, Some(3));
    }

    #[test]
    fn 空对象也能解析成默认快照() {
        // 后端加字段不该让老客户端崩，少字段同理
        let snapshot = Snapshot::from_value(json!({})).unwrap();
        assert!(snapshot.lesson.is_none());
        assert!(snapshot.conn_id.is_none());
    }

    #[test]
    fn 出现未知字段时忽略而不是报错() {
        let snapshot = Snapshot::from_value(json!({ "classroom_id": 9, "brand_new_field": 1 })).unwrap();
        assert_eq!(snapshot.classroom_id, Some(9));
    }

    #[test]
    fn data_不是对象时报解析错误() {
        assert!(Snapshot::from_value(json!("nope")).is_err());
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test snapshot
```

Expected: 编译失败，`cannot find type Snapshot in this scope`。

- [ ] **Step 3: 实现快照**

在 `snapshot.rs` 测试模块之前插入：

```rust
use crate::error::{PlatformError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// `auth.login` ack 的 data。字段全部可缺省——后端加字段不该让客户端崩。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Snapshot {
    pub conn_id: Option<String>,
    pub client_type: Option<String>,
    pub lesson_id: Option<i64>,
    pub classroom_id: Option<i64>,
    pub lesson: Option<LessonBrief>,
    pub screen_state: Option<ScreenState>,
    pub attendance_open: Option<bool>,
    pub sign_in: Option<SignIn>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct LessonBrief {
    pub id: i64,
    pub title: String,
    pub status: String,
    pub course_id: Option<i64>,
    pub course_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct ScreenState {
    pub view: String,
    pub courseware_id: Option<i64>,
    pub page: i64,
    pub page_count: i64,
    pub ideology_material_id: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct SignIn {
    pub status: String,
    pub code: Option<String>,
    pub signed: i64,
    pub total: i64,
    pub rate: f64,
}

impl Snapshot {
    pub fn from_value(value: Value) -> Result<Self> {
        serde_json::from_value(value)
            .map_err(|e| PlatformError::Decode(format!("无法解析现场快照：{e}")))
    }
}
```

- [ ] **Step 4: 写事件枚举与测试**

创建 `src-tauri/crates/teaching-platform/src/ws/event.rs`：

```rust
use serde_json::Value;

/// 服务端事件。本阶段大屏端只关心顶号与课堂切换，其余一律落到 Unknown——
/// 后端加新事件不该让客户端报错。机器人端的事件在第二份计划里补。
#[derive(Debug, Clone, PartialEq)]
pub enum ServerEvent {
    Kicked { reason: String },
    /// 课堂开始。大屏是常驻程序，服务端会把它重挂到新课堂的房间
    LessonStarted { lesson: LessonChange },
    /// 课堂结束。此后大屏不再归属任何课堂，直到下一次 LessonStarted
    LessonEnded { lesson: LessonChange },
    Unknown { op: String, data: Value },
}

/// `lesson.started` / `lesson.ended` 的载荷。字段缺失时留空而不是丢弃整个事件：
/// 课堂归属的变化本身比标题重要，宁可显示「课堂 88」也不能继续显示上一节课。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LessonChange {
    pub lesson_id: Option<i64>,
    pub title: Option<String>,
    pub course_name: Option<String>,
}

impl LessonChange {
    fn parse(data: &Value) -> Self {
        let text = |key: &str| {
            data.get(key)
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .map(str::to_string)
        };

        Self {
            lesson_id: data.get("lesson_id").and_then(Value::as_i64),
            title: text("title"),
            course_name: text("course_name"),
        }
    }
}

impl ServerEvent {
    pub fn parse(op: &str, data: Value) -> Self {
        match op {
            "conn.kicked" => Self::Kicked {
                reason: data
                    .get("reason")
                    .and_then(Value::as_str)
                    .unwrap_or("同一身份在别处建立了新连接")
                    .to_string(),
            },
            "lesson.started" => Self::LessonStarted { lesson: LessonChange::parse(&data) },
            "lesson.ended" => Self::LessonEnded { lesson: LessonChange::parse(&data) },
            _ => Self::Unknown { op: op.to_string(), data },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 解析顶号事件() {
        assert_eq!(
            ServerEvent::parse("conn.kicked", json!({ "reason": "别处登录" })),
            ServerEvent::Kicked { reason: "别处登录".into() }
        );
    }

    #[test]
    fn 顶号事件缺少_reason_时给默认文案() {
        let ServerEvent::Kicked { reason } = ServerEvent::parse("conn.kicked", json!({})) else {
            panic!("应为 Kicked");
        };
        assert!(!reason.is_empty());
    }

    #[test]
    fn 解析课堂开始与结束() {
        let data = json!({ "lesson_id": 88, "title": "第 5 讲 决策树", "course_name": "机器学习导论" });
        let expected = LessonChange {
            lesson_id: Some(88),
            title: Some("第 5 讲 决策树".into()),
            course_name: Some("机器学习导论".into()),
        };

        assert_eq!(
            ServerEvent::parse("lesson.started", data.clone()),
            ServerEvent::LessonStarted { lesson: expected.clone() }
        );
        assert_eq!(
            ServerEvent::parse("lesson.ended", data),
            ServerEvent::LessonEnded { lesson: expected }
        );
    }

    #[test]
    fn 课堂事件字段缺失或为空串时留空而不是丢弃事件() {
        let ServerEvent::LessonStarted { lesson } =
            ServerEvent::parse("lesson.started", json!({ "title": "   " }))
        else {
            panic!("应为 LessonStarted");
        };

        assert_eq!(lesson, LessonChange::default());
    }

    #[test]
    fn 未知事件不报错而是落到_unknown() {
        assert_eq!(
            ServerEvent::parse("quiz.published", json!({ "quiz_id": 1 })),
            ServerEvent::Unknown { op: "quiz.published".into(), data: json!({ "quiz_id": 1 }) }
        );
    }
}
```

- [ ] **Step 5: 跑测试确认通过**

`src-tauri/crates/teaching-platform/src/ws/mod.rs` 加 `pub mod event;` 与 `pub mod snapshot;`。

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: `test result: ok. 40 passed; 0 failed`

- [ ] **Step 6: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): 现场快照与服务端事件解析"
```

---

## Task 5: HTTP 客户端与大屏换票

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/http/mod.rs`
- Create: `src-tauri/crates/teaching-platform/src/http/screen.rs`
- Modify: `src-tauri/crates/teaching-platform/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/crates/teaching-platform/src/http/mod.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn client(base_url: &str) -> HttpClient {
        HttpClient::new(base_url, reqwest::Client::new())
    }

    #[test]
    fn base_url_去掉结尾斜杠() {
        assert_eq!(client("http://a:8084/").base_url(), "http://a:8084");
        assert_eq!(client("http://a:8084").base_url(), "http://a:8084");
    }

    #[test]
    fn api_路径统一加_api_v1_前缀() {
        assert_eq!(client("http://a:8084").api("/screen/token"), "http://a:8084/api/v1/screen/token");
    }

    #[test]
    fn ws_url_是路径时拼到_base_上() {
        // 实测 POST /api/v1/screen/token 返回的就是 "/ws/app"
        assert_eq!(client("http://a:8084").resolve_ws_url("/ws/app"), "ws://a:8084/ws/app");
    }

    #[test]
    fn https_的_base_拼成_wss() {
        assert_eq!(client("https://a").resolve_ws_url("/ws/app"), "wss://a/ws/app");
    }

    #[test]
    fn ws_url_已是绝对地址时原样使用() {
        assert_eq!(client("http://a:8084").resolve_ws_url("ws://b:9/ws/app"), "ws://b:9/ws/app");
        assert_eq!(client("http://a:8084").resolve_ws_url("wss://b/ws/app"), "wss://b/ws/app");
    }

    #[test]
    fn ws_url_是_http_绝对地址时替换协议() {
        assert_eq!(client("http://a").resolve_ws_url("http://b/ws/app"), "ws://b/ws/app");
        assert_eq!(client("http://a").resolve_ws_url("https://b/ws/app"), "wss://b/ws/app");
    }

    #[test]
    fn ws_url_缺少前导斜杠时补上() {
        assert_eq!(client("http://a:8084").resolve_ws_url("ws/app"), "ws://a:8084/ws/app");
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test http
```

Expected: 编译失败，`cannot find type HttpClient`。

- [ ] **Step 3: 实现 HttpClient**

在 `http/mod.rs` 测试模块之前插入：

```rust
pub mod screen;

/// base_url 形如 `http://8.163.33.11:8084`，内部自行拼 `/api/v1`。
/// reqwest::Client 由调用方注入——app crate 用的是绕开平台证书验证器的那一个。
#[derive(Clone)]
pub struct HttpClient {
    base_url: String,
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new(base_url: impl Into<String>, inner: reqwest::Client) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            inner,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn api(&self, path: &str) -> String {
        format!("{}/api/v1{}", self.base_url, path)
    }

    pub(crate) fn inner(&self) -> &reqwest::Client {
        &self.inner
    }

    /// 换票响应里的 ws_url 可能是绝对地址也可能是路径，两种都要能连上。
    pub fn resolve_ws_url(&self, ws_url: &str) -> String {
        if ws_url.starts_with("ws://") || ws_url.starts_with("wss://") {
            return ws_url.to_string();
        }
        if let Some(rest) = ws_url.strip_prefix("https://") {
            return format!("wss://{rest}");
        }
        if let Some(rest) = ws_url.strip_prefix("http://") {
            return format!("ws://{rest}");
        }

        let origin = if let Some(rest) = self.base_url.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = self.base_url.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            self.base_url.clone()
        };

        format!("{origin}/{}", ws_url.trim_start_matches('/'))
    }
}
```

- [ ] **Step 4: 实现换票**

创建 `src-tauri/crates/teaching-platform/src/http/screen.rs`：

```rust
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
```

- [ ] **Step 5: 跑测试确认通过**

`src-tauri/crates/teaching-platform/src/lib.rs` 加 `pub mod http;`。

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: `test result: ok. 47 passed; 0 failed`

- [ ] **Step 6: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): HTTP 客户端与大屏换票，兼容路径形态的 ws_url"
```

---

## Task 6: 连接生命周期

这是协议 crate 里最关键的一块。测试用进程内的假服务端，真实走一遍 WebSocket 握手。

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/ws/conn.rs`
- Modify: `src-tauri/crates/teaching-platform/src/ws/mod.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/crates/teaching-platform/src/ws/conn.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use serde_json::json;
    use tokio::sync::mpsc::unbounded_channel;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;

    fn text(frame: Frame) -> Message {
        Message::text(frame.encode())
    }

    fn auth_ack(package_id: &str) -> Message {
        text(Frame::ack(
            package_id.to_string(),
            "auth.login".to_string(),
            json!({ "conn_id": "c1", "classroom_id": 3,
                    "lesson": { "id": 88, "title": "第 5 讲", "status": "ongoing" } }),
        ))
    }

    /// 启动一个只接一条连接的假服务端。收到的每一帧都转发给测试，
    /// 同时把 responder 返回的报文写回客户端。
    async fn spawn_server<F>(responder: F) -> (String, tokio::sync::mpsc::UnboundedReceiver<Frame>)
    where
        F: Fn(&Frame) -> Vec<Message> + Send + Sync + 'static,
    {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (seen_tx, seen_rx) = unbounded_channel();

        tokio::spawn(async move {
            let Ok((stream, _)) = listener.accept().await else { return };
            let Ok(ws) = tokio_tungstenite::accept_async(stream).await else { return };
            let (mut sink, mut source) = ws.split();

            while let Some(Ok(message)) = source.next().await {
                let Message::Text(raw) = message else { continue };
                let Ok(frame) = Frame::decode(&raw) else { continue };
                let replies = responder(&frame);
                let _ = seen_tx.send(frame);
                for reply in replies {
                    if sink.send(reply).await.is_err() {
                        return;
                    }
                }
            }
        });

        (format!("ws://{addr}"), seen_rx)
    }

    struct TestHandler {
        requests: tokio::sync::mpsc::UnboundedSender<String>,
    }

    #[async_trait]
    impl InboundHandler for TestHandler {
        async fn on_request(&self, op: &str, _params: Value) -> std::result::Result<Value, ApiError> {
            let _ = self.requests.send(op.to_string());
            if op == "app.status" {
                Ok(json!({ "version": "test" }))
            } else {
                Err(ApiError { code: crate::error::code::UNSUPPORTED_OP, message: "不支持".into() })
            }
        }

        async fn on_event(&self, op: &str, _data: Value) {
            let _ = self.requests.send(format!("event:{op}"));
        }
    }

    fn handler() -> (Arc<dyn InboundHandler>, tokio::sync::mpsc::UnboundedReceiver<String>) {
        let (tx, rx) = unbounded_channel();
        (Arc::new(TestHandler { requests: tx }), rx)
    }

    async fn open(url: String) -> (Connection, Snapshot, tokio::sync::mpsc::UnboundedReceiver<String>) {
        let (handler, rx) = handler();
        let (conn, snapshot) = Connection::open(
            ConnectOptions { url, token: "tk".into() },
            handler,
        )
        .await
        .unwrap();
        (conn, snapshot, rx)
    }

    #[tokio::test]
    async fn 建连后立刻发_auth_login_并返回快照() {
        let (url, mut seen) = spawn_server(|frame| vec![auth_ack(frame.package_id())]).await;
        let (conn, snapshot, _) = open(url).await;

        let first = seen.recv().await.unwrap();
        assert_eq!(first.op(), "auth.login");
        assert_eq!(first.params_or_data()["token"], "tk");
        assert_eq!(snapshot.classroom_id, Some(3));
        assert_eq!(snapshot.lesson.unwrap().title, "第 5 讲");

        conn.close().await;
    }

    #[tokio::test]
    async fn conn_pong_的_op_不同也能按_package_id_配对() {
        let (url, _seen) = spawn_server(|frame| {
            let reply = if frame.op() == "auth.login" {
                auth_ack(frame.package_id())
            } else {
                // 心跳的响应 op 是 conn.pong，配对时不能比对 op
                text(Frame::ack(frame.package_id().to_string(), "conn.pong".into(), json!({})))
            };
            vec![reply]
        })
        .await;

        let (conn, _, _) = open(url).await;
        assert!(conn.call("conn.ping", json!({})).await.is_ok());
        conn.close().await;
    }

    #[tokio::test]
    async fn error_帧转成_api_错误() {
        let (url, _seen) = spawn_server(|frame| {
            let reply = if frame.op() == "auth.login" {
                auth_ack(frame.package_id())
            } else {
                text(Frame::error(frame.package_id().to_string(), frame.op().into(), 40006, "不支持的指令".into()))
            };
            vec![reply]
        })
        .await;

        let (conn, _, _) = open(url).await;
        match conn.call("ppt.next", json!({})).await.unwrap_err() {
            PlatformError::Api(api) => {
                assert_eq!(api.code, 40006);
                assert_eq!(api.message, "不支持的指令");
            }
            other => panic!("应为 Api 错误，实际是 {other:?}"),
        }
        conn.close().await;
    }

    #[tokio::test]
    async fn 本地超时后不留下悬挂的登记项() {
        let (url, _seen) = spawn_server(|frame| {
            if frame.op() == "auth.login" { vec![auth_ack(frame.package_id())] } else { vec![] }
        })
        .await;

        let (conn, _, _) = open(url).await;
        let error = conn
            .call_timeout("ppt.next", json!({}), Duration::from_millis(120))
            .await
            .unwrap_err();

        assert!(matches!(error, PlatformError::Timeout));
        assert_eq!(conn.pending_len().await, 0, "超时后登记表必须清空，否则会一直涨");
        conn.close().await;
    }

    #[tokio::test]
    async fn 入站_req_交给_handler_并回_ack() {
        let (url, mut seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            // 认证通过后紧接着推一条 req 过来
            vec![
                auth_ack(frame.package_id()),
                text(Frame::Req {
                    package_id: "srv-1".into(),
                    op: "app.status".into(),
                    ts: 1,
                    params: json!({}),
                }),
            ]
        })
        .await;

        let (conn, _, mut handled) = open(url).await;

        assert_eq!(handled.recv().await.unwrap(), "app.status");

        let _login = seen.recv().await.unwrap();
        let ack = seen.recv().await.unwrap();
        assert_eq!(ack.package_id(), "srv-1", "packageId 必须原样带回");
        assert_eq!(ack.op(), "app.status");
        assert_eq!(ack.params_or_data()["version"], "test");

        conn.close().await;
    }

    #[tokio::test]
    async fn 未知_op_回_error_帧而不是静默忽略() {
        let (url, mut seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            vec![
                auth_ack(frame.package_id()),
                text(Frame::Req { package_id: "srv-2".into(), op: "ppt.next".into(), ts: 1, params: json!({}) }),
            ]
        })
        .await;

        let (conn, _, _) = open(url).await;
        let _login = seen.recv().await.unwrap();
        let response = seen.recv().await.unwrap();

        match response {
            Frame::Error { package_id, code, .. } => {
                assert_eq!(package_id, "srv-2");
                assert_eq!(code, crate::error::code::UNSUPPORTED_OP);
            }
            other => panic!("应为 error 帧，实际是 {other:?}"),
        }
        conn.close().await;
    }

    #[tokio::test]
    async fn 服务端关闭时_wait_closed_给出关闭码() {
        let (url, _seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            vec![
                auth_ack(frame.package_id()),
                Message::Close(Some(CloseFrame {
                    code: CloseCode::Library(4005),
                    reason: "顶号".into(),
                })),
            ]
        })
        .await;

        let (conn, _, _) = open(url).await;
        let reason = conn.wait_closed().await;

        assert_eq!(reason.code, Some(4005));
        assert!(reason.is_kicked());
        conn.close().await;
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri/crates/teaching-platform && cargo test conn
```

Expected: 编译失败，`cannot find type Connection in this scope`。

- [ ] **Step 3: 实现**

在 `conn.rs` 测试模块之前插入：

```rust
use crate::error::{ApiError, PlatformError, Result};
use crate::ws::frame::Frame;
use crate::ws::snapshot::Snapshot;
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

/// 本地等待比服务端 10 秒转发超时更长，否则会先本地超时、随后又收到迟到的 ack。
pub const CALL_TIMEOUT: Duration = Duration::from_secs(15);
/// 服务端 60 秒收不到任何帧就以 4009 断开。
pub const PING_INTERVAL: Duration = Duration::from_secs(25);
/// 关闭时给收尾留的时间。
const CLOSE_GRACE: Duration = Duration::from_secs(3);

pub struct ConnectOptions {
    pub url: String,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloseReason {
    pub code: Option<u16>,
    pub message: String,
}

impl CloseReason {
    /// 顶号。收到后必须停止自动重连，否则两条连接会来回顶成死循环。
    pub fn is_kicked(&self) -> bool {
        self.code == Some(4005)
    }

    /// 认证失败。不要原样重连，先重新取 token。
    pub fn is_auth_failure(&self) -> bool {
        self.code == Some(4001)
    }
}

#[async_trait]
pub trait InboundHandler: Send + Sync {
    /// 服务端转发来的 req。返回 Ok 回 ack，Err 回 error 帧。
    async fn on_request(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError>;
    /// 事件帧。协议规定客户端不回 ack。
    async fn on_event(&self, op: &str, data: Value);
}

type Waiter = oneshot::Sender<std::result::Result<Value, ApiError>>;

struct Shared {
    pending: Mutex<HashMap<String, Waiter>>,
    close: watch::Sender<Option<CloseReason>>,
}

pub struct Connection {
    shared: Arc<Shared>,
    outbound: mpsc::Sender<Message>,
    tasks: Vec<JoinHandle<()>>,
}

async fn call_inner(
    shared: &Arc<Shared>,
    outbound: &mpsc::Sender<Message>,
    op: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value> {
    let frame = Frame::req(op, params);
    let package_id = frame.package_id().to_string();

    let (tx, rx) = oneshot::channel();
    shared.pending.lock().await.insert(package_id.clone(), tx);

    if outbound.send(Message::text(frame.encode())).await.is_err() {
        shared.pending.lock().await.remove(&package_id);
        return Err(PlatformError::Ws("连接已断开".into()));
    }

    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(Ok(data))) => Ok(data),
        Ok(Ok(Err(api))) => Err(PlatformError::Api(api)),
        Ok(Err(_)) => Err(PlatformError::Ws("连接已断开".into())),
        Err(_) => {
            // 不摘掉登记，迟到的 ack 会让这张表只涨不落
            shared.pending.lock().await.remove(&package_id);
            Err(PlatformError::Timeout)
        }
    }
}

async fn settle(shared: &Arc<Shared>, package_id: &str, result: std::result::Result<Value, ApiError>) {
    if let Some(waiter) = shared.pending.lock().await.remove(package_id) {
        let _ = waiter.send(result);
    } else {
        log::debug!("收到无人等待的响应 packageId={package_id}");
    }
}

async fn read_loop<S>(
    source: &mut S,
    shared: &Arc<Shared>,
    outbound: &mpsc::Sender<Message>,
    handler: Arc<dyn InboundHandler>,
) -> CloseReason
where
    // 约束写在 Stream 上而不是 StreamExt 上：Item 是 Stream 的关联类型，
    // next() 由 StreamExt 的 blanket impl 提供
    S: futures_util::Stream<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
{
    while let Some(message) = source.next().await {
        let raw = match message {
            Ok(Message::Text(text)) => text.to_string(),
            Ok(Message::Close(frame)) => {
                return CloseReason {
                    code: frame.as_ref().map(|f| u16::from(f.code)),
                    message: frame
                        .map(|f| f.reason.to_string())
                        .filter(|reason| !reason.is_empty())
                        .unwrap_or_else(|| "服务端关闭了连接".into()),
                };
            }
            Ok(_) => continue,
            Err(e) => return CloseReason { code: None, message: format!("连接中断：{e}") },
        };

        let frame = match Frame::decode(&raw) {
            Ok(frame) => frame,
            Err(e) => {
                log::warn!("丢弃无法解析的帧：{e}");
                continue;
            }
        };

        match frame {
            Frame::Ack { package_id, data, .. } => settle(shared, &package_id, Ok(data)).await,
            Frame::Error { package_id, code, message, .. } => {
                settle(shared, &package_id, Err(ApiError { code, message })).await
            }
            Frame::Event { op, data, .. } => handler.on_event(&op, data).await,
            Frame::Req { package_id, op, params, .. } => {
                // 处理可能要拉起进程，放到独立任务里免得堵住读循环
                let handler = handler.clone();
                let outbound = outbound.clone();
                tokio::spawn(async move {
                    let response = match handler.on_request(&op, params).await {
                        Ok(data) => Frame::ack(package_id, op, data),
                        Err(api) => Frame::error(package_id, op, api.code, api.message),
                    };
                    let _ = outbound.send(Message::text(response.encode())).await;
                });
            }
        }
    }

    CloseReason { code: None, message: "连接已关闭".into() }
}

impl Connection {
    pub async fn open(
        options: ConnectOptions,
        handler: Arc<dyn InboundHandler>,
    ) -> Result<(Self, Snapshot)> {
        let request = options
            .url
            .as_str()
            .into_client_request()
            .map_err(|e| PlatformError::Ws(format!("WebSocket 地址非法：{e}")))?;

        let (stream, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| PlatformError::Ws(format!("连接失败：{e}")))?;

        let (mut sink, mut source) = stream.split();
        let (close_tx, _) = watch::channel(None);
        let shared = Arc::new(Shared {
            pending: Mutex::new(HashMap::new()),
            close: close_tx,
        });
        let (outbound_tx, mut outbound_rx) = mpsc::channel::<Message>(64);

        let writer = tokio::spawn(async move {
            while let Some(message) = outbound_rx.recv().await {
                if sink.send(message).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let reader_shared = shared.clone();
        let reader_outbound = outbound_tx.clone();
        let reader = tokio::spawn(async move {
            let reason = read_loop(&mut source, &reader_shared, &reader_outbound, handler).await;

            // 连接断了就把所有等待者叫醒，否则每个 call 都要干等满 15 秒
            let waiting: Vec<Waiter> = reader_shared.pending.lock().await.drain().map(|(_, w)| w).collect();
            for waiter in waiting {
                let _ = waiter.send(Err(ApiError { code: -1, message: "连接已断开".into() }));
            }

            let _ = reader_shared.close.send(Some(reason));
        });

        // 服务端要求 5 秒内发出首帧，认证不能排在其他初始化之后
        let data = call_inner(&shared, &outbound_tx, "auth.login", json!({ "token": options.token }), CALL_TIMEOUT).await;
        let snapshot = match data {
            Ok(data) => Snapshot::from_value(data)?,
            Err(e) => {
                writer.abort();
                reader.abort();
                return Err(e);
            }
        };

        let heartbeat = spawn_heartbeat(shared.clone(), outbound_tx.clone());

        Ok((
            Self { shared, outbound: outbound_tx, tasks: vec![writer, reader, heartbeat] },
            snapshot,
        ))
    }

    pub async fn call(&self, op: &str, params: Value) -> Result<Value> {
        call_inner(&self.shared, &self.outbound, op, params, CALL_TIMEOUT).await
    }

    pub async fn call_timeout(&self, op: &str, params: Value, timeout: Duration) -> Result<Value> {
        call_inner(&self.shared, &self.outbound, op, params, timeout).await
    }

    /// 等待连接终止，返回关闭原因。重连循环靠它衔接。
    pub async fn wait_closed(&self) -> CloseReason {
        let mut rx = self.shared.close.subscribe();
        loop {
            let current = rx.borrow_and_update().clone();
            if let Some(reason) = current {
                return reason;
            }
            if rx.changed().await.is_err() {
                return CloseReason { code: None, message: "连接已关闭".into() };
            }
        }
    }

    pub async fn pending_len(&self) -> usize {
        self.shared.pending.lock().await.len()
    }

    pub async fn close(self) {
        let Self { shared, outbound, tasks } = self;
        let _ = shared.close.send(Some(CloseReason { code: None, message: "本地主动关闭".into() }));

        // 丢掉发送端，写任务会排完队列后发出 WebSocket Close 帧
        drop(outbound);

        for mut task in tasks {
            if tokio::time::timeout(CLOSE_GRACE, &mut task).await.is_err() {
                task.abort();
            }
        }
    }
}

fn spawn_heartbeat(shared: Arc<Shared>, outbound: mpsc::Sender<Message>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut closed = shared.close.subscribe();
        let mut ticker = tokio::time::interval(PING_INTERVAL);
        ticker.tick().await; // interval 的首次 tick 立即返回，跳过

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(e) = call_inner(&shared, &outbound, "conn.ping", json!({}), CALL_TIMEOUT).await {
                        log::warn!("心跳失败，停止发送：{e}");
                        return;
                    }
                }
                _ = closed.changed() => return,
            }
        }
    })
}
```

- [ ] **Step 4: 跑测试确认通过**

`src-tauri/crates/teaching-platform/src/ws/mod.rs` 加 `pub mod conn;`。

```bash
cd src-tauri/crates/teaching-platform && cargo test
```

Expected: `test result: ok. 54 passed; 0 failed`（其中 7 条是 conn 的异步测试）

若 `Message::Close(Some(CloseFrame { ... }))` 报字段类型不符，检查 `reason` 是否用了 `.into()`——tungstenite 0.29 的 `reason` 是 `Utf8Bytes`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/crates
git commit -m "feat(platform): WebSocket 连接生命周期，含首帧认证、packageId 配对与心跳"
```

---

## Task 7: app crate 接入协议 crate 与角色配置

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/platform/mod.rs`
- Create: `src-tauri/src/platform/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 加依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 末尾追加：

```toml
teaching-platform = { path = "crates/teaching-platform" }
```

在文件末尾追加（unix 下要给 Chrome 发 SIGTERM，std 只提供 SIGKILL）：

```toml
[target.'cfg(unix)'.dependencies]
libc = "0.2"
```

- [ ] **Step 2: 写失败的配置测试**

创建 `src-tauri/src/platform/config.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> BaseConfig {
        BaseConfig { host: "8.163.33.11".into(), port: 8084, secure: false }
    }

    #[test]
    fn base_url_按_secure_选协议() {
        assert_eq!(base().base_url(), "http://8.163.33.11:8084");
        assert_eq!(
            BaseConfig { secure: true, ..base() }.base_url(),
            "https://8.163.33.11:8084"
        );
    }

    #[test]
    fn 主机为空时视为未配置() {
        assert!(base().is_complete());
        assert!(!BaseConfig { host: "   ".into(), ..base() }.is_complete());
        assert!(!BaseConfig { port: 0, ..base() }.is_complete());
    }

    #[cfg(desktop)]
    #[test]
    fn 大屏配置要求填齐凭证() {
        let complete = ScreenAppConfig {
            base: base(),
            app_key: "123456".into(),
            app_secret: "1234567890".into(),
            chrome_path: None,
            kiosk: false,
        };
        assert!(complete.is_complete());
        assert!(!ScreenAppConfig { app_key: String::new(), ..complete.clone() }.is_complete());
        assert!(!ScreenAppConfig { app_secret: "  ".into(), ..complete }.is_complete());
    }

    #[cfg(desktop)]
    #[test]
    fn 大屏配置序列化成扁平的_camel_case() {
        let value = serde_json::to_value(ScreenAppConfig {
            base: base(),
            app_key: "k".into(),
            app_secret: "s".into(),
            chrome_path: Some("/x".into()),
            kiosk: true,
        })
        .unwrap();

        // base 是 flatten 的，前端看到的是一层扁平对象
        assert_eq!(value["host"], "8.163.33.11");
        assert_eq!(value["port"], 8084);
        assert_eq!(value["appKey"], "k");
        assert_eq!(value["appSecret"], "s");
        assert_eq!(value["chromePath"], "/x");
        assert_eq!(value["kiosk"], true);
    }

    #[cfg(desktop)]
    #[test]
    fn 缺字段的旧配置反序列化成默认值而不是报错() {
        let config: ScreenAppConfig = serde_json::from_value(serde_json::json!({ "host": "a" })).unwrap();
        assert_eq!(config.base.host, "a");
        assert_eq!(config.app_key, "");
        assert!(!config.kiosk);
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd src-tauri && cargo test platform::config
```

Expected: 编译失败，`file not found for module platform` 或 `cannot find type BaseConfig`。

- [ ] **Step 4: 实现配置**

在 `src-tauri/src/platform/config.rs` 测试模块之前插入：

```rust
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
/// v1 存的是 clientId / clientSecret，与现在的字段语义不同，不做迁移让用户重填。
const CONFIG_KEY: &str = "server-config:v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BaseConfig {
    pub host: String,
    pub port: u16,
    /// 为真时用 https / wss
    pub secure: bool,
}

impl Default for BaseConfig {
    fn default() -> Self {
        Self { host: String::new(), port: 8084, secure: false }
    }
}

impl BaseConfig {
    pub fn base_url(&self) -> String {
        let scheme = if self.secure { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }

    pub fn is_complete(&self) -> bool {
        !self.host.trim().is_empty() && self.port > 0
    }
}

#[cfg(desktop)]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScreenAppConfig {
    #[serde(flatten)]
    pub base: BaseConfig,
    pub app_key: String,
    pub app_secret: String,
    pub chrome_path: Option<String>,
    pub kiosk: bool,
}

#[cfg(desktop)]
impl ScreenAppConfig {
    pub fn is_complete(&self) -> bool {
        self.base.is_complete()
            && !self.app_key.trim().is_empty()
            && !self.app_secret.trim().is_empty()
    }
}

#[cfg(mobile)]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RobotConfig {
    #[serde(flatten)]
    pub base: BaseConfig,
    pub device_no: String,
    pub device_secret: String,
}

#[cfg(mobile)]
impl RobotConfig {
    pub fn is_complete(&self) -> bool {
        self.base.is_complete()
            && !self.device_no.trim().is_empty()
            && !self.device_secret.trim().is_empty()
    }
}

/// 上层代码只认这个别名，角色差异被编译期挡在这里。
#[cfg(desktop)]
pub type RoleConfig = ScreenAppConfig;
#[cfg(mobile)]
pub type RoleConfig = RobotConfig;

/// 读失败一律回落到默认配置，不阻塞启动。
pub fn load<R: Runtime>(app: &AppHandle<R>) -> RoleConfig {
    let Ok(store) = app.store(STORE_FILE) else {
        return RoleConfig::default();
    };
    store
        .get(CONFIG_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, config: &RoleConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(config).map_err(|e| e.to_string())?;
    store.set(CONFIG_KEY, value);
    store.save().map_err(|e| e.to_string())
}
```

- [ ] **Step 5: 建模块骨架并跑测试**

创建 `src-tauri/src/platform/mod.rs`：

```rust
pub mod config;
```

`src-tauri/src/lib.rs` 顶部在 `mod voice;` 之前加 `mod platform;`。

```bash
cd src-tauri && cargo test platform::config
```

Expected: `test result: ok. 6 passed`（桌面端）

- [ ] **Step 6: 确认安卓也能编过**

```bash
cd src-tauri && cargo check --target aarch64-linux-android
```

Expected: 通过。若未安装该 target，改用 `pnpm android:build --debug` 验证；两者都不可用时至少确认 `#[cfg(mobile)]` 分支里的 `RobotConfig` 字段拼写与 `RoleConfig` 别名一致。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src
git commit -m "feat(platform): app crate 接入协议 crate 并按角色分化配置"
```

---

## Task 8: 前后端事件契约与运行时状态

**Files:**
- Create: `src-tauri/src/platform/events.rs`
- Create: `src-tauri/src/platform/state.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: 写失败的序列化测试**

创建 `src-tauri/src/platform/events.rs`，先只写测试：

```rust
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
        assert!(value.get("classroom_id").is_none(), "不能出现 snake_case 字段");
    }

    #[test]
    fn 日志项没有_detail_时不输出该字段() {
        let entry = LogEntry::new(1, LogLevel::Info, LogSource::Connection, "已连接".into(), None);
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
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri && cargo test platform::events
```

Expected: 编译失败，`cannot find type ConnectionState`。

- [ ] **Step 3: 实现事件契约**

在 `events.rs` 测试模块之前插入：

```rust
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
```

- [ ] **Step 4: 写运行时状态**

创建 `src-tauri/src/platform/state.rs`：

```rust
use crate::platform::events::{
    ConnectionInfo, ConnectionState, LogEntry, LogLevel, LogSource, CONNECTION_EVENT, LOG_EVENT,
};
use std::collections::VecDeque;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// 前端刷新或后开窗口时要能补齐已经发生的事，而不是只看到订阅之后的增量。
const LOG_CAPACITY: usize = 200;

#[derive(Default)]
struct Inner {
    info: ConnectionInfo,
    logs: VecDeque<LogEntry>,
    seq: u64,
    runner: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Default)]
pub struct PlatformState {
    inner: Mutex<Inner>,
}

impl PlatformState {
    pub fn info(&self) -> ConnectionInfo {
        self.inner.lock().expect("状态锁被毒化").info.clone()
    }

    pub fn recent_logs(&self) -> Vec<LogEntry> {
        self.inner
            .lock()
            .expect("状态锁被毒化")
            .logs
            .iter()
            .cloned()
            .collect()
    }

    /// 改状态并广播。回调里不要做耗时操作，锁是同步的。
    pub fn update(&self, app: &AppHandle, mutate: impl FnOnce(&mut ConnectionInfo)) {
        let info = {
            let mut inner = self.inner.lock().expect("状态锁被毒化");
            mutate(&mut inner.info);
            inner.info.clone()
        };

        #[cfg(desktop)]
        crate::tray::sync(app, &info);

        if let Err(e) = app.emit(CONNECTION_EVENT, &info) {
            log::warn!("广播连接状态失败：{e}");
        }
    }

    pub fn log(
        &self,
        app: &AppHandle,
        level: LogLevel,
        source: LogSource,
        message: impl Into<String>,
        detail: Option<String>,
    ) {
        let entry = {
            let mut inner = self.inner.lock().expect("状态锁被毒化");
            inner.seq += 1;
            let entry = LogEntry::new(inner.seq, level, source, message.into(), detail);
            if inner.logs.len() == LOG_CAPACITY {
                inner.logs.pop_front();
            }
            inner.logs.push_back(entry.clone());
            entry
        };

        log::info!("[platform] {}", entry.message);
        if let Err(e) = app.emit(LOG_EVENT, &entry) {
            log::warn!("广播日志失败：{e}");
        }
    }

    /// 装上新的连接循环，返回被替换掉的旧句柄供调用方 abort。
    pub fn swap_runner(&self, handle: Option<tokio::task::JoinHandle<()>>) -> Option<tokio::task::JoinHandle<()>> {
        std::mem::replace(
            &mut self.inner.lock().expect("状态锁被毒化").runner,
            handle,
        )
    }

    /// 断开时用：把状态打回终态并清掉课堂信息
    pub fn mark_disconnected(&self, app: &AppHandle) {
        self.update(app, |info| {
            info.state = ConnectionState::Disconnected;
            info.connected_at = None;
            info.lesson_id = None;
            info.lesson_title = None;
            info.course_name = None;
        });
    }
}
```

- [ ] **Step 5: 加一个临时的 tray::sync 占位并编译**

`src-tauri/src/tray.rs` 末尾追加（Task 11 会换成真实实现）：

```rust
/// 托盘状态同步。Task 11 接上真实的菜单项更新。
///
/// 签名用具体的 `AppHandle`（即 `AppHandle<Wry>`）而不是泛型：托盘只在桌面存在，
/// 调用方 `PlatformState::update` 拿到的也是具体类型，泛型只会逼出多余的转换。
pub fn sync(_app: &AppHandle, _info: &crate::platform::events::ConnectionInfo) {}
```

`tray.rs` 现有的 `use tauri::{... Runtime}` 保持不动（旧代码还在用），Task 11 会连同整份文件一起换掉。

`src-tauri/src/platform/mod.rs` 改为：

```rust
pub mod config;
pub mod events;
pub mod state;
```

```bash
cd src-tauri && cargo test platform
```

Expected: `test result: ok. 10 passed`（config 6 + events 4）

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src
git commit -m "feat(platform): 连接状态与日志的前后端契约及运行时状态"
```

---

## Task 9: Chrome 进程托管

**Files:**
- Create: `src-tauri/src/platform/screen_app/browser.rs`
- Create: `src-tauri/src/platform/screen_app/mod.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: 写失败的测试**

创建 `src-tauri/src/platform/screen_app/browser.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn app_bundle_取到里面的可执行文件() {
        // 需求给的 --chrome /Applications/Google Chrome.app 是个目录，
        // 直接 Command::new 会 Permission denied
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Google Chrome.app")),
            Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        );
    }

    #[test]
    fn 结尾带斜杠的_bundle_也能处理() {
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Google Chrome.app/")),
            Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        );
    }

    #[test]
    fn 其他_app_bundle_取同名可执行文件() {
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Chromium.app")),
            Path::new("/Applications/Chromium.app/Contents/MacOS/Chromium")
        );
    }

    #[test]
    fn 普通可执行文件路径原样返回() {
        for raw in ["/usr/bin/chromium", r"C:\Program Files\Google\Chrome\Application\chrome.exe"] {
            assert_eq!(normalize_chrome_path(Path::new(raw)), Path::new(raw));
        }
    }

    #[test]
    fn 启动参数含独立_profile_与放开自动播放() {
        let args = build_args(Path::new("/tmp/profile"), false, "https://x/screen");

        assert_eq!(args[0], "--user-data-dir=/tmp/profile");
        assert!(args.contains(&"--autoplay-policy=no-user-gesture-required".to_string()));
        assert!(args.contains(&"--new-window".to_string()));
        assert_eq!(args.last().unwrap(), "https://x/screen", "URL 必须在最后");
        assert!(!args.contains(&"--kiosk".to_string()));
    }

    #[test]
    fn kiosk_开关生效且仍然把_url_放最后() {
        let args = build_args(Path::new("/tmp/profile"), true, "https://x/screen");

        assert!(args.contains(&"--kiosk".to_string()));
        assert_eq!(args.last().unwrap(), "https://x/screen");
    }

    #[test]
    fn 未配置路径时探测失败给出可操作的提示() {
        // 探测结果依赖运行环境，这里只钉住失败时的文案要提到 chrome
        if let Err(message) = resolve_chrome(Some("/definitely/not/here")) {
            assert!(message.contains("/definitely/not/here"));
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri && cargo test browser
```

Expected: 编译失败，`cannot find function normalize_chrome_path`。

- [ ] **Step 3: 实现**

在 `browser.rs` 测试模块之前插入：

```rust
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// 独立 profile，不占用用户日常浏览器的配置
const PROFILE_DIR: &str = "gdufe-screen-app";
/// SIGTERM 之后等它自己退的时间
const TERMINATE_GRACE_MS: u64 = 5_000;

/// macOS 上 `.app` 是目录，要取 bundle 里的可执行文件。
/// 不用 `open -na` 拉起：那样拿不到进程句柄，close_browser 与 status 就无从实现。
pub fn normalize_chrome_path(path: &Path) -> PathBuf {
    let trimmed = Path::new(path.to_string_lossy().trim_end_matches('/'));

    let Some(name) = trimmed.file_name().and_then(|n| n.to_str()) else {
        return path.to_path_buf();
    };
    let Some(stem) = name.strip_suffix(".app") else {
        return path.to_path_buf();
    };

    trimmed.join("Contents").join("MacOS").join(stem)
}

fn candidates() -> Vec<PathBuf> {
    let mut found = Vec::new();

    #[cfg(target_os = "macos")]
    found.push(PathBuf::from(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ));

    #[cfg(target_os = "windows")]
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
        if let Ok(base) = std::env::var(key) {
            found.push(
                PathBuf::from(base)
                    .join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
        }
    }

    found
}

pub fn resolve_chrome(configured: Option<&str>) -> Result<PathBuf, String> {
    if let Some(raw) = configured.map(str::trim).filter(|s| !s.is_empty()) {
        let path = normalize_chrome_path(Path::new(raw));
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("配置的 Chrome 路径不可用：{raw}"));
    }

    for path in candidates() {
        if path.is_file() {
            return Ok(path);
        }
    }

    for name in ["chrome", "google-chrome", "chromium"] {
        if let Ok(output) = Command::new("which").arg(name).output() {
            let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !found.is_empty() && Path::new(&found).is_file() {
                return Ok(PathBuf::from(found));
            }
        }
    }

    Err("未找到 Chrome，请在配置里填写可执行文件路径".to_string())
}

pub fn profile_dir() -> PathBuf {
    std::env::temp_dir().join(PROFILE_DIR)
}

pub fn build_args(profile: &Path, kiosk: bool, url: &str) -> Vec<String> {
    let mut args = vec![
        format!("--user-data-dir={}", profile.display()),
        // 演示大屏要用 SpeechSynthesis 朗读，默认策略会把它拦下来
        "--autoplay-policy=no-user-gesture-required".to_string(),
        "--new-window".to_string(),
    ];
    if kiosk {
        args.push("--kiosk".to_string());
    }
    args.push(url.to_string());
    args
}

#[derive(Default)]
pub struct BrowserManager {
    chrome_path: Mutex<Option<String>>,
    kiosk: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl BrowserManager {
    /// 配置可能在运行期被改，路径与 kiosk 都在每次拉起时重新取。
    pub fn configure(&self, chrome_path: Option<String>, kiosk: bool) {
        *self.chrome_path.lock().expect("浏览器锁被毒化") = chrome_path;
        self.kiosk.store(kiosk, Ordering::Relaxed);
    }

    pub fn running(&self) -> bool {
        let mut slot = self.child.lock().expect("浏览器锁被毒化");
        match slot.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => {
                    *slot = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            },
            None => false,
        }
    }

    pub fn open_url(&self, url: &str) -> Result<(), String> {
        let configured = self.chrome_path.lock().expect("浏览器锁被毒化").clone();
        let chrome = resolve_chrome(configured.as_deref())?;

        // 同时只允许一个窗口，否则老师会看到两块内容叠在一起
        self.close();

        let profile = profile_dir();
        std::fs::create_dir_all(&profile)
            .map_err(|e| format!("无法创建浏览器配置目录：{e}"))?;

        let child = Command::new(&chrome)
            .args(build_args(&profile, self.kiosk.load(Ordering::Relaxed), url))
            .spawn()
            .map_err(|e| format!("拉起 Chrome 失败：{e}"))?;

        *self.child.lock().expect("浏览器锁被毒化") = Some(child);
        Ok(())
    }

    pub fn close(&self) -> bool {
        let Some(mut child) = self.child.lock().expect("浏览器锁被毒化").take() else {
            return false;
        };

        if matches!(child.try_wait(), Ok(Some(_))) {
            return true;
        }

        #[cfg(windows)]
        {
            // Chrome 会 fork 一堆渲染进程，只 kill 父进程会留下孤儿
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .output();
            let _ = child.wait();
            return true;
        }

        #[cfg(not(windows))]
        {
            // SIGTERM 让 Chrome 干净退出，否则下次启动会弹「未正常关闭」
            unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGTERM) };

            let deadline = std::time::Instant::now()
                + std::time::Duration::from_millis(TERMINATE_GRACE_MS);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => return true,
                    Ok(None) if std::time::Instant::now() < deadline => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    _ => break,
                }
            }

            let _ = child.kill();
            let _ = child.wait();
            true
        }
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

创建 `src-tauri/src/platform/screen_app/mod.rs`：

```rust
pub mod browser;
```

`src-tauri/src/platform/mod.rs` 加：

```rust
#[cfg(desktop)]
pub mod screen_app;
```

```bash
cd src-tauri && cargo test browser
```

Expected: `test result: ok. 7 passed; 0 failed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src
git commit -m "feat(screen-app): Chrome 进程托管，兼容 macOS 的 app bundle 路径"
```

---

## Task 10: 大屏连接循环与入站指令

**Files:**
- Modify: `src-tauri/src/platform/screen_app/mod.rs`
- Modify: `src-tauri/src/platform/mod.rs`

- [ ] **Step 1: 写入站处理与连接循环**

把 `src-tauri/src/platform/screen_app/mod.rs` 整体替换为：

```rust
pub mod browser;

use crate::platform::config::ScreenAppConfig;
use crate::platform::events::{ConnectionState, LogLevel, LogSource};
use crate::platform::state::PlatformState;
use async_trait::async_trait;
use browser::BrowserManager;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use teaching_platform::error::{code, ApiError, PlatformError};
use teaching_platform::http::HttpClient;
use teaching_platform::ws::backoff::Backoff;
use teaching_platform::ws::conn::{CloseReason, ConnectOptions, Connection, InboundHandler};
use teaching_platform::ws::event::ServerEvent;

/// token 到期前一小时主动换票重连，别等它在半节课中间失效
const RENEW_LEAD_SECS: u64 = 3_600;
const MIN_RENEW_SECS: u64 = 60;

fn version() -> String {
    format!("gdufe-screen-app/{}", env!("CARGO_PKG_VERSION"))
}

struct ScreenHandler {
    app: AppHandle,
    state: Arc<PlatformState>,
    browser: Arc<BrowserManager>,
    kicked: Arc<AtomicBool>,
}

#[async_trait]
impl InboundHandler for ScreenHandler {
    async fn on_request(&self, op: &str, params: Value) -> Result<Value, ApiError> {
        match op {
            "app.open_url" => {
                let url = params
                    .get("url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();

                if url.is_empty() {
                    return Err(ApiError { code: 40001, message: "指令缺少 url 参数".into() });
                }

                match self.browser.open_url(&url) {
                    Ok(()) => {
                        self.state.log(
                            &self.app,
                            LogLevel::Success,
                            LogSource::Browser,
                            "已打开演示大屏",
                            Some(url.clone()),
                        );
                        Ok(json!({ "ok": true, "url": url }))
                    }
                    Err(message) => {
                        self.state.log(
                            &self.app,
                            LogLevel::Error,
                            LogSource::Browser,
                            message.clone(),
                            Some(url),
                        );
                        // message 会被转回发起方，可能被 TTS 念出来，所以要是人话
                        Err(ApiError { code: code::INTERNAL, message })
                    }
                }
            }

            "app.close_browser" => {
                let closed = self.browser.close();
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Browser,
                    if closed { "已关闭浏览器" } else { "浏览器本来就没开" },
                    None,
                );
                Ok(json!({ "ok": true, "closed": closed }))
            }

            "app.status" => Ok(json!({
                "version": version(),
                "browser_running": self.browser.running(),
            })),

            other => Err(ApiError {
                code: code::UNSUPPORTED_OP,
                message: format!("大屏端不支持的指令：{other}"),
            }),
        }
    }

    async fn on_event(&self, op: &str, data: Value) {
        match ServerEvent::parse(op, data) {
            ServerEvent::Kicked { reason } => {
                self.kicked.store(true, Ordering::SeqCst);
                self.state.log(&self.app, LogLevel::Warn, LogSource::Connection, "已被顶号", Some(reason));
            }

            // 大屏开机常驻，一条连接会跨很多次课堂，服务端在课堂起止时把它重挂到
            // 新房间。登录快照里的 lesson_id 只在首帧正确，之后必须以事件为准。
            ServerEvent::LessonStarted { lesson } => {
                let title = lesson.title.clone();
                self.state.update(&self.app, |info| {
                    info.lesson_id = lesson.lesson_id;
                    info.lesson_title = lesson.title.clone();
                    info.course_name = lesson.course_name.clone();
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    format!("课堂开始：{}", title.as_deref().unwrap_or("未知课堂")),
                    None,
                );
            }

            ServerEvent::LessonEnded { lesson } => {
                let title = lesson.title.clone();
                self.state.update(&self.app, |info| {
                    info.lesson_id = None;
                    info.lesson_title = None;
                    info.course_name = None;
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    format!("课堂结束：{}", title.as_deref().unwrap_or("未知课堂")),
                    None,
                );
            }

            ServerEvent::Unknown { op, .. } => {
                log::debug!("忽略事件 {op}");
            }
        }
    }
}

/// 常驻重连循环。除顶号与凭证错误外不会主动退出。
pub async fn run(
    app: AppHandle,
    state: Arc<PlatformState>,
    browser: Arc<BrowserManager>,
    config: ScreenAppConfig,
) {
    browser.configure(config.chrome_path.clone(), config.kiosk);

    let http = match crate::voice::tls::http_client() {
        Ok(client) => HttpClient::new(config.base.base_url(), client),
        Err(e) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(format!("初始化 HTTP 客户端失败：{e}"));
            });
            return;
        }
    };

    let kicked = Arc::new(AtomicBool::new(false));
    let mut backoff = Backoff::new();
    let mut first = true;

    loop {
        state.update(&app, |info| {
            info.state = if first { ConnectionState::Connecting } else { ConnectionState::Reconnecting };
            if !first {
                info.reconnect_count = info.reconnect_count.saturating_add(1);
            }
        });
        first = false;

        match connect_once(&app, &state, &http, &config, browser.clone(), kicked.clone()).await {
            Ok(reason) => {
                if reason.is_kicked() || kicked.load(Ordering::SeqCst) {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.kicked = true;
                        info.connected_at = None;
                        info.last_error = Some("同一教室已在别处连接，已停止自动重连".into());
                    });
                    state.log(&app, LogLevel::Error, LogSource::Connection, "被顶号，停止自动重连", None);
                    return;
                }

                state.log(&app, LogLevel::Warn, LogSource::Connection, "连接已断开", Some(reason.message.clone()));
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(reason.message);
                });
            }
            Err(error) => {
                if error.is_credential() {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.connected_at = None;
                        info.last_error = Some(error.to_string());
                    });
                    state.log(&app, LogLevel::Error, LogSource::Connection, "凭证被拒绝，已停止重试", Some(error.to_string()));
                    return;
                }

                state.log(&app, LogLevel::Warn, LogSource::Connection, "连接失败", Some(error.to_string()));
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(error.to_string());
                });
            }
        }

        let delay = backoff.next_delay();
        log::info!("{} 秒后重连", delay.as_secs_f32());
        tokio::time::sleep(delay).await;
    }
}

async fn connect_once(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &ScreenAppConfig,
    browser: Arc<BrowserManager>,
    kicked: Arc<AtomicBool>,
) -> Result<CloseReason, PlatformError> {
    let token = http.screen_token(&config.app_key, &config.app_secret).await?;
    let url = http.resolve_ws_url(&token.ws_url);

    let handler: Arc<dyn InboundHandler> = Arc::new(ScreenHandler {
        app: app.clone(),
        state: state.clone(),
        browser,
        kicked,
    });

    let (conn, snapshot) = Connection::open(
        ConnectOptions { url: url.clone(), token: token.access_token },
        handler,
    )
    .await?;

    state.update(app, |info| {
        info.state = ConnectionState::Connected;
        info.connected_at = Some(crate::platform::events::now_ms());
        info.last_error = None;
        info.kicked = false;
        info.classroom_id = snapshot.classroom_id.or(token.classroom_id);
        // 大屏是常驻程序，一条连接会跨越十几节课，课堂信息只作展示不做缓存依据
        info.lesson_id = snapshot.lesson_id;
        info.lesson_title = snapshot.lesson.as_ref().map(|l| l.title.clone());
        info.course_name = snapshot.lesson.as_ref().and_then(|l| l.course_name.clone());
    });
    state.log(app, LogLevel::Success, LogSource::Connection, "已连接到教学平台", Some(url));

    let renew_after = std::time::Duration::from_secs(
        token.expires_in.saturating_sub(RENEW_LEAD_SECS).max(MIN_RENEW_SECS),
    );

    let reason = tokio::select! {
        reason = conn.wait_closed() => reason,
        _ = tokio::time::sleep(renew_after) => CloseReason {
            code: None,
            message: "token 即将过期，主动重连换票".into(),
        },
    };

    conn.close().await;
    Ok(reason)
}
```

- [ ] **Step 2: 写角色分派入口**

`src-tauri/src/platform/mod.rs` 整体替换为：

```rust
pub mod commands;
pub mod config;
pub mod events;
pub mod state;

#[cfg(desktop)]
pub mod screen_app;

use config::RoleConfig;
use state::PlatformState;
use std::sync::Arc;
use tauri::AppHandle;

#[cfg(desktop)]
pub use screen_app::browser::BrowserManager;

/// 桌面端跑大屏角色，移动端跑机器人角色（第二份计划实现）。
#[cfg(desktop)]
pub async fn run_role(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    let browser = app
        .try_state::<Arc<BrowserManager>>()
        .map(|managed| managed.inner().clone())
        .unwrap_or_default();
    screen_app::run(app, state, browser, config).await;
}

#[cfg(mobile)]
pub async fn run_role(app: AppHandle, state: Arc<PlatformState>, _config: RoleConfig) {
    use events::{LogLevel, LogSource};
    state.log(
        &app,
        LogLevel::Warn,
        LogSource::Connection,
        "机器人端接入尚未实现",
        None,
    );
}
```

需要 `use tauri::Manager;` 才能用 `try_state`，在 `#[cfg(desktop)]` 的 `run_role` 里加 `use tauri::Manager;`。

`unwrap_or_default()` 要求 `Arc<BrowserManager>: Default`，`BrowserManager` 已经 `#[derive(Default)]`，`Arc<T: Default>` 自动满足。

- [ ] **Step 3: 编译**

此时 `commands` 模块还不存在，先创建空的 `src-tauri/src/platform/commands.rs`：

```rust
// Task 11 填充
```

```bash
cd src-tauri && cargo check
```

Expected: 通过。`voice/mod.rs` 里已经是 `pub mod tls;`，`crate::voice::tls::http_client()` 可以直接用。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src
git commit -m "feat(screen-app): 换票、连接循环与 app.* 入站指令处理"
```

---

## Task 11: 对前端暴露 command、启动自动连接、托盘同步

**Files:**
- Modify: `src-tauri/src/platform/commands.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写 command**

把 `src-tauri/src/platform/commands.rs` 整体替换为：

```rust
use crate::platform::config::{self, RoleConfig};
use crate::platform::events::{ConnectionInfo, ConnectionState, LogEntry, LogLevel, LogSource};
use crate::platform::state::PlatformState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn platform_config_get(app: AppHandle) -> RoleConfig {
    config::load(&app)
}

#[tauri::command]
pub async fn platform_config_set(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
    config: RoleConfig,
) -> Result<(), String> {
    config::save(&app, &config)?;
    let state = state.inner().clone();
    start(app, state, config);
    Ok(())
}

#[tauri::command]
pub async fn platform_connect(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
) -> Result<(), String> {
    let config = config::load(&app);
    let state = state.inner().clone();
    start(app, state, config);
    Ok(())
}

#[tauri::command]
pub async fn platform_disconnect(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
) -> Result<(), String> {
    if let Some(runner) = state.swap_runner(None) {
        runner.abort();
    }
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(browser) = app.try_state::<Arc<crate::platform::BrowserManager>>() {
            browser.close();
        }
    }
    state.mark_disconnected(&app);
    state.log(&app, LogLevel::Info, LogSource::Connection, "已手动断开", None);
    Ok(())
}

#[tauri::command]
pub fn platform_connection_info(state: State<'_, Arc<PlatformState>>) -> ConnectionInfo {
    state.info()
}

#[tauri::command]
pub fn platform_recent_logs(state: State<'_, Arc<PlatformState>>) -> Vec<LogEntry> {
    state.recent_logs()
}

#[cfg(desktop)]
#[tauri::command]
pub fn screen_app_browser_status(app: AppHandle) -> bool {
    use tauri::Manager;
    app.try_state::<Arc<crate::platform::BrowserManager>>()
        .map(|browser| browser.running())
        .unwrap_or(false)
}

/// 起一条新的连接循环，旧的先掐掉。配置不完整就停在 idle。
pub fn start(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    if let Some(previous) = state.swap_runner(None) {
        previous.abort();
    }

    if !config.is_complete() {
        state.update(&app, |info| {
            info.state = ConnectionState::Idle;
            info.connected_at = None;
            info.kicked = false;
            info.last_error = None;
        });
        state.log(&app, LogLevel::Info, LogSource::Connection, "配置不完整，暂不连接", None);
        return;
    }

    // 重新连接时把顶号标记与重连计数清零，否则会一直显示上一轮的结果
    state.update(&app, |info| {
        info.kicked = false;
        info.reconnect_count = 0;
        info.last_error = None;
    });

    let runner = {
        let app = app.clone();
        let state = state.clone();
        tauri::async_runtime::spawn(async move {
            crate::platform::run_role(app, state, config).await;
        })
    };

    state.swap_runner(Some(runner));
}
```

- [ ] **Step 2: 改写托盘**

`src-tauri/src/tray.rs` 整体替换为下面这份。

与旧版的两处结构性差异：一是所有函数从泛型 `R: Runtime` 收敛成具体的 `AppHandle`（即
`AppHandle<Wry>`），托盘只在桌面存在、运行时必然是 `Wry`，泛型只会让 `reconnect` 里拿不到
具体类型的 `State`；二是「重新连接」直接调 `platform::commands::start`，不再 emit 给前端
绕一圈回来。

```rust
use crate::platform::config;
use crate::platform::events::{ConnectionInfo, ConnectionState};
use crate::platform::state::PlatformState;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

const MAIN_WINDOW: &str = "main";
const ICON_SIZE: u32 = 32;

/// 托盘的菜单项句柄。状态由 Rust 直接写入，不再让前端 emit 一圈绕回来。
struct TrayHandles {
    tray: TrayIcon,
    status: MenuItem,
    detail: MenuItem,
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let title_item = MenuItemBuilder::with_id("title", "GDUFE Classroom")
        .enabled(false)
        .build(app)?;
    let status_item = MenuItemBuilder::with_id("status", "未配置")
        .enabled(false)
        .build(app)?;
    let detail_item = MenuItemBuilder::with_id("detail", "课堂：未知")
        .enabled(false)
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "打开主窗口").build(app)?;
    let reconnect_item = MenuItemBuilder::with_id("reconnect", "重新连接").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&title_item)
        .item(&status_item)
        .item(&detail_item)
        .separator()
        .item(&open_item)
        .item(&reconnect_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let tray = TrayIconBuilder::with_id("status-tray")
        .icon(status_icon(ConnectionState::Idle))
        .tooltip("GDUFE Classroom\n未配置")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "reconnect" => reconnect(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayHandles {
        tray,
        status: status_item,
        detail: detail_item,
    });

    Ok(())
}

/// 连接状态每次变化都会调到这里。托盘不存在时静默返回。
pub fn sync(app: &AppHandle, info: &ConnectionInfo) {
    let Some(handles) = app.try_state::<TrayHandles>() else {
        return;
    };

    let status = status_line(info);
    let detail = detail_line(info);

    let _ = handles.status.set_text(&status);
    let _ = handles.detail.set_text(&detail);
    let _ = handles
        .tray
        .set_tooltip(Some(&format!("GDUFE Classroom\n{status}\n{detail}")));
    let _ = handles.tray.set_icon(Some(status_icon(info.state)));
}

fn reconnect(app: &AppHandle) {
    let Some(state) = app.try_state::<Arc<PlatformState>>() else {
        return;
    };
    let state = state.inner().clone();
    let config = config::load(app);
    crate::platform::commands::start(app.clone(), state, config);
}

fn status_line(info: &ConnectionInfo) -> String {
    match info.state {
        ConnectionState::Idle => "未配置".into(),
        ConnectionState::Authorizing => "等待授权".into(),
        ConnectionState::Connecting => "连接中".into(),
        ConnectionState::Connected => "已连接".into(),
        ConnectionState::Reconnecting => format!("重连中（第 {} 次）", info.reconnect_count),
        ConnectionState::Disconnected => "已断开".into(),
        ConnectionState::Error if info.kicked => "已在别处连接".into(),
        ConnectionState::Error => "连接异常".into(),
    }
}

fn detail_line(info: &ConnectionInfo) -> String {
    match (&info.lesson_title, info.classroom_id) {
        (Some(title), _) => format!("课堂：{title}"),
        (None, Some(classroom)) => format!("教室：{classroom}"),
        (None, None) => "课堂：未知".into(),
    }
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn status_color(state: ConnectionState) -> [u8; 3] {
    match state {
        ConnectionState::Connected => [34, 197, 94],
        ConnectionState::Connecting | ConnectionState::Reconnecting | ConnectionState::Authorizing => {
            [234, 179, 8]
        }
        ConnectionState::Error => [239, 68, 68],
        _ => [148, 163, 184],
    }
}

/// 运行时绘制一个状态色圆点，省去为每种状态准备图标资源
fn status_icon(state: ConnectionState) -> Image<'static> {
    let [r, g, b] = status_color(state);
    let center = (ICON_SIZE as f32 - 1.0) / 2.0;
    let radius = ICON_SIZE as f32 / 2.0 - 1.0;

    let mut rgba = Vec::with_capacity((ICON_SIZE * ICON_SIZE * 4) as usize);
    for y in 0..ICON_SIZE {
        for x in 0..ICON_SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            // 边缘一像素内做线性淡出，避免锯齿
            let coverage = (radius - distance).clamp(0.0, 1.0);
            rgba.extend_from_slice(&[r, g, b, (coverage * 255.0) as u8]);
        }
    }

    Image::new_owned(rgba, ICON_SIZE, ICON_SIZE)
}
```

- [ ] **Step 3: 注册状态与 command**

`src-tauri/src/lib.rs` 整体替换为下面这份。三处不能丢的既有逻辑：`ensure_crypto_provider()`
必须仍在 `Builder` 之前、debug 日志插件、以及关闭主窗口时隐藏而非退出。

`generate_handler!` 不接受 `#[cfg]`，而桌面端多一条 `screen_app_browser_status`；同时一个
builder 只能设一次 `invoke_handler`（后设的覆盖先设的）。所以公共段不设 `invoke_handler`，
桌面与移动各写一份完整列表。

```rust
#[cfg(desktop)]
mod tray;

mod platform;
mod voice;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // reqwest 开了 rustls-no-provider 后，进程内任何 Client（含 Tauri 移动端
  // dev 协议）在 build 前都必须有 process-default CryptoProvider，否则直接 abort。
  // 必须放在 Builder 之前：Tauri 会在创建 webview 协议处理器时立刻建 Client。
  voice::tls::ensure_crypto_provider();

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_mic::init())
    .manage(voice::VoiceState::default())
    .manage(Arc::new(platform::state::PlatformState::default()))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
        app.manage(Arc::new(platform::BrowserManager::default()));
        if let Err(error) = tray::init(app.handle()) {
          log::error!("托盘初始化失败: {error}");
        }
      }

      // 大屏是开机常驻程序，不该要求用户在 UI 上点一下才连
      let handle = app.handle().clone();
      let state = app
        .state::<Arc<platform::state::PlatformState>>()
        .inner()
        .clone();
      let config = platform::config::load(&handle);
      platform::commands::start(handle, state, config);

      Ok(())
    });

  #[cfg(desktop)]
  let builder = builder.invoke_handler(tauri::generate_handler![
    voice::commands::start_asr,
    voice::commands::stop_asr,
    voice::tls_smoke_test,
    platform::commands::platform_config_get,
    platform::commands::platform_config_set,
    platform::commands::platform_connect,
    platform::commands::platform_disconnect,
    platform::commands::platform_connection_info,
    platform::commands::platform_recent_logs,
    platform::commands::screen_app_browser_status,
  ]);

  #[cfg(mobile)]
  let builder = builder.invoke_handler(tauri::generate_handler![
    voice::commands::start_asr,
    voice::commands::stop_asr,
    voice::tls_smoke_test,
    platform::commands::platform_config_get,
    platform::commands::platform_config_set,
    platform::commands::platform_connect,
    platform::commands::platform_disconnect,
    platform::commands::platform_connection_info,
    platform::commands::platform_recent_logs,
  ]);

  // 关闭按钮只隐藏窗口，退出由托盘菜单负责；窗口真正销毁时顺手收掉 Chrome，
  // 免得残留一个没有父进程的浏览器。两件事必须在同一个闭包里：
  // on_window_event 只能注册一次，后注册的会覆盖前一个。
  #[cfg(desktop)]
  let builder = builder.on_window_event(|window, event| match event {
    tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
      api.prevent_close();
      let _ = window.hide();
    }
    tauri::WindowEvent::Destroyed => {
      if let Some(browser) = window
        .app_handle()
        .try_state::<Arc<platform::BrowserManager>>()
      {
        browser.close();
      }
    }
    _ => {}
  });

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

改完跑一次 `git diff src-tauri/src/lib.rs`，确认 `ensure_crypto_provider`、日志插件、
`tls_smoke_test`、窗口隐藏这四样都还在。

- [ ] **Step 4: 编译并跑全部 Rust 测试**

```bash
cd src-tauri && cargo check && cargo test
```

Expected: 编译通过；`teaching-platform` 54 passed，app crate 17 passed（config 6 + events 4 + browser 7）加上原有的 voice 测试。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src
git commit -m "feat(platform): 暴露连接 command，启动即连，托盘状态改由 Rust 同步"
```

---

## Task 12: 前端协议绑定层

**Files:**
- Create: `src/lib/platform-api/types.ts`
- Create: `src/lib/platform-api/index.ts`
- Create: `src/hooks/use-platform-log.ts`
- Modify: `src/hooks/use-connection.ts`

- [ ] **Step 1: 写类型**

创建 `src/lib/platform-api/types.ts`：

```ts
/** 与 src-tauri/src/platform/events.rs 与 config.rs 一一对应，改动需同步两侧 */

export type ConnectionState =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface ConnectionInfo {
  state: ConnectionState;
  classroomId: number | null;
  lessonId: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  connectedAt: number | null;
  reconnectCount: number;
  lastError: string | null;
  /** 顶号后为 true，此时 Rust 侧已停止自动重连 */
  kicked: boolean;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type LogSource = 'connection' | 'command' | 'agent' | 'browser';

export interface LogEntry {
  id: string;
  at: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  detail?: string;
}

export interface BaseConfig {
  host: string;
  port: number;
  /** 为真时用 https / wss */
  secure: boolean;
}

/** 桌面端（大屏 APP 端） */
export interface ScreenAppConfig extends BaseConfig {
  appKey: string;
  appSecret: string;
  chromePath: string | null;
  kiosk: boolean;
}

/** 安卓端（机器人） */
export interface RobotConfig extends BaseConfig {
  deviceNo: string;
  deviceSecret: string;
}

export type RoleConfig = ScreenAppConfig | RobotConfig;

export function isScreenAppConfig(
  config: RoleConfig,
): config is ScreenAppConfig {
  return 'appKey' in config;
}

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  idle: '未配置',
  authorizing: '等待授权',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
  error: '连接异常',
};

export const EMPTY_SCREEN_APP_CONFIG: ScreenAppConfig = {
  host: '',
  port: 8084,
  secure: false,
  appKey: '',
  appSecret: '',
  chromePath: null,
  kiosk: false,
};

export const EMPTY_ROBOT_CONFIG: RobotConfig = {
  host: '',
  port: 8084,
  secure: false,
  deviceNo: '',
  deviceSecret: '',
};

export const INITIAL_CONNECTION_INFO: ConnectionInfo = {
  state: 'idle',
  classroomId: null,
  lessonId: null,
  lessonTitle: null,
  courseName: null,
  connectedAt: null,
  reconnectCount: 0,
  lastError: null,
  kicked: false,
};

export function serverUrl(config: BaseConfig): string {
  return `${config.secure ? 'https' : 'http'}://${config.host}:${config.port}`;
}

export type ConfigValidationErrors = Partial<
  Record<keyof ScreenAppConfig | keyof RobotConfig, string>
>;

export function validateConfig(config: RoleConfig): ConfigValidationErrors {
  const errors: ConfigValidationErrors = {};

  if (!config.host.trim()) {
    errors.host = '请填写服务器地址';
  }
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    errors.port = '端口需为 1 - 65535 之间的整数';
  }

  if (isScreenAppConfig(config)) {
    if (!config.appKey.trim()) errors.appKey = '请填写 AppKey';
    if (!config.appSecret.trim()) errors.appSecret = '请填写 AppSecret';
  } else {
    if (!config.deviceNo.trim()) errors.deviceNo = '请填写设备编号';
    if (!config.deviceSecret.trim()) errors.deviceSecret = '请填写设备密钥';
  }

  return errors;
}

export function isConfigComplete(config: RoleConfig): boolean {
  return Object.keys(validateConfig(config)).length === 0;
}
```

- [ ] **Step 2: 写绑定层**

创建 `src/lib/platform-api/index.ts`：

```ts
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { IS_ANDROID } from '@/lib/platform';
import {
  type ConnectionInfo,
  EMPTY_ROBOT_CONFIG,
  EMPTY_SCREEN_APP_CONFIG,
  INITIAL_CONNECTION_INFO,
  type LogEntry,
  type RoleConfig,
} from './types';

// 用 `export *` 而不是 `export type *`：types.ts 里还有 EMPTY_* 常量和
// validateConfig 这些运行时值，只转发类型会让调用方拿不到它们
export * from './types';

/** 浏览器里调 UI 时没有原生侧，全部降级成空值 */
const emptyConfig = (): RoleConfig =>
  IS_ANDROID ? { ...EMPTY_ROBOT_CONFIG } : { ...EMPTY_SCREEN_APP_CONFIG };

export async function getConfig(): Promise<RoleConfig> {
  if (!isTauri()) return emptyConfig();
  return await invoke<RoleConfig>('platform_config_get');
}

/** 保存后原生侧会立即以新参数重新连接 */
export async function setConfig(config: RoleConfig): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_config_set', { config });
}

export async function connect(): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_connect');
}

export async function disconnect(): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_disconnect');
}

export async function getConnectionInfo(): Promise<ConnectionInfo> {
  if (!isTauri()) return INITIAL_CONNECTION_INFO;
  return await invoke<ConnectionInfo>('platform_connection_info');
}

export async function getRecentLogs(): Promise<LogEntry[]> {
  if (!isTauri()) return [];
  return await invoke<LogEntry[]>('platform_recent_logs');
}

type Unsubscribe = () => void;

function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Unsubscribe {
  if (!isTauri()) return () => {};

  let disposed = false;
  let stop: Unsubscribe | null = null;

  void listen<T>(event, ({ payload }) => handler(payload)).then((unlisten) => {
    if (disposed) {
      unlisten();
      return;
    }
    stop = unlisten;
  });

  return () => {
    disposed = true;
    stop?.();
  };
}

export function onConnectionChange(
  handler: (info: ConnectionInfo) => void,
): Unsubscribe {
  return subscribe<ConnectionInfo>('platform://connection', handler);
}

export function onLog(handler: (entry: LogEntry) => void): Unsubscribe {
  return subscribe<LogEntry>('platform://log', handler);
}
```

托盘的「重新连接」不走前端：`tray.rs` 直接调 `platform::commands::start`，前端只会通过
`platform://connection` 看到状态变化，因此这里不需要 `tray://reconnect` 的订阅。

- [ ] **Step 3: 改写 use-connection**

`src/hooks/use-connection.ts` 整体替换为：

```ts
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import {
  connect,
  type ConnectionInfo,
  disconnect,
  getConnectionInfo,
  INITIAL_CONNECTION_INFO,
  onConnectionChange,
} from '@/lib/platform-api';

const connectionAtom = atom<ConnectionInfo>(INITIAL_CONNECTION_INFO);

/**
 * 连接由 Rust 在启动时自动建立，前端只负责订阅与展示。
 * 首屏先 invoke 一次拿当前值，否则要等下一次状态变化才有内容。
 */
export function useConnection() {
  const [info, setInfo] = useAtom(connectionAtom);

  useEffect(() => {
    void getConnectionInfo().then(setInfo);
    return onConnectionChange(setInfo);
  }, [setInfo]);

  return { info, reconnect: connect, disconnect };
}
```

- [ ] **Step 4: 写日志订阅 hook**

创建 `src/hooks/use-platform-log.ts`：

```ts
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { getRecentLogs, onLog } from '@/lib/platform-api';
import type { LogEntry } from '@/lib/platform-api';

/** 与 Rust 侧的环形缓冲容量保持一致 */
const CAPACITY = 200;

const logsAtom = atom<LogEntry[]>([]);

export function usePlatformLog() {
  const [entries, setEntries] = useAtom(logsAtom);

  useEffect(() => {
    // 先补齐订阅之前已经产生的日志，再接增量
    void getRecentLogs().then(setEntries);

    return onLog((entry) => {
      setEntries((current) => {
        const next = [...current, entry];
        return next.length > CAPACITY ? next.slice(-CAPACITY) : next;
      });
    });
  }, [setEntries]);

  return entries;
}
```

- [ ] **Step 5: 检查**

```bash
pnpm check && pnpm exec tsc --noEmit
```

Expected: 只剩下引用了旧 `ConnectionInfo` 字段的组件报错（Task 13 处理）。若 `use-connection.ts`、`use-platform-log.ts` 或 `src/lib/platform-api/` 自身报错，先修它们再往下走。

- [ ] **Step 6: 提交**

```bash
git add src/lib/platform-api src/hooks/use-connection.ts src/hooks/use-platform-log.ts
git commit -m "feat(platform): 前端连接与日志绑定层"
```

---

## Task 13: 前端界面改造

**Files:**
- Create: `src/components/log-panel.tsx`
- Modify: `src/lib/format.ts`
- Modify: `src/components/connection-status-card.tsx`
- Modify: `src/components/connection-details.tsx`
- Modify: `src/components/connection-state-badge.tsx`
- Modify: `src/components/server-config-fields.tsx`
- Modify: `src/components/server-config-form.tsx`
- Modify: `src/hooks/use-server-config.ts`
- Modify: `src/hooks/use-save-server-config.ts`
- Modify: `src/hooks/use-server-config-draft.ts`
- Modify: `src/components/desktop/home.tsx`
- Modify: `src/components/mobile/home.tsx`
- Modify: `src/components/mobile/settings.tsx`
- Modify: `src/routes/__root.tsx`
- Delete: `src/lib/connection/`（整个目录）、`src/lib/config/store.ts`

`src/routes/settings.tsx` 只是把 `MobileSettings` 挂到路由上，不涉及这些类型，不用动。

- [ ] **Step 1: 删掉被取代的文件**

```bash
git rm -r src/lib/connection src/lib/config/store.ts
```

若 `src/lib/config/` 删空后只剩空目录，一并删掉。

- [ ] **Step 2: 改配置相关 hook**

`src/hooks/use-server-config.ts` 整体替换为：

```ts
import { atom, useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { getConfig, setConfig } from '@/lib/platform-api';
import {
  EMPTY_ROBOT_CONFIG,
  EMPTY_SCREEN_APP_CONFIG,
  type RoleConfig,
} from '@/lib/platform-api';
import { IS_ANDROID } from '@/lib/platform';

const initial: RoleConfig = IS_ANDROID
  ? EMPTY_ROBOT_CONFIG
  : EMPTY_SCREEN_APP_CONFIG;

const configAtom = atom<RoleConfig>(initial);
const loadedAtom = atom(false);

/** 配置只在应用生命周期内读取一次，组件重挂载不应重复走 IPC */
let didLoad = false;

export function useServerConfig() {
  const [config, setLocal] = useAtom(configAtom);
  const [loaded, setLoaded] = useAtom(loadedAtom);

  useEffect(() => {
    if (didLoad) return;
    didLoad = true;

    void getConfig().then((stored) => {
      setLocal(stored);
      setLoaded(true);
    });
  }, [setLocal, setLoaded]);

  /** 落盘由 Rust 完成，保存后原生侧会立即以新参数重连 */
  const save = useCallback(
    async (next: RoleConfig) => {
      setLocal(next);
      await setConfig(next);
    },
    [setLocal],
  );

  return { config, loaded, save };
}
```

`src/hooks/use-save-server-config.ts` 整体替换为：

```ts
import { toast } from 'sonner';
import { useServerConfig } from '@/hooks/use-server-config';
import { type RoleConfig, serverUrl } from '@/lib/platform-api';

/**
 * 落盘配置。重连由 Rust 在保存后自动发起，前端不再自己触发。
 *
 * @param onSaved 保存成功后的收尾动作，移动端用它退回首页
 */
export function useSaveServerConfig(onSaved?: () => void | Promise<void>) {
  const { save } = useServerConfig();

  return async (next: RoleConfig) => {
    await save(next);
    toast.success('配置已保存', { description: `正在连接 ${serverUrl(next)}` });
    await onSaved?.();
  };
}
```

`src/hooks/use-server-config-draft.ts` 整体替换为：

```ts
import { useCallback, useState } from 'react';
import {
  type ConfigValidationErrors,
  type RoleConfig,
  validateConfig,
} from '@/lib/platform-api';

/** 表单草稿与校验，PC 端与移动端两套 UI 共用同一份逻辑 */
export function useServerConfigDraft(
  initialConfig: RoleConfig,
  onSubmit: (config: RoleConfig) => void,
) {
  const [draft, setDraft] = useState(initialConfig);
  const [errors, setErrors] = useState<ConfigValidationErrors>({});

  const patch = useCallback((partial: Partial<RoleConfig>) => {
    setDraft((current) => ({ ...current, ...partial }) as RoleConfig);
  }, []);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const found = validateConfig(draft);
      setErrors(found);

      if (Object.keys(found).length === 0) {
        onSubmit(draft);
      }
    },
    [draft, onSubmit],
  );

  return { draft, errors, patch, submit };
}
```

- [ ] **Step 3: 改配置字段**

`src/components/server-config-fields.tsx` 里做四处改动，其余原样保留：

1. 顶部 import 换成：

```tsx
import {
  type ConfigValidationErrors,
  isScreenAppConfig,
  type RoleConfig,
  serverUrl,
} from '@/lib/platform-api';
```

2. `ServerConfigFieldProps` 的 `draft` / `onPatch` 类型换成 `RoleConfig` / `Partial<RoleConfig>`。

3. 把 `ClientIdField` 与 `ClientSecretField` 整个替换为下面四个组件（`SecretField` 抽出了原来那段带眼睛按钮的输入框，两个角色共用）：

```tsx
function SecretField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? '隐藏密钥' : '显示密钥'}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** 大屏 APP 端：app_key / app_secret 换票，外加 Chrome 路径与 kiosk */
export function ScreenAppFields({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  if (!isScreenAppConfig(draft)) return null;

  return (
    <>
      <Field data-invalid={errors.appKey ? true : undefined}>
        <FieldLabel htmlFor="appKey">AppKey</FieldLabel>
        <Input
          id="appKey"
          value={draft.appKey}
          placeholder="在平台注册的大屏标识"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.appKey ? true : undefined}
          onChange={(event) => onPatch({ appKey: event.target.value })}
        />
        <FieldError>{errors.appKey}</FieldError>
      </Field>

      <SecretField
        id="appSecret"
        label="AppSecret"
        value={draft.appSecret}
        error={errors.appSecret}
        onChange={(appSecret) => onPatch({ appSecret })}
      />

      <Field>
        <FieldLabel htmlFor="chromePath">Chrome 路径</FieldLabel>
        <Input
          id="chromePath"
          value={draft.chromePath ?? ''}
          placeholder="留空则自动探测"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) =>
            onPatch({ chromePath: event.target.value || null })
          }
        />
        <FieldDescription>
          macOS 可直接填 /Applications/Google Chrome.app
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <FieldLabel htmlFor="kiosk">全屏 kiosk 模式</FieldLabel>
        <Switch
          id="kiosk"
          checked={draft.kiosk}
          onCheckedChange={(kiosk) => onPatch({ kiosk })}
        />
      </Field>
    </>
  );
}

/** 机器人：Device Flow 用的设备编号与密钥 */
export function RobotFields({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  if (isScreenAppConfig(draft)) return null;

  return (
    <>
      <Field data-invalid={errors.deviceNo ? true : undefined}>
        <FieldLabel htmlFor="deviceNo">设备编号</FieldLabel>
        <Input
          id="deviceNo"
          value={draft.deviceNo}
          placeholder="平台分配的 device_no"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.deviceNo ? true : undefined}
          onChange={(event) => onPatch({ deviceNo: event.target.value })}
        />
        <FieldError>{errors.deviceNo}</FieldError>
      </Field>

      <SecretField
        id="deviceSecret"
        label="设备密钥"
        value={draft.deviceSecret}
        error={errors.deviceSecret}
        onChange={(deviceSecret) => onPatch({ deviceSecret })}
      />
    </>
  );
}
```

4. `ServerConfigFields` 改为按角色渲染：

```tsx
/** 完整字段列表，按角色分化 */
export function ServerConfigFields(props: ServerConfigFieldProps) {
  return (
    <FieldGroup>
      <HostField {...props} />
      <PortField {...props} />
      <ScreenAppFields {...props} />
      <RobotFields {...props} />
      <SecureField {...props} />
      <TargetUrlDescription draft={props.draft} />
    </FieldGroup>
  );
}
```

`TargetUrlDescription` 的 `draft` 类型改成 `RoleConfig`，文案里的 `serverUrl(draft)` 现在返回 `http(s)://`，把「将连接到」改成「服务器地址」。

`src/components/server-config-form.tsx` 只需把 `import type { ServerConfig } from '@/lib/connection/types';` 换成 `import type { RoleConfig } from '@/lib/platform-api';`，并把两处 `ServerConfig` 换成 `RoleConfig`。

- [ ] **Step 4: 放宽 formatText**

新的 `classroomId` / `lessonId` 是 `number | null`，而 `src/lib/format.ts` 里的
`formatText` 只收 `string | null`，直接传会类型报错。把它替换为：

```ts
export function formatText(value: string | number | null): string {
  if (value === null) return PLACEHOLDER;
  if (typeof value === 'number') return String(value);
  return value.trim() ? value : PLACEHOLDER;
}
```

同时删掉 `formatLatency`：新的 `ConnectionInfo` 不再有 `latencyMs`，改完后没有调用方。

- [ ] **Step 5: 改状态展示组件**

`src/components/connection-state-badge.tsx` 做两处改动：import 从 `@/lib/connection/types`
换成 `@/lib/platform-api`；`STATE_STYLE` 里补一行 `authorizing`，与 `connecting` 同样式：

```tsx
  authorizing: { variant: 'secondary', dot: 'bg-primary animate-pulse' },
```

`src/components/connection-status-card.tsx` 整体替换为：

```tsx
import { BookOpen, DoorOpen, RefreshCw } from 'lucide-react';
import { ConnectionStateBadge } from '@/components/connection-state-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ConnectionInfo } from '@/lib/platform-api';
import { formatText } from '@/lib/format';

const BUSY_STATES = new Set(['connecting', 'reconnecting']);

const DESKTOP_UNCONFIGURED_HINT = '尚未配置服务器，请先在右侧填写连接参数';

interface ConnectionStatusCardProps {
  info: ConnectionInfo;
  serverUrl: string | null;
  /** 未配置时的引导文案，移动端的设置入口不在右侧而在应用栏 */
  unconfiguredHint?: string;
  onReconnect: () => void;
}

export function ConnectionStatusCard({
  info,
  serverUrl,
  unconfiguredHint = DESKTOP_UNCONFIGURED_HINT,
  onReconnect,
}: ConnectionStatusCardProps) {
  const busy = BUSY_STATES.has(info.state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>连接状态</CardTitle>
        <CardDescription>{serverUrl ?? unconfiguredHint}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={onReconnect}
            disabled={busy}
          >
            <RefreshCw data-icon="inline-start" />
            重新连接
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <StatBlock label="当前状态">
          <ConnectionStateBadge state={info.state} />
        </StatBlock>

        <StatBlock label="教室 ID" icon={<DoorOpen className="size-3.5" />}>
          <span className="font-mono text-lg leading-none font-medium">
            {formatText(info.classroomId)}
          </span>
        </StatBlock>

        <StatBlock label="当前课堂" icon={<BookOpen className="size-3.5" />}>
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-medium">
              {formatText(info.lessonTitle)}
            </span>
            {info.courseName ? (
              <span className="truncate text-xs text-muted-foreground">
                {info.courseName}
              </span>
            ) : null}
          </div>
        </StatBlock>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}
```

`src/components/connection-details.tsx` 里 `Row` 组件原样保留，上半部分整体替换为
（旧的延迟、心跳、会话 ID、服务端版本、机器人字段在新协议里都没有对应来源，一并删掉）：

```tsx
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Uptime } from '@/components/uptime';
import type { ConnectionInfo } from '@/lib/platform-api';
import { formatText } from '@/lib/format';

export function ConnectionDetails({ info }: { info: ConnectionInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>连接详情</CardTitle>
        <CardDescription>由服务器在登录快照与事件中下发</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {info.lastError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>
              {info.kicked ? '已在别处连接' : '最近一次错误'}
            </AlertTitle>
            <AlertDescription>
              {info.lastError}
              {/* 顶号后 Rust 侧不再自动重连，得说清楚要人工介入 */}
              {info.kicked ? '。确认另一处已关闭后，点「重新连接」。' : ''}
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="flex flex-col gap-3 text-sm">
          <Row label="在线时长">
            <Uptime since={info.connectedAt} />
          </Row>
          <Row label="重连次数">{info.reconnectCount}</Row>

          <Separator />

          <Row label="课堂 ID" mono>
            {formatText(info.lessonId)}
          </Row>
          <Row label="课程">{formatText(info.courseName)}</Row>
        </dl>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: 写日志面板**

创建 `src/components/log-panel.tsx`：

```tsx
import { useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePlatformLog } from '@/hooks/use-platform-log';
import type { LogEntry, LogLevel, LogSource } from '@/lib/platform-api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const LEVEL_CLASS: Record<LogLevel, string> = {
  info: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
};

const SOURCE_LABEL: Record<LogSource, string> = {
  connection: '连接',
  command: '指令',
  agent: '助手',
  browser: '浏览器',
};

/** 只有停在底部时才自动跟随，否则会打断正在往回翻的人 */
const FOLLOW_THRESHOLD_PX = 48;

export function LogPanel({ className }: { className?: string }) {
  const entries = usePlatformLog();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom <= FOLLOW_THRESHOLD_PX) {
      node.scrollTop = node.scrollHeight;
    }
  }, [entries]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>运行日志</CardTitle>
        <CardDescription>连接变化、收发指令与助手回复</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="h-80 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm"
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground">暂无日志</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
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
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTime(entry.at)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          [{SOURCE_LABEL[entry.source]}]
        </span>
        <span className={cn('break-all', LEVEL_CLASS[entry.level])}>
          {entry.message}
        </span>
      </div>
      {entry.detail ? (
        <details className="pl-14">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            详情
          </summary>
          <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap">
            {entry.detail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: 挂到首页并去掉 bootstrap**

`src/components/desktop/home.tsx` 整体替换为：

```tsx
import { ConnectionDetails } from '@/components/connection-details';
import { ConnectionStatusCard } from '@/components/connection-status-card';
import { LogPanel } from '@/components/log-panel';
import { ServerConfigForm } from '@/components/server-config-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnection } from '@/hooks/use-connection';
import { useSaveServerConfig } from '@/hooks/use-save-server-config';
import { useServerConfig } from '@/hooks/use-server-config';
import { isConfigComplete, serverUrl } from '@/lib/platform-api';

export function DesktopHome() {
  const { config, loaded } = useServerConfig();
  const { info, reconnect } = useConnection();
  const handleSubmit = useSaveServerConfig();

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">GDUFE Classroom</h1>
        <p className="text-sm text-muted-foreground">
          大屏 APP 端。关闭窗口后应用会驻留在系统托盘，可从托盘菜单重新打开。
        </p>
      </header>

      <ConnectionStatusCard
        info={info}
        serverUrl={isConfigComplete(config) ? serverUrl(config) : null}
        onReconnect={reconnect}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ConnectionDetails info={info} />
        {loaded ? (
          <ServerConfigForm initialConfig={config} onSubmit={handleSubmit} />
        ) : (
          <Skeleton className="h-96 w-full rounded-xl" />
        )}
      </div>

      <LogPanel />
    </main>
  );
}
```

`src/components/mobile/home.tsx` 加 `import { LogPanel } from '@/components/log-panel';`，
在 `<VoiceDemo />` 之后加一行 `<LogPanel />`，并把文件顶部注释的第二句改成：

```tsx
 * 连接由 Rust 在应用启动时自动建立，不依赖本页挂载。
```

`src/routes/__root.tsx` 删掉 `useConnectionBootstrap` 的 import 与 `RootLayout` 里的调用——
自动连接的职责已经在 Rust 侧。

- [ ] **Step 8: 修移动端设置页**

`src/components/mobile/settings.tsx` 做四处改动，页面结构与样式原样保留：

1. 字段组件的 import 里，`ClientIdField, ClientSecretField` 换成 `RobotFields, ScreenAppFields`。
2. 类型 import 换成 `import { isConfigComplete, type RoleConfig, serverUrl } from '@/lib/platform-api';`，两处 `ServerConfig` 换成 `RoleConfig`。
3. `const { info, reconnect, simulateFailure } = useConnection();` 去掉 `simulateFailure`，
   `<ConnectionStatusCard>` 上的 `onSimulateFailure={simulateFailure}` 一并删掉。
4. 「身份凭据」卡片里的两个字段换成按角色分化的那组：

```tsx
          <FieldGroup>
            <ScreenAppFields {...fieldProps} />
            <RobotFields {...fieldProps} />
          </FieldGroup>
```

两个组件内部各自用 `isScreenAppConfig` 判断，不匹配时返回 `null`，所以同时写上不会重复渲染。

- [ ] **Step 9: 检查并构建**

```bash
pnpm check && pnpm exec tsc --noEmit && pnpm build
```

Expected: 三条都无错误。`tsc` 的剩余报错多半是漏改的 `@/lib/connection/types` import，按报错逐个换成 `@/lib/platform-api`。另外确认 `rg 'lib/connection|lib/config' src` 无输出——有输出说明还有文件引用着已删掉的模块。

- [ ] **Step 10: 提交**

```bash
git add -A src
git commit -m "feat(platform): 前端切到 Rust 连接层，新增日志面板并删除 mock 客户端"
```

---

## Task 14: 端到端联调

**Files:** 无代码改动（除非发现缺陷）

- [ ] **Step 1: 起本应用**

```bash
pnpm pc:dev
```

在配置表单里填：服务器地址 `8.163.33.11`、端口 `8084`、TLS 关、AppKey `123456`、AppSecret `1234567890`、Chrome 路径 `/Applications/Google Chrome.app`（macOS），保存。

Expected: 状态卡在几秒内变成「已连接」，日志区出现「已连接到教学平台」，托盘图标变绿。

- [ ] **Step 2: 起机器人模拟器充当指令发起方**

```bash
cd ../mock-server && python robot_sim.py --device-flow --device-no 123456 --device-secret 1234567890
```

按提示完成 Device Flow（浏览器打开 `verification_uri_complete` 并由老师确认）。

- [ ] **Step 3: 逐项验证**

在 sim 的交互提示符里依次输入：

| 输入 | 预期 |
|---|---|
| `appstatus` | sim 收到 ack，`data` 里有 `version: "gdufe-screen-app/…"` 与 `browser_running: false` |
| `openscreen` | 本机弹出一个新的 Chrome 窗口打开演示大屏；应用日志区出现「已打开演示大屏」 |
| `appstatus` | `browser_running` 变成 `true` |
| `openscreen` 再来一次 | 旧窗口关闭、新窗口打开，同时只有一个 |
| `closebrowser` | Chrome 退出；ack 里 `closed: true`；日志区出现「已关闭浏览器」 |
| `closebrowser` 再来一次 | ack 里 `closed: false`，不报错 |
| `pptnext` | 见下 |

`ppt.next` 按协议会被服务端转发给大屏，而本计划只实现 `app.*`，所以两种结果都算通过：
机器人已绑定课堂时，sim 收到 `40006`「不支持的指令」——这是本应用回的，说明未知 op 走了
错误帧而不是被静默吞掉；没有进行中的课堂时，服务端自己就回 `40003`，帧根本到不了本应用。
无论哪种，本应用都不该崩溃或断连，日志区也不该出现「已断开」。

- [ ] **Step 4: 验证连接韧性**

| 操作 | 预期 |
|---|---|
| 拔网线 / 关 Wi-Fi 30 秒 | 状态转「重连中」，日志区出现「连接已断开」，恢复网络后自动连上，重连次数加 1 |
| 另起一个 `python screen_app_sim.py --base-url http://8.163.33.11:8084 --app-key 123456 --app-secret 1234567890 --chrome "/Applications/Google Chrome.app"` | 本应用被顶号：状态变「连接异常」、详情卡提示「已在别处连接」、**不再自动重连**；关掉 sim 后点「重新连接」能恢复 |
| 把 AppSecret 改错并保存 | 状态变「连接异常」，日志区给出后端返回的中文文案，**不重试** |
| 把服务器地址清空并保存 | 状态回到「未配置」，不发起连接 |
| 关闭主窗口再从托盘打开 | 状态与日志都还在（日志由 Rust 侧的环形缓冲补齐） |
| 退出应用 | 托管的 Chrome 一并退出 |
| 保持连接不动，让老师在网页端开始一节新课 | 状态卡与托盘上的课堂跟着变，日志区出现「课堂开始：…」；结课时变回「—」并出现「课堂结束：…」。这条验证的是「不缓存首帧 `lesson_id`」，没有可用课堂时可跳过，但要在结论里注明未验证 |

- [ ] **Step 5: 排查参考**

| 现象 | 排查方向 |
|---|---|
| 一直停在「连接中」 | 换票成功但 WS 连不上，多半是 `resolve_ws_url` 拼错，打日志看最终 URL |
| 连上后 60 秒被断开，关闭码 4009 | 心跳没发出去，检查 `spawn_heartbeat` 是否被 `ticker.tick()` 的首次立即返回吃掉 |
| 心跳每次都超时 | 配对时误比对了 `op`，`conn.ping` 的响应 `op` 是 `conn.pong` |
| `app.open_url` 回 error「Permission denied」 | macOS 的 `.app` 没转成 bundle 里的可执行文件，检查 `normalize_chrome_path` |
| Chrome 起来了但没声音 / 不自动播放 | `--autoplay-policy=no-user-gesture-required` 丢了，或 URL 被插到了参数中间 |
| 关了浏览器但 `app.status` 仍报 running | `close()` 没等进程真的退出，检查 `try_wait` 轮询那段 |
| 换了课堂但界面上还是旧课堂 | `lesson.started` / `lesson.ended` 落进了 `Unknown`，检查 `ServerEvent::parse` 的 op 字面量与 `on_event` 的分支 |

- [ ] **Step 6: 记录结论**

把实测到的 `ws_url` 形态、`expires_in` 实际值、后端对错误凭证返回的业务码补进设计文档的对应小节，然后：

```bash
git add docs/superpowers/specs/2026-08-10-teaching-platform-integration-design.md
git commit -m "docs: 补充大屏 APP 端联调结论"
```
