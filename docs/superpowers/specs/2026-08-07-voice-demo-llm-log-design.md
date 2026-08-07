# 语音 Demo 时间线展示 Text 往返设计

日期：2026-08-07
状态：已确认，待实现

## 背景

移动端首页的 `VoiceDemo` 用时间线调试语音命令链路。当前 `command` 事件虽带有 ASR 原句（`source`）与模型原始输出（`raw`），但 UI 仅在 `intent === 'unknown'` 时展示 `raw`，且发给 Text 的 system 提示从未上到前端，排查「模型到底收到了什么 / 回了什么」时不够用。

## 目标

在命令解析成功并到达前端后，时间线能清楚看到：

1. 发给 Text 的完整请求：`system` + `user`
2. 模型原始回复：`raw`（无论解析成败都展示）

## 范围

在范围内：

- `VoiceEvent::Command` 新增字段 `system: String`
- `session.rs` 的 `resolve_command`：`build_request` 一次，把同一份 `system` 写入事件
- 前端类型、`onCommand` 签名、`TimelineItem`、`CommandRow` 同步
- `CommandRow` 始终展示 system / user（`source`）/ raw
- 更新 `events.rs` 序列化契约单测

不在范围内：

- 新增 `llm_request` / `llm_response` 事件或请求发出前的中间态
- 把 `source` 重命名为 `user`（保持现有字段名，避免无关破坏）
- 折叠交互、模型名等元信息
- 修改 system 提示词正文或解析逻辑
- LLM 失败路径伪造半成品 `command` 事件

## 关键决策

### 为什么扩展 Command 而不是拆事件

调试所需的 system / user / raw 都在 LLM 返回后才齐全。一条 `command` 事件即可承载，无需拆成请求/响应两条时间线，也避免「请求已发出但尚未返回」的额外 UI 状态。

### 为什么保留 `source` 字段名

`source` 已是前端契约与单测的一部分，语义就是「触发这条命令的 ASR 原句」，与 Chat 的 user 消息一一对应。UI 文案可标成「user」，字段名不改，减少无关 diff。

### 为什么始终展示 raw

`raw` 是排查 JSON 解析、字段漂移、模型跑飞的第一手材料；仅在 unknown 时展示会漏掉「解析成功但意图不对」的情况。

## 数据流

```text
ASR Final → WakeDetector::Command(utterance)
  → build_request(utterance)  // system + user
  → llm.complete(request)
  → parse_command(raw)
  → VoiceEvent::Command { command, source: utterance, system, raw }
  → CommandRow 展示解析结果 + system + user + raw
```

LLM 失败：继续只发 `error`（现有行为），不发 `command`。

## 事件契约

Rust（`src-tauri/src/voice/events.rs`）与 TS（`src/lib/voice/types.ts`）同步：

```ts
{
  type: 'command';
  command: VoiceCommand,
  source: string,  // user 消息 = ASR 原句
  system: string,  // 发给模型的 system 提示全文
  raw: string,     // 模型原始回复，始终可用于调试展示
}
```

`VoiceHandlers.onCommand` 签名增加 `system` 参数，顺序建议：`(command, source, system, raw)`。

## UI

`CommandRow`（`src/components/voice-demo.tsx`）：

1. 头部：intent Badge；有则显示 `reply`、`params`
2. 「发送至 Text」区块：标签 + `pre` 展示 `system` 与 `user`（`source`）
3. 「模型回复」区块：始终 `pre` 展示 `raw`
4. 长文本可滚动，不撑破时间线容器

桌面端若共用 `VoiceDemo`，行为一致。

## 测试

- 更新 `command_event_matches_the_contract`：断言序列化结果含 `system`
- 前端无单独单测要求；类型收紧由 TypeScript 编译兜住

## 验收

1. 唤醒后说出指令，时间线命令卡片可见完整 system 提示与 user 原句
2. 同一卡片始终可见模型 `raw`（成功解析与 unknown 皆如此）
3. LLM 超时/网络错误仍只出现 error 行，无残缺 command 卡
4. Rust 事件契约单测通过
