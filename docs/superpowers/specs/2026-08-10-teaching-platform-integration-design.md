# 辅助教学平台接入设计

日期：2026-08-10
状态：已确认，待实现

## 背景

本仓库的 Tauri 应用要接入辅助教学平台，同一套代码按平台分化成两个角色：

- **机器人**（Android）— 已有 ASR 链路产出未规范化的指令文本 `cmd`。要把 `cmd` 连同现场信息一起送进 Text 大模型，把 WebSocket 指令作为 OpenAI Tools 供模型调用，由模型生成回复或执行函数调用。
- **大屏 APP 端**（Windows / macOS）— 连接平台 WebSocket，响应 `app.*` 指令拉起 Chrome 打开指定页面。

平台协议见 `TeachingPlatform/docs/api/` 下的 HTTP-API 对接文档、WebSocket 对接文档与 `openapi.json`。参照实现是 `mock-server/robot_sim.py` 与 `mock-server/screen_app_sim.py`。

测试服务器 `http://8.163.33.11:8084`，无 SSL。

## 范围

在范围内：

- 独立的协议 crate：HTTP 信封与错误码、Device Flow、大屏换票、WebSocket 帧编解码与连接生命周期
- 大屏 APP 端：换票 → `/ws/app` → 响应 `app.open_url` / `app.close_browser` / `app.status`，托管 Chrome 进程
- 机器人端：Device Flow（屏上显示 user_code 与二维码）→ `/ws/robot` → 维护现场上下文
- 机器人 Agent：`cmd` + 现场上下文 + 最近 10 轮历史 + 22 个工具 → 模型 → 执行指令 → 结果回灌 → 生成中文回复
- 首页日志区：两端共用，展示连接状态变化、收发指令、模型回复
- 连接状态机整体下沉 Rust，替换现有 `MockConnectionClient`

不在范围内：

- 演示大屏端（`screen-web`）—— 那是浏览器页面，不是本仓库的交付物
- 老师端 / 学生端网页
- TTS 播报模型回复（本阶段只写日志区）
- 机器人执行 `ppt.explain` 后的 `tts.speak_chunk` 字幕渲染
- 课件 PDF 渲染

## 关键决策

### 机器人的上下文只能来自 WebSocket

需求原文要求把「教师、教室、大屏 APP 端、当前课程、课程内学生、PPT 等所有信息」作为提示词。核查 `openapi.json` 全部 96 条路径的 `x-auth.subject_types` 后确认：**接受 `sub_type=device` 的 HTTP 接口只有 `POST /device/logout` 一条**。课程名单、课件页文本、教师信息全部要求用户或大屏凭证。

因此机器人的现场上下文只能来自两处：

1. `auth.login` 的 ack 快照 —— `lesson`（id / title / status / course_id / course_name）、`classroom_id`、`screen_state`（view / courseware_id / page / page_count / ideology_material_id）、`attendance_open`、`sign_in`
2. 随后的服务端事件 —— `ppt.state`、`screen.state`、`attendance.*`、`rollcall.result`、`quiz.*`、`lesson.*`、`discussion.*`

授课教师、学生名单、课件页文本这三项拿不到。它们在 `ContextStore` 中保留为 `Option` 字段并渲染成「当前设备凭证无法获取」写进提示词——不写的话模型会凭空编造名单。等后端为机器人开放上下文接口后再补。

大屏 APP 端的运行状态不做被动缓存：它属于另一条连接，模型需要时调 `app.status` 工具查询。

### 测试服务器是 prod 环境

`GET /api/v1/health` 返回 `app_env: prod`，因此 `/api/v1/dev/robot-token` 与 `/api/v1/dev/screen-token` 两个联调接口不存在。机器人必须走完整 Device Flow，大屏 APP 端必须用 `app_key` / `app_secret` 换票。这与需求给出的 sim 运行命令一致。

### ws_url 是路径而不是绝对地址

WebSocket 对接文档 §1 称大屏换票响应里的 `ws_url`「直接用它，不要自己拼」。实测 `POST /api/v1/screen/token` 返回的是 `"ws_url": "/ws/app"` —— 一个路径。客户端仍须把它拼到 base URL 上，并做 `http→ws` / `https→wss` 的协议替换。`screen_app_sim.py` 也是这么处理的（`http_to_ws(base) + ws_path`）。

实现上按「可能是绝对地址、也可能是路径」两种情况兼容：以 `ws://` 或 `wss://` 开头则原样使用，否则拼接 base。

### 独立协议 crate 而非单 crate 分模块

新增 `src-tauri/crates/teaching-platform`，纯协议与传输，**不依赖 tauri**。app crate 里的 `platform/` 模块只负责把它接到 Tauri 的 command / event / state 上。

这样帧编解码、信封解析、packageId 配对、退避策略能用 `cargo test` 直接跑，不必起 webview；协议层被编译期隔离，改 UI 渗不进协议。`src-tauri/plugins/mic` 已经是 path crate，这个模式是现成的。

被否决的替代方案：单 crate 内分模块（照搬 `voice/` 的写法）——少一层仪式，但没有编译期约束，协议层容易被逐渐掺进 Tauri 类型。

### LLM 层从 voice 提到顶层

现有的 `voice/llm/` 要被机器人 Agent 复用，它已经不是语音专属了，上移为 `src-tauri/src/llm/`。同时 `voice/` 退回纯粹职责：音频 → ASR → 唤醒 → 产出 `cmd` 文本，不再自己解析意图。

现有的 `voice/llm/prompt.rs`（`VoiceCommand` 的 intent-JSON 解析）被 Tools 取代，连同它的 18 个单测一并删除。`VoiceEvent::Command` 的载荷从结构化命令改为原始 `cmd` 文本。

## 架构

```
┌───────────────────────── WebView (React) ──────────────────────────┐
│  desktop/home.tsx │ mobile/home.tsx                                 │
│    <ConnectionStatusCard>  <ServerConfigForm>  <LogPanel>           │
│    机器人端额外： <DeviceFlowCard>（user_code + 二维码）             │
│         ▲ listen('platform://connection' | 'platform://log')        │
│         │ invoke(platform_connect / platform_config_set / …)        │
└─────────┼───────────────────────────────────────────────────────────┘
┌─────────┼──────────────────── app crate ────────────────────────────┐
│  platform/commands.rs   events.rs   state.rs   config.rs            │
│      │                                                               │
│  ┌───▼── robot/ (mobile) ────┐   ┌── screen_app/ (desktop) ──┐      │
│  │ device_flow.rs            │   │ mod.rs   入站 app.* 分发   │      │
│  │ context.rs   现场快照      │   │ browser.rs  Chrome 托管   │      │
│  │ tools.rs     op → Tool     │   └───────────────────────────┘      │
│  │ agent.rs     两轮工具循环   │                                      │
│  └───┬────────────────────────┘                                      │
│      │                    ┌──────────────┐   ┌──────────┐           │
│      └────────────────────│ llm/         │   │ voice/   │           │
│                           │ TextModel    │   │ ASR+唤醒  │           │
│                           │ openai_sdk   │   │ → cmd 文本│           │
│                           └──────────────┘   └──────────┘           │
└─────────┬────────────────────────────────────────────────────────────┘
┌─────────▼──────────── crates/teaching-platform ──────────────────────┐
│  http/  device.rs  screen.rs        envelope.rs   error.rs           │
│  ws/    frame.rs  catalog.rs  snapshot.rs  event.rs                  │
│         conn.rs   backoff.rs                                          │
└──────────────────────────────────────────────────────────────────────┘
```

## 协议 crate `crates/teaching-platform`

依赖 `reqwest`、`tokio-tungstenite`、`tokio`、`serde`、`serde_json`、`uuid`、`async-trait`、`thiserror`、`log`。TLS 沿用 app crate 的策略（`rustls-no-provider` + 调用方保证已装 process-default provider），crate 自身不装 provider。

### `error.rs`

```rust
pub struct ApiError { pub code: i32, pub message: String }

pub enum PlatformError {
    Http(String),
    Api(ApiError),           // 业务码非 0
    Ws(String),
    Closed { code: u16 },    // 4001 / 4002 / 4005 / 4009
    Timeout,
    Decode(String),
}
```

`ApiError::message` 后端保证是可直接展示或朗读的中文，不做二次翻译。错误码常量按 HTTP 文档 §3.1 全表定义，只把客户端要分支处理的几个做成具名常量：`DUPLICATE_PACKAGE = 40902`、`EXPIRED_COMMAND = 40007`、`UNSUPPORTED_OP = 40006`、`TOKEN_EXPIRED = 40102`、`SCREEN_OFFLINE = 50401`、`DEVICE_OFFLINE = 50402`。

### `envelope.rs`

```rust
pub struct Envelope<T> { pub code: i32, pub message: String,
                         pub data: Option<T>, pub request_id: Option<String> }
```

`code != 0` 一律转成 `PlatformError::Api`。判断顺序按文档建议：先看 HTTP 状态码分流成功 / 失败，再用 `code` 区分原因。

### `http/`

`HttpClient { base_url, inner: reqwest::Client }`，`base_url` 形如 `http://8.163.33.11:8084`，内部自行拼 `/api/v1`。

`device.rs`：

```rust
pub struct DeviceCode { pub device_code, user_code, verification_uri,
                        pub verification_uri_complete: String,
                        pub expires_in: u64, pub interval: u64 }

pub enum DeviceTokenPoll {
    Ok { access_token: String, expires_in: u64,
         lesson_id: Option<i64>, classroom_id: Option<i64> },
    Pending { status: PollStatus, interval: Option<u64> },
}
pub enum PollStatus { Pending, SlowDown, Denied, Expired }

impl HttpClient {
    pub async fn device_code(&self, no: &str, secret: &str) -> Result<DeviceCode>;
    pub async fn device_token(&self, device_code: &str) -> Result<DeviceTokenPoll>;
    pub async fn device_logout(&self, token: &str) -> Result<()>;
}
```

两种响应形态靠有没有 `access_token` 区分，不靠 `status` 是否存在。

`screen.rs`：

```rust
pub struct ScreenToken { pub access_token: String, pub expires_in: u64,
                         pub ws_url: String, pub is_app: bool,
                         pub classroom_id: Option<i64>, pub lesson_id: Option<i64> }

impl HttpClient {
    pub async fn screen_token(&self, key: &str, secret: &str) -> Result<ScreenToken>;
    /// ws_url 可能是路径也可能是绝对地址，统一解析成可连接的 URL
    pub fn resolve_ws_url(&self, ws_url: &str) -> String;
}
```

### `ws/frame.rs`

四种帧共用一个反序列化入口，按 `type` 分派：

```rust
pub enum Frame {
    Req   { package_id: String, op: String, ts: i64, params: Value },
    Ack   { package_id: String, op: String, ts: i64, data: Value },
    Error { package_id: String, op: String, ts: i64, code: i32, message: String },
    Event { package_id: String, op: String, ts: i64, data: Value },
}
```

字段名是 camelCase 的 `packageId`，其余为小写。`params` / `data` 缺省为 `{}`。出站 req 每条新建 UUID v4 作 `packageId`（服务端按它去重，最近 200 条），`ts` 取当前毫秒。

### `ws/catalog.rs`

22 个机器人可发的 op 的单点定义，`GET /api/v1/ws/ops` 于 2026-08-10 实测确认：

```rust
pub struct OpSpec {
    pub op: &'static str,
    pub summary: &'static str,        // 中文描述，直接用作 Tool description
    pub params_schema: &'static str,  // JSON Schema 字面量
}
pub const ROBOT_OPS: &[OpSpec] = &[ /* 22 条 */ ];
```

清单：`ppt.open` `ppt.close` `ppt.next` `ppt.prev` `ppt.goto` `ppt.explain`、`screen.switch_view`、`tts.speak` `tts.stop`、`rollcall.start`、`quiz.publish` `quiz.close` `quiz.show_question`、`discussion.open` `discussion.close`、`attendance.open` `attendance.close`、`danmaku.switch`、`ask.show`、`app.open_url` `app.close_browser` `app.status`。

参数 schema 要点：

- `ppt.next` / `ppt.prev` 带 `expect_page`，description 里明确要求填当前页——语音有延迟，不带这个乐观锁会翻错页
- `screen.switch_view` 的 `view` 用 enum 限定 `ppt` / `rollcall` / `discussion` / `ideology` / `quiz` / `danmaku` / `attendance`
- `quiz.publish` / `quiz.close` 的 `quiz_id` 与 `seq` 二选一，description 说明 `seq` 是课堂内序号，可直接对应「发布第一个测试」
- `rollcall.start` 的 `count` 上限 20
- `tts.speak` 的 `text` 上限 1000 字
- `app.open_url` 的 `url` 由后端生成，客户端传了会被忽略，schema 里只留可选的 `lesson_id`

### `ws/conn.rs`

连接的核心。一个 `Connection` 负责：

```rust
pub struct ConnectOptions { pub url: String, pub token: String }

#[async_trait]
pub trait InboundHandler: Send + Sync {
    /// 服务端转发来的 req。返回 Ok 回 ack，Err 回 error 帧
    async fn on_request(&self, op: &str, params: Value) -> Result<Value, ApiError>;
    async fn on_event(&self, op: &str, data: Value);
}

impl Connection {
    pub async fn open(opts, handler: Arc<dyn InboundHandler>) -> Result<(Self, Snapshot)>;
    pub async fn call(&self, op: &str, params: Value) -> Result<Value>;
    pub async fn close(self);
}
```

行为：

- 建连后立刻发 `auth.login`，等 ack，把 `data` 解析成 `Snapshot` 一并返回。5 秒内没发出首帧服务端会以 4002 断开，所以认证不能排在其他初始化之后
- 出站 req 登记 `packageId → oneshot`，收到 ack / error 时配对。**配对只认 `packageId` 不比对 `op`** —— `conn.ping` 的响应 `op` 是 `conn.pong`
- 本地等待超时取 15 秒，比服务端 10 秒转发超时更长，否则会先本地超时、随后又收到迟到的 ack
- 每 25 秒发一次 `conn.ping`。服务端 60 秒没收到任何帧就以 4009 断开
- 入站 req 交 `InboundHandler`，`packageId` 与 `op` 原样带回
- 事件帧交 `on_event`，**不回 ack**

`Connection` 只管一条连接的生命周期，重连由 app crate 的 `run_forever` 循环负责，两者靠 `Connection::close` 返回的关闭原因衔接：

| 关闭码 | 处理 |
|---|---|
| 4005 顶号 | **停止重连**，向上报错，UI 提示「已在别处连接」 |
| 4001 认证失败 | 不原样重连，先重新取 token |
| 4002 认证超时 | 视为异常，退避重连并记日志 |
| 4009 心跳超时 | 直接重连 |
| 其他 / 网络异常 | 指数退避重连 |

不做消息补偿——协议明确断线期间的事件会丢失，重连后以新的 `auth.login` 快照重建状态。

### `ws/backoff.rs`

退避序列独立成一个无 IO 的小结构，放在协议 crate 里是为了能单测：

```rust
pub struct Backoff { attempt: u32 }
impl Backoff {
    pub fn next_delay(&mut self) -> Duration;  // 1s → 2s → 4s … 上限 30s，±20% 抖动
    pub fn reset(&mut self);
}
```

抖动是必要的：一栋楼里几十台大屏 APP 端在网络恢复的同一秒重连会打出一个尖峰。连接成功后调 `reset`。

### `ws/snapshot.rs` 与 `ws/event.rs`

`Snapshot` 对应 `auth.login` ack 的 `data`，`ScreenState` 对应其中的 `screen_state`。`active_quiz` / `active_discussion` 协议注明恒为 `null`，不定义字段。

事件按 op 反序列化成枚举 `ServerEvent`，未知 op 落到 `Unknown { op, data }` 而不是报错——后端加新事件不该让客户端崩。

## app crate `src/platform/`

### `config.rs`

配置按角色分化，由 Rust 持有并读写 `tauri-plugin-store` 的 `settings.json`，key 升到 `server-config:v2`。前端通过 command 读写，不再直接碰 store。

```rust
pub struct BaseConfig { pub host: String, pub port: u16, pub secure: bool }

#[cfg(mobile)]
pub struct RobotConfig { pub base: BaseConfig, pub device_no: String, pub device_secret: String }

#[cfg(desktop)]
pub struct ScreenAppConfig { pub base: BaseConfig, pub app_key: String, pub app_secret: String,
                             pub chrome_path: Option<String>, pub kiosk: bool }
```

`base_url()` 拼成 `http(s)://host:port`。旧的 `server-config:v1`（`clientId` / `clientSecret`）不做迁移，字段语义不同，让用户重填。

### `state.rs` 与 `events.rs`

`PlatformState` 持有连接句柄、当前 `ConnectionInfo`、最近 200 条日志的环形缓冲、`ContextStore`（机器人）与 `BrowserManager`（大屏 APP）。日志缓冲是为了让前端刷新或后开窗口时能补齐已经发生的事，而不是只看到订阅之后的增量。

推给前端两个事件：

```ts
// platform://connection
type ConnectionInfo = {
  state: 'idle' | 'authorizing' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
  classroomId: number | null
  lessonId: number | null
  lessonTitle: string | null
  courseName: string | null
  connectedAt: number | null
  reconnectCount: number
  lastError: string | null
  /** 顶号后为 true，UI 提示且不自动重连 */
  kicked: boolean
}

// platform://log
type LogEntry = {
  id: string
  at: number
  level: 'info' | 'success' | 'warn' | 'error'
  source: 'connection' | 'command' | 'agent' | 'browser'
  message: string
  detail?: string   // 折叠展示：完整帧 JSON、模型原始输出等
}
```

`authorizing` 是机器人 Device Flow 等待老师扫码的状态，桌面端不会出现。

### commands

```
platform_config_get / platform_config_set
platform_connect / platform_disconnect
platform_connection_info          // 首屏读取，避免等第一条事件
platform_recent_logs              // 首屏补齐已产生的日志
```

机器人端额外 `robot_device_flow_state`（返回 user_code 与 `verification_uri_complete` 供渲染二维码）。桌面端额外 `screen_app_browser_status`。

启动时机：`lib.rs` 的 `setup` 里读配置，完整则自动发起连接。大屏 APP 端是常驻程序，开机即连；机器人也一样，不要求用户在 UI 上点一下。现有前端的 `useConnectionBootstrap` 随之删除——自动连接的职责移到 Rust。

## 大屏 APP 端

### 连接流程

```
配置 → POST /api/v1/screen/token {app_key, app_secret}
     → {access_token, expires_in: 86400, ws_url: "/ws/app", classroom_id}
     → 拼 ws URL → 连接 → auth.login{token} → ack 快照
     → 25s conn.ping，入站 app.* 交 handler
     → token 到期前 1 小时重新换票并重连
```

换票失败的分类沿用 `screen_app_sim` 的判据：401 / 403 或业务码落在 40100–40299 视为凭证错误，停止重试并提示；5xx 与 408 / 429 视为临时故障，退避重试。

大屏 APP 端是开机常驻程序，一条连接可能跨越十几次课堂。**不能缓存首帧快照里的 `lesson_id`** —— 服务端会在课堂开始 / 结束时把它重挂到新课堂的房间。需要课堂号时以入站 `app.open_url` 的 `params.lesson_id` 或最近一次 `lesson.*` 事件为准。除 4005 顶号外无限重连。

### 入站指令

| op | 行为 | ack data |
|---|---|---|
| `app.open_url` | 用 `params.url` 拉起 Chrome | `{ok: true, url}` |
| `app.close_browser` | 关闭已托管的进程 | `{ok: true, closed: bool}` |
| `app.status` | 查询 | `{version, browser_running}` |

`version` 取 `env!("CARGO_PKG_VERSION")` 拼上产品名。文档说明排查大屏异常时第一件事就是确认版本，所以这个字段要有意义。

### `browser.rs`

```rust
pub struct BrowserManager { chrome: PathBuf, kiosk: bool, child: Mutex<Option<Child>> }
impl BrowserManager {
    pub fn open_url(&self, url: &str) -> Result<()>;  // 先 close 再开，保证同时只有一个
    pub fn close(&self) -> bool;
    pub fn running(&self) -> bool;
}
```

启动参数对齐 `screen_app_sim`：`--user-data-dir=<temp>/gdufe-screen-app`、`--autoplay-policy=no-user-gesture-required`、`--new-window`、可选 `--kiosk`，最后是 URL。独立 profile 是为了不占用用户日常浏览器配置；放开自动播放策略是因为演示大屏要用 `SpeechSynthesis` 朗读。

**macOS 的路径处理是这里唯一的平台差异。** 需求给的 `--chrome /Applications/Google Chrome.app` 是一个 bundle 目录，不能直接 `Command::new`。`resolve_chrome` 的规则：

1. 显式配置的路径若以 `.app` 结尾，取 `<bundle>/Contents/MacOS/Google Chrome`
2. 否则若是可执行文件，直接用
3. 未配置时按平台探测：macOS 走上述默认 bundle 路径；Windows 查 `%ProgramFiles%` / `%ProgramFiles(x86)%` / `%LocalAppData%` 下的 `Google\Chrome\Application\chrome.exe`；再回落到 `PATH` 里的 `chrome` / `google-chrome`

不用 `open -na` 拉起 bundle：那样拿不到进程句柄，`app.close_browser` 与 `app.status` 就无从实现。

关闭进程：Windows 用 `taskkill /PID <pid> /T /F` 连子进程一起收（Chrome 会 fork 一堆渲染进程，只 kill 父进程会留下孤儿）；其余平台先 `terminate`，5 秒不退再 `kill`。应用退出时也要关掉浏览器。

## 机器人端

### 授权与连接

```
配置 → POST /api/v1/device/code {device_no, device_secret}
     → {device_code, user_code, verification_uri_complete, expires_in: 600, interval: 5}
     → 状态置 authorizing，首页显示 user_code 与二维码
     → 每 interval 秒 POST /api/v1/device/token {device_code}
         pending   → 继续
         slow_down → 间隔 +1 秒后继续
         denied / expired → 停止，提示重新申请
         拿到 access_token → 进入连接
     → 连 ws://host:port/ws/robot，auth.login{token}（不传 lesson_id）
     → ack 快照写入 ContextStore
```

设备 token 12 小时且**无刷新机制**，过期后重走整个 Device Flow。`device_code` 换过一次 token 即作废。

协议规定服务端只向 screen-web 与 screen-app 转发 req，机器人不该收到。但机器人的 `InboundHandler` 仍要对未知 op 回一帧 error（`40006`）而不是静默忽略——静默会让发起方干等到 10 秒超时。

二维码在前端渲染（`qrcode` npm 包），Rust 只给出 `verification_uri_complete` 字符串——避免为了画一张图给 Rust 引入图像依赖。

### `context.rs`

```rust
pub struct ContextStore {
    classroom_id: Option<i64>,
    lesson: Option<LessonBrief>,        // id, title, status, course_id, course_name
    screen: ScreenState,                // view, courseware_id, page, page_count
    sign_in: Option<SignInState>,       // status, signed, total, rate
    last_rollcall: Option<Vec<String>>, // 最近一次点名的姓名，便于「他答对了」这类指代
}
impl ContextStore {
    pub fn apply_snapshot(&mut self, s: &Snapshot);
    pub fn apply_event(&mut self, e: &ServerEvent);
    pub fn render(&self) -> String;
}
```

`render()` 产出提示词里的现场段落：

```
[当前现场]
教室 ID：1
课堂：第 5 讲 决策树（id=88，状态 ongoing）
课程：机器学习导论（id=12）
[大屏]
视图：ppt；当前课件 id=17，第 5 / 32 页
[签到]
开启中，已签到 31 / 45
[最近点名]
李某、王某
[无法获取]
授课教师、学生名单、课件页文本——当前设备凭证不支持查询，需要这些信息时请如实告知老师，不要编造。
```

字段缺失时该段整体省略，只保留「无法获取」段。这段是纯函数，可单测。

### `tools.rs`

把 `catalog::ROBOT_OPS` 转成 `async-openai` 的 `ChatCompletionTool`。工具名用 op 名把 `.` 换成 `_`（`ppt.goto` → `ppt_goto`），因为 OpenAI 的函数名限定 `[a-zA-Z0-9_-]`；调用回来时再换回去。这个双向映射要有单测钉住。

### `agent.rs`

```
cmd 文本
  → 组装 messages：
       system = 角色说明 + context.render() + 工具使用约束
       history = 最近 10 轮（user cmd / assistant tool_calls / tool 结果 / assistant 回复）
       user = cmd
  → 第一轮 chat completion（带 tools）
  → 若无 tool_calls：content 即回复，写日志，入历史，结束
  → 若有 tool_calls：逐个校验 op 在白名单内 → conn.call(op, params)
       ack   → tool 结果为 {ok: true, data}
       error → tool 结果为 {ok: false, code, message}   // message 是中文，直接给模型
  → 第二轮 chat completion（带 tool 结果，不带 tools）→ 最终中文回复
  → 写日志，整轮入历史
```

历史是 10 轮的环形缓冲，`AGENT_HISTORY_TURNS = 10`。裁剪以「轮」为单位，不能把 `tool_calls` 消息和它对应的 `tool` 结果消息拆散——OpenAI 协议要求两者成对，只留一半会被服务端拒绝。这条约束要有单测。

同一时刻只处理一条 `cmd`：老师连说两句时，第二条排队而不是并发。并发发指令会让 PPT 翻两页，这正是协议要做 `packageId` 去重想避免的事故。

工具执行失败不终止会话，把错误交给模型措辞成人话即可。模型调了白名单外的工具名（幻觉）时，返回 `{ok: false, message: "不支持的指令"}` 让它自己纠正。

系统提示里要写清几条约束：

- 只能通过工具操作，不要声称自己做了没调工具的事
- 翻页时必须从现场信息读出当前页并填进 `expect_page`
- 现场信息里标为「无法获取」的内容不要编造
- 回复控制在 30 字以内，口语化，会展示给老师看

### voice 模块的调整

`VoiceEvent::Command` 的载荷从 `{command, source, system, raw}` 改为 `{text: String}`——就是唤醒后的原始 `cmd`。`voice/session.rs` 不再持有 `TextModel`。

`cmd` 如何从 voice 传到 Agent：`SessionDeps` 增加一个 `cmd_sink: mpsc::Sender<String>`，`WakeOutcome::Command(utterance)` 同时做两件事——发 `VoiceEvent::Command` 给前端展示，投一份进 `cmd_sink`。Agent 在独立任务里 `recv` 这个通道，串行处理。用 `mpsc` 而不是让 voice 直接调 Agent，是为了保持 voice 不认识 platform 层；`start_asr` 组装 `SessionDeps` 时才把两者接起来。

通道容量取 8，用 `try_send` 投递，满了就丢弃并记一条 warn 日志。不能用会阻塞的 `send`：那会把音频泵一起卡住，麦克风就聋了。

删除 `voice/llm/prompt.rs` 与 `VoiceCommand`。`voice/llm/` 其余部分上移到 `src/llm/`。`voice/error.rs` 的 `Stage` 枚举去掉 `llm` 分支——语音链路不再调模型，Agent 的失败走 `platform://log` 而不是 `VoiceEvent::Error`。

`src/lib/voice/types.ts` 同步修改（Rust 侧有序列化单测钉住这个契约）。

## LLM 层 `src/llm/`

`TextModel` trait 扩展成支持多轮与工具：

```rust
pub enum ChatMessage {
    System(String),
    User(String),
    Assistant { content: Option<String>, tool_calls: Vec<ToolCall> },
    Tool { call_id: String, content: String },
}
pub struct ToolCall { pub id: String, pub name: String, pub arguments: String }
pub struct ToolSpec { pub name: String, pub description: String, pub parameters: Value }

pub struct ChatRequest { pub messages: Vec<ChatMessage>, pub tools: Vec<ToolSpec> }
pub struct ChatResponse { pub content: Option<String>, pub tool_calls: Vec<ToolCall>, pub raw: String }

#[async_trait]
pub trait TextModel: Send + Sync {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse>;
}
```

`raw` 始终保留模型原始输出，写进日志的 `detail` 供排查。`json_mode` 字段删除——工具调用与 `response_format: json_object` 不能同时用。

`arguments` 是模型给的 JSON 字符串，解析失败时当作空参数并把原文记进日志，不要因为一个引号毁掉整条指令。

## 前端

| 文件 | 变更 |
|---|---|
| `lib/connection/mock-client.ts` | 删除 |
| `lib/connection/client.ts` | 改为对 Rust command / event 的薄封装 |
| `lib/connection/types.ts` | `ConnectionInfo` 对齐 Rust；`ServerConfig` 按角色分化 |
| `lib/connection/tray-bridge.ts` | 删除。托盘改为 Rust 内部直接读状态，去掉前端 emit → Rust listen 这条绕路 |
| `lib/config/store.ts` | 改为调 command；非 Tauri 环境回落 localStorage 以便浏览器里调 UI |
| `components/log-panel.tsx` | 新增，两端共用 |
| `components/device-flow-card.tsx` | 新增，机器人端 user_code + 二维码 |
| `components/server-config-fields.tsx` | 按角色渲染不同字段 |
| `components/desktop/home.tsx` | 加 `<LogPanel>` |
| `components/mobile/home.tsx` | 加 `<DeviceFlowCard>` 与 `<LogPanel>` |
| `components/voice-demo.tsx` | `CommandRow` 简化成展示 cmd 文本，模型交互移到日志区 |
| `hooks/use-connection.ts` | 改为订阅 `platform://connection` |
| `hooks/use-platform-log.ts` | 新增，订阅 `platform://log`，保留最近 200 条 |

`<LogPanel>` 沿用 `voice-demo.tsx` 里 `Timeline` 已经调好的滚动行为：只有用户停在底部时才自动跟随，否则不打断正在往回翻的人。

新增依赖 `qrcode`。

## 错误处理

| 场景 | 处理 |
|---|---|
| 配置不完整 | 不发起连接，状态停在 `idle`，表单标红 |
| 换票凭证错误（401/403/40100–40299） | 状态 `error`，停止重试，日志给出 `message` |
| 换票临时故障（5xx/408/429/网络） | 退避重试，状态 `reconnecting` |
| Device Flow 被拒绝 / 过期 | 状态 `error`，提示重新申请，不自动重来 |
| WS 4005 顶号 | 状态 `error` 且 `kicked: true`，**停止自动重连**，等人工确认 |
| WS 4001 | 丢弃 token，重新换票 / 重走 Device Flow |
| WS 4009 / 网络断开 | 指数退避重连 |
| 单条指令返回 error 帧 | 只影响该条指令，连接保持；机器人把 `message` 交给模型措辞 |
| 入站 `app.open_url` 拉起 Chrome 失败 | 回 error 帧，`code: 50001`，`message` 用中文说明（会被转回发起方并可能被 TTS 朗读） |
| LLM 请求失败 / 超时 | 只丢这一条 cmd，日志记错误，ASR 会话继续 |
| 模型返回非法 `arguments` | 当作空参数执行，原文记日志 |

## 测试

协议 crate（纯函数，`cargo test` 直接跑）：

- `frame.rs` — 四种帧的序列化与反序列化；`params` / `data` 缺省成 `{}`；`packageId` 为 camelCase；非法 JSON 的容错
- `envelope.rs` — `code: 0` 取 `data`；非 0 转 `ApiError`；`data: null` 的处理
- `http/screen.rs` — `resolve_ws_url` 对路径、绝对 `ws://`、`https` base 三种输入的结果
- `http/device.rs` — `DeviceTokenPoll` 两种形态的判别（靠 `access_token` 而非 `status`）
- `conn.rs` — packageId 配对；`conn.pong` 的 op 不同仍能配对；本地超时清理登记表
- `backoff.rs` — 序列递增、30 秒上界、抖动落在 ±20% 内、`reset` 生效
- `catalog.rs` — 22 个 op 一个不漏；每条的 `params_schema` 都是合法 JSON Schema

app crate：

- `browser.rs` — `resolve_chrome` 对 `.app` bundle / 可执行文件 / 未配置三种输入；启动参数构造（含 kiosk 开关）
- `context.rs` — `render()` 在字段齐全 / 部分缺失 / 全空三种状态下的输出
- `tools.rs` — op 名与工具名的双向映射；22 个 op 全部能转成合法 `ToolSpec`
- `agent.rs` — 历史裁剪不拆散 `tool_calls` 与 `tool` 结果；白名单外的工具名被拒；模型无 tool_calls 时走单轮

端到端为手动验证，分两步：

1. 大屏 APP 端：桌面跑本应用，另开 `python robot_sim.py --device-flow --device-no 123456 --device-secret 1234567890`，在 sim 里敲 `openscreen` / `closebrowser` / `appstatus`，观察 Chrome 起停与 ack
2. 机器人端：Android 真机跑本应用完成 Device Flow，另开 `python screen_app_sim.py --base-url http://8.163.33.11:8084 --app-key 123456 --app-secret 1234567890 --chrome "/Applications/Google Chrome.app"` 作为大屏，对机器人说「你好小财，打开演示大屏」，观察 sim 拉起 Chrome、机器人日志区出现模型回复

## 实施顺序

1. 协议 crate（HTTP + WS + catalog）
2. `platform/` 骨架：配置、状态、事件、command
3. 大屏 APP 端 + Chrome 托管 —— 此时可用 `robot_sim` 完整联调
4. 前端连接层替换与 `<LogPanel>`
5. 机器人 Device Flow + `/ws/robot` + `ContextStore`
6. `llm/` 上移与工具调用改造，`voice/` 退回纯 ASR
7. 机器人 Agent 与两轮工具循环

第 3 步做完就有一个能独立验收的交付物，这是把大屏 APP 端排在机器人前面的原因。
