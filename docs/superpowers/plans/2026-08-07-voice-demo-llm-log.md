# 语音 Demo 时间线展示 Text 往返 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让移动端首页语音时间线在每次命令解析后展示发给 Text 的完整请求（system + user）与模型原始回复（raw）。

**Architecture:** 扩展现有 `VoiceEvent::Command`，新增 `system` 字段；`resolve_command` 在 `build_request` 后把同一份 system 写入事件；前端类型与 `CommandRow` 同步，始终渲染 system / user（`source`）/ raw。不新增事件类型、不改提示词正文。

**Tech Stack:** Tauri 2 / Rust / React 19 / TypeScript

设计文档：`docs/superpowers/specs/2026-08-07-voice-demo-llm-log-design.md`

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `src-tauri/src/voice/events.rs` | `Command` 变体加 `system`；更新序列化契约单测 |
| `src-tauri/src/voice/session.rs` | `resolve_command` 发出事件时带上 `system` |
| `src/lib/voice/types.ts` | `VoiceEvent` / `VoiceHandlers` 契约同步 |
| `src/lib/voice/index.ts` | `dispatch` 把 `system` 传给 `onCommand` |
| `src/hooks/use-voice-session.ts` | `TimelineItem` 与 `onCommand` 处理带上 `system` |
| `src/components/voice-demo.tsx` | `CommandRow` 始终展示 system / user / raw |

---

### Task 1: Rust 事件契约加 `system`

**Files:**
- Modify: `src-tauri/src/voice/events.rs`
- Test: `src-tauri/src/voice/events.rs`（模块内 `#[cfg(test)]`）

- [ ] **Step 1: 先改单测，断言序列化含 `system`**

把 `command_event_matches_the_contract` 改成：

```rust
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
            system: "你是教室机器人的命令解析器。".to_string(),
            raw: "{}".to_string(),
        }),
        json!({
            "type": "command",
            "command": { "intent": "open_projector", "params": {}, "reply": "好的" },
            "source": "打开投影仪",
            "system": "你是教室机器人的命令解析器。",
            "raw": "{}"
        })
    );
}
```

- [ ] **Step 2: 跑单测，确认因缺字段而失败**

Run:

```bash
cd src-tauri && cargo test voice::events::tests::command_event_matches_the_contract -- --nocapture
```

Expected: 编译失败或测试失败（`Command` 尚无 `system` 字段）。

- [ ] **Step 3: 给 `VoiceEvent::Command` 加上 `system`**

在 `events.rs` 的 `Command` 变体中，于 `source` 与 `raw` 之间加入字段：

```rust
Command {
    command: VoiceCommand,
    /// 触发这条命令的 ASR 原句。
    source: String,
    /// 发给模型的 system 提示全文，供前端调试展示。
    system: String,
    /// 模型返回的原始字符串，始终可用于调试展示。
    raw: String,
},
```

同步更新该文件顶部对 `raw` 的注释：去掉「解析失败时用于排查」的限定，改为「始终可用于调试展示」。

- [ ] **Step 4: 再跑单测，确认通过**

Run:

```bash
cd src-tauri && cargo test voice::events::tests::command_event_matches_the_contract -- --nocapture
```

Expected: PASS。此时 `session.rs` 会因构造 `Command` 缺 `system` 而无法通过完整 `cargo test` / `cargo check`——下一任务立刻补上。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/voice/events.rs
git commit -m "$(cat <<'EOF'
feat(voice): Command 事件携带 system 提示

EOF
)"
```

---

### Task 2: `resolve_command` 写入 `system`

**Files:**
- Modify: `src-tauri/src/voice/session.rs`（`resolve_command`）

- [ ] **Step 1: 改写 `resolve_command`，先 `build_request` 再 `complete`**

将 `resolve_command` 替换为：

```rust
/// 命令解析失败只丢这一条命令，会话继续，不能因为一次解析失败就关掉麦克风。
async fn resolve_command(llm: Arc<dyn TextModel>, events: Channel<VoiceEvent>, utterance: String) {
    let request = prompt::build_request(&utterance);
    let system = request.system.clone();
    match llm.complete(request).await {
        Ok(raw) => {
            let command = prompt::parse_command(&raw);
            let _ = events.send(VoiceEvent::Command {
                command,
                source: utterance,
                system,
                raw,
            });
        }
        Err(error) => {
            log::warn!("解析命令「{utterance}」失败：{error}");
            let _ = events.send(VoiceEvent::error(&error));
        }
    }
}
```

要点：只调用一次 `build_request`；失败路径仍只发 `error`，不发半成品 `command`。

- [ ] **Step 2: 编译与相关测试**

Run:

```bash
cd src-tauri && cargo test voice:: -- --nocapture
```

Expected: 全部 PASS（含 `events` 契约测与其它 voice 模块测）。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/voice/session.rs
git commit -m "$(cat <<'EOF'
feat(voice): 命令事件带上发给模型的 system

EOF
)"
```

---

### Task 3: 前端契约与时间线状态

**Files:**
- Modify: `src/lib/voice/types.ts`
- Modify: `src/lib/voice/index.ts`
- Modify: `src/hooks/use-voice-session.ts`

- [ ] **Step 1: 更新 `types.ts`**

`VoiceEvent` 的 command 分支改为：

```ts
| {
      type: 'command';
      command: VoiceCommand;
      /** 触发这条命令的 ASR 原句 */
      source: string;
      /** 发给模型的 system 提示全文 */
      system: string;
      /** 模型返回的原始字符串，始终可用于调试展示 */
      raw: string;
    }
```

`VoiceHandlers.onCommand` 改为：

```ts
onCommand?: (
  command: VoiceCommand,
  source: string,
  system: string,
  raw: string,
) => void;
```

- [ ] **Step 2: 更新 `index.ts` 的 dispatch**

```ts
case 'command':
  handlers.onCommand?.(
    event.command,
    event.source,
    event.system,
    event.raw,
  );
  break;
```

- [ ] **Step 3: 更新 `use-voice-session.ts`**

`TimelineItem` 的 command 分支增加 `system: string`：

```ts
| {
      id: string;
      kind: 'command';
      command: VoiceCommand;
      source: string;
      system: string;
      raw: string;
    }
```

`onCommand` 处理改为：

```ts
onCommand: (command, source, system, raw) => {
  append({
    id: `${epoch}-c${Date.now()}`,
    kind: 'command',
    command,
    source,
    system,
    raw,
  });
},
```

- [ ] **Step 4: 类型检查（此时 `voice-demo.tsx` 可能仍报错，下一任务修）**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: 仅 `voice-demo.tsx` 因未传 `system` 报错（或同类错误）；若已全部通过则说明 UI 碰巧还能编过，下一任务仍要改展示。

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/types.ts src/lib/voice/index.ts src/hooks/use-voice-session.ts
git commit -m "$(cat <<'EOF'
feat(voice): 前端契约同步 Command.system

EOF
)"
```

---

### Task 4: `CommandRow` 始终展示 system / user / raw

**Files:**
- Modify: `src/components/voice-demo.tsx`

- [ ] **Step 1: 改 `TimelineRow` 的 command 分支，传入 `system`**

```tsx
case 'command':
  return (
    <CommandRow
      command={item.command}
      source={item.source}
      system={item.system}
      raw={item.raw}
    />
  );
```

- [ ] **Step 2: 重写 `CommandRow`**

替换整个 `CommandRow` 函数为：

```tsx
function CommandRow({
  command,
  source,
  system,
  raw,
}: {
  command: VoiceCommand;
  source: string;
  system: string;
  raw: string;
}) {
  const unknown = command.intent === 'unknown';

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <Badge variant={unknown ? 'destructive' : 'default'}>
          {command.intent}
        </Badge>
        {command.reply ? (
          <span className="truncate text-sm">{command.reply}</span>
        ) : null}
      </div>

      {Object.keys(command.params).length > 0 ? (
        <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(command.params)}
        </pre>
      ) : null}

      <div className="mt-2 flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">发送至 Text</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">
          {`[system]\n${system}\n\n[user]\n${source}`}
        </pre>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">模型回复</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">
          {raw || '（空）'}
        </pre>
      </div>
    </div>
  );
}
```

要点：

- 删除「仅 `unknown` 时显示 `raw`」的条件
- `source` 字段名不变，UI 标签写成 `[user]`
- `max-h-32` + `overflow-auto` 防止撑破时间线

- [ ] **Step 3: 前端检查**

Run:

```bash
pnpm exec tsc --noEmit
pnpm check
```

Expected: `tsc` 无错；`pnpm check`（Biome）通过或仅自动格式化后干净。

- [ ] **Step 4: Commit**

```bash
git add src/components/voice-demo.tsx
git commit -m "$(cat <<'EOF'
feat(voice): 时间线展示 Text 请求与模型回复

EOF
)"
```

---

### Task 5: 验收核对

**Files:** 无新改动（除非发现遗漏）

- [ ] **Step 1: 再跑 Rust 契约测与 voice 模块测**

```bash
cd src-tauri && cargo test voice:: -- --nocapture
```

Expected: PASS。

- [ ] **Step 2: 再跑前端类型与格式**

```bash
pnpm exec tsc --noEmit && pnpm check
```

Expected: 通过。

- [ ] **Step 3: 真机快速冒烟（可选，有安卓设备时）**

```bash
pnpm android:dev
```

在首页：开始 → 「你好小财」→ 一句指令。确认命令卡片同时出现「发送至 Text」（含 system + user）与「模型回复」（raw）。人为断网或错误模型名时，应只有 error 行，无残缺 command 卡。

- [ ] **Step 4: 若有遗漏修复则单独 commit；否则无需空提交**

---

## Spec 覆盖自检

| Spec 要求 | 任务 |
|---|---|
| `Command` 加 `system` | Task 1 |
| `resolve_command` 带上同一份 system | Task 2 |
| 前端类型 / dispatch / TimelineItem | Task 3 |
| `CommandRow` 始终展示 system / user / raw | Task 4 |
| 事件序列化单测 | Task 1 |
| LLM 失败只发 error | Task 2（保持现有分支） |
| 不改 source 字段名、不拆事件、不改提示词 | 全任务遵守 |
