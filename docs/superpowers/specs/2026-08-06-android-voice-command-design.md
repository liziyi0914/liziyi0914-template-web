# 安卓端语音唤醒与命令识别设计

日期：2026-08-06
状态：已确认，待实现

## 背景

安卓端运行在机器人上，需要具备「常听」能力：持续采集麦克风音频送往阿里云百炼的 Fun-ASR-Realtime 实时语音识别服务，在识别文本中捕捉唤醒词「你好小财」，把紧随其后的一句话交给 qwen3.7-plus 解析成结构化命令，再回调给前端执行。

本阶段交付一个可跑通的 demo：原生侧提供 `startASR` / `stopASR` 两个能力和一个 `onCommand` 回调，前端提供一个起停按钮与一块滚动日志区用于观察 ASR 文本和命令解析结果。

## 范围

在范围内：

- 安卓端麦克风采集（16 kHz / 单声道 / PCM16）与 `RECORD_AUDIO` 运行时权限申请
- 通过 WebSocket 原始协议对接 Fun-ASR-Realtime，处理 `run-task` / `task-started` / `result-generated` / `task-finished` / `task-failed` 事件
- 唤醒词状态机，支持「同句剩余」与「下一句」两种命令来源
- 通过 OpenAI 兼容接口调用 qwen3.7-plus，输出结构化命令 JSON
- 前端绑定层与 demo UI

不在范围内：

- iOS 与桌面端实现（非 Android 平台按钮禁用）
- 配置 UI 与持久化（本阶段用编译期常量）
- WebSocket 断线自动重连、心跳保活
- 命令的实际执行（`onCommand` 只负责把命令交出去）
- 端侧唤醒词检测（唤醒词在 ASR 返回的文本上做匹配，不做声学模型）

## 关键决策

### 为什么 LLM 调用在 Rust 侧用 async-openai

原始需求是「用 OpenAI 官方 SDK」。截至 2026-08，OpenAI 官方只提供 Python、Node、Go、Ruby、Java 五个 SDK，**没有官方 Rust SDK**。由于本设计选择把 WebSocket 与 LLM 都放在 Rust 侧以便后续跨平台复用，LLM 层改用社区维护的 `async-openai`（OpenAI 文档中列为社区库）。它支持自定义 `base_url`，指向 DashScope 的 OpenAI 兼容端点即可。

被否决的替代方案：把 LLM 放 Kotlin 用官方 `com.openai:openai-java`。这会让「录音在 Kotlin、ASR 在 Rust、LLM 又回 Kotlin」的边界变得混乱。

### 为什么 PCM 走 base64

Tauri v2 中 Kotlin 向 Rust 主动推数据的唯一通道是 `tauri::ipc::Channel`，Kotlin 侧签名为 `Channel.send(data: JSObject)`，只接受 JSON。Tauri 文档亦明确说明 Android 上 `InvokeBody::Raw` 不受支持，建议以 base64 字符串传递字节。

因此 PCM 帧以 base64 编码放进 `JSObject` 传输。为摊薄序列化开销，帧长取 200 ms（6400 字节 PCM，约 8.5 KB base64），即每秒 5 次跨语言调用，而非按 100 ms 分帧的每秒 10 次。

## 架构

两条链路，各自三层，只通过 trait 通信。`session.rs` 是唯一同时知道两条链路的地方。

```
┌──────────────────── WebView (React) ─────────────────────┐
│  voice-demo.tsx                                           │
│       │ startASR({ onTranscript, onCommand, ... })        │
│  lib/voice/index.ts ── 把单条 Channel 分发成多个回调       │
└───────┬───────────────────────────────────────────────────┘
        │ invoke('start_asr', { onEvent: Channel<VoiceEvent> })
┌───────▼──────────────────── Rust ─────────────────────────┐
│  voice/commands.rs   start_asr / stop_asr                 │
│  voice/session.rs    编排器                                │
│       │                          │                         │
│  ┌────▼─── 链路一 ────┐    ┌─────▼─── 链路二 ────┐         │
│  │ audio/  录音        │    │ llm/prompt.rs 提示词 │         │
│  │ asr/    模型抽象    │    │ llm/mod.rs    抽象   │         │
│  │ asr/dashscope_ws.rs │    │ llm/openai_sdk.rs SDK│         │
│  └────┬────────────────┘    └──────────────────────┘         │
│       │ voice/wake.rs 唤醒词状态机 ──────────┘               │
└───────┼───────────────────────────────────────────────────┘
        │ run_mobile_plugin + Channel(base64 PCM)
┌───────▼──────────── Kotlin (plugins/mic) ─────────────────┐
│  MicPlugin.kt  AudioRecord 16k/mono/PCM16 + 权限申请       │
└───────────────────────────────────────────────────────────┘
```

## 文件清单

### Kotlin 插件 `src-tauri/plugins/mic/`

用 Tauri CLI 的插件模板生成一个只含 Android 实现、不带 npm 包的本地插件，再按下列结构裁剪。

- `android/src/main/java/MicPlugin.kt`
  - `@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])`
  - `@Command startRecording(invoke)`：取出 `Channel` 参数，开 `AudioRecord`（`MediaRecorder.AudioSource.VOICE_RECOGNITION`、16000 Hz、`CHANNEL_IN_MONO`、`ENCODING_PCM_16BIT`），后台线程循环读取，每满 6400 字节 base64 后 `channel.send(JSObject().put("pcm", b64))`
  - `@Command stopRecording(invoke)`：置停止标志，`stop()` + `release()`
  - `@Command checkPermissions` / `requestPermissions` 由基类提供
- `android/src/main/AndroidManifest.xml`：声明 `RECORD_AUDIO`
- `src/lib.rs` / `src/mobile.rs`：Rust 侧薄封装，暴露 `Mic::start(channel)` 与 `Mic::stop()`
- 非 Android 目标下编译为返回 `Error::UnsupportedPlatform` 的桩实现

### Rust `src-tauri/src/voice/`

- **`config.rs`** — 全部编译期常量，`option_env!` 支持构建期覆盖：`DASHSCOPE_API_KEY`、`ASR_WS_URL`（默认 `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/`，需替换 WorkspaceId）、`ASR_MODEL = "fun-asr-realtime"`、`LLM_BASE_URL`、`LLM_MODEL = "qwen3.7-plus"`、`WAKE_WORD = "你好小财"`、`ARMED_TIMEOUT_SECS = 10`、`SAMPLE_RATE = 16000`、`FRAME_BYTES = 6400`

- **`audio/mod.rs`** — 录音层抽象
  ```rust
  #[async_trait]
  pub trait AudioSource: Send + Sync {
      async fn start(&self) -> Result<mpsc::Receiver<Bytes>>;
      async fn stop(&self) -> Result<()>;
  }
  ```
- **`audio/android.rs`** — `AndroidMic`，实现 `AudioSource`；内部建 `tauri::ipc::Channel`，在回调里 base64 解码后投进 `mpsc::Sender<Bytes>`

- **`asr/mod.rs`** — ASR 模型抽象层
  ```rust
  pub enum AsrEvent { Started, Partial { text: String, index: u32 },
                      Final { text: String, index: u32 }, Finished,
                      Failed { message: String } }

  #[async_trait]
  pub trait AsrSession: Send {
      async fn send_audio(&mut self, pcm: Bytes) -> Result<()>;
      async fn finish(&mut self) -> Result<()>;
  }

  #[async_trait]
  pub trait AsrProvider: Send + Sync {
      async fn open(&self, events: mpsc::Sender<AsrEvent>) -> Result<Box<dyn AsrSession>>;
  }
  ```
- **`asr/dashscope_ws.rs`** — WS 协议层，`tokio-tungstenite`。连接时带 `Authorization: bearer <key>` 头；发 `run-task`（`task_group: "audio"`、`task: "asr"`、`function: "recognition"`、`parameters: { sample_rate: 16000, format: "pcm" }`）；`task_id` 为 32 位无短横 UUID；音频以 binary frame 发送；解析 `result-generated` 中 `payload.output.sentence` 的 `text` 与 `sentence_end` 映射到 `Partial` / `Final`；`task-failed` 映射到 `Failed`。`finish()` 发 `finish-task` 并等待 `task-finished`。

- **`llm/prompt.rs`** — 提示词组装层。`build(utterance: &str) -> ChatRequest`，system 提示说明角色是教室机器人的命令解析器、列出输出 JSON 的字段含义、要求无法识别时 `intent` 填 `"unknown"`；user 为原始语句。

- **`llm/mod.rs`** — Text 模型抽象层
  ```rust
  pub struct ChatRequest { pub system: String, pub user: String, pub json_mode: bool }

  #[async_trait]
  pub trait TextModel: Send + Sync {
      async fn complete(&self, req: ChatRequest) -> Result<String>;
  }
  ```
- **`llm/openai_sdk.rs`** — SDK 调用层，`async-openai` 的 `Client` 配 `OpenAIConfig::default().with_api_base(LLM_BASE_URL).with_api_key(...)`。`json_mode` 时设 `response_format: { type: "json_object" }`（不用 `json_schema`：DashScope 兼容模式对其支持不稳定，schema 改在 system 提示里描述）。

- **`wake.rs`** — 唤醒词状态机，无 IO，可单测
  ```rust
  pub enum WakeOutcome { None, Awakened, Command(String) }
  pub struct WakeDetector { state: State, wake_word: String, timeout: Duration }
  impl WakeDetector { pub fn on_final(&mut self, text: &str, now: Instant) -> WakeOutcome }
  ```
  归一化：去除空白与常见中英文标点。`Idle` 下查找唤醒词，命中且其后有非空剩余则返回 `Command(剩余)`，命中但无剩余则转 `Armed(now)` 并返回 `Awakened`。`Armed` 下若未超时则整句作为 `Command` 并回到 `Idle`；已超时则回到 `Idle` 并按 `Idle` 规则重新处理本句。

  `VoiceEvent::wake` 在两种命中路径下都要发出：`Awakened` 直接对应一次 `wake`；`Command` 也先发 `wake` 再发 `command`，这样前端的唤醒提示逻辑不必区分命令来自同句还是下一句。

- **`session.rs`** — 编排器。持有 `AudioSource`、`AsrProvider`、`TextModel`、`WakeDetector` 与前端 `Channel`。启动顺序：申请权限 → `provider.open()` → 等 `AsrEvent::Started` → `audio.start()`。运行时把 `AsrEvent` 翻译成 `VoiceEvent` 转发给前端，`Final` 事件喂给 `WakeDetector`，产出 `Command` 时 spawn 一个任务走链路二，避免阻塞音频泵。

- **`commands.rs`** — `#[tauri::command] async fn start_asr(app, on_event: Channel<VoiceEvent>)` 与 `stop_asr(app)`。会话句柄存于 `State<Mutex<Option<SessionHandle>>>`；重复 `start_asr` 直接返回错误而非静默重启。

### 前端

- **`src/lib/voice/types.ts`** — `VoiceEvent` 联合类型与 `VoiceCommand`
- **`src/lib/voice/index.ts`** — `startASR(handlers): Promise<void>` 与 `stopASR(): Promise<void>`。内部建 `Channel<VoiceEvent>`，按 `type` 分发到 `onState` / `onTranscript` / `onWake` / `onCommand` / `onError`
- **`src/lib/platform.ts`** — 新增 `export const IS_ANDROID = __TAURI_PLATFORM__ === 'android'`
- **`src/components/voice-demo.tsx`** — demo UI
- 挂载到 `src/components/mobile/home.tsx`

## 事件协议

```ts
type VoiceEvent =
  | { type: 'state'; state: 'starting' | 'listening' | 'stopped' }
  | { type: 'transcript'; text: string; final: boolean; index: number }
  | { type: 'wake' }
  | { type: 'command'; command: VoiceCommand; source: string; raw: string }
  | { type: 'error'; stage: 'permission' | 'audio' | 'asr' | 'llm'; message: string }

type VoiceCommand = {
  intent: string          // 如 'open_projector'，无法识别时为 'unknown'
  params: Record<string, unknown>
  reply: string           // 给用户的简短口播回复
}
```

`transcript` 的 `index` 是句子序号，前端据此原地更新同一句的 partial 结果。`command` 的 `source` 是触发它的 ASR 原句，`raw` 是模型返回的原始字符串，便于排查解析失败。

`error` 携带 `stage` 是为了让 UI 能区分「麦克风没权限」与「LLM 超时」这类处理方式完全不同的失败。

## 错误处理

| 环节 | 处理 |
|---|---|
| 权限被拒 | 推 `error{stage:'permission'}` + `state:'stopped'`，不启动会话 |
| 录音失败 | 推 `error{stage:'audio'}`，终止会话 |
| WS 连接失败 / `task-failed` / 断线 | 推 `error{stage:'asr'}`，终止会话。本阶段不自动重连 |
| LLM 请求失败或响应超时 | 推 `error{stage:'llm'}`，**会话继续**，不因单次命令解析失败关闭麦克风 |
| LLM 返回非法 JSON | 解析失败时构造 `intent: 'unknown'` 的命令，`raw` 保留原始字符串 |
| 重复 `start_asr` | 返回错误，不静默重启 |

## 测试

- `wake.rs` 单测覆盖：同句带剩余、同句无剩余转 `Armed`、`Armed` 下一句成命令、`Armed` 超时回落、含标点与空格的归一化、一句内出现多次唤醒词
- `asr/dashscope_ws.rs` 的帧编解码单测：`run-task` 序列化结果、`result-generated` 反序列化到 `AsrEvent`、`task-failed` 的错误信息提取
- `llm/openai_sdk.rs` 的响应解析单测：合法 JSON、带 markdown 代码围栏的 JSON、完全非 JSON 三种输入
- 端到端为手动验证：真机安装后按下按钮，说「你好小财，打开投影仪」，观察日志区依次出现 ASR 文本与命令

## 待办前提

实现前需要准备：DashScope API Key、WebSocket URL 中的真实 WorkspaceId、确认 qwen3.7-plus 在 OpenAI 兼容端点上的可用模型名。这些填入 `config.rs` 后才能真机联调。
