# ASR 接入预编译热词 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在存在 `ASR_VOCABULARY_ID` 时，ASR `run-task` 自动带上 `parameters.vocabulary_id`；`pnpm vocabulary sync` 把该 id 写到 gitignore 的 `vocabulary-env.sh`，供编译期注入。

**Architecture:** sync/delete 维护旁路 env 文件；`android-env.sh` 在 `voice-env.sh` 之后按需 source；Rust 用 `option_env!` 读入；`run_task_frame` 仅在 id 非空时写入 JSON 字段。

**Tech Stack:** TypeScript CLI / bash source 链 / Rust `option_env!` / serde_json

设计文档：`docs/superpowers/specs/2026-08-07-asr-vocabulary-id-design.md`

API：https://help.aliyun.com/zh/model-studio/fun-asr-client-events

---

## 文件结构

| 路径 | 改动 |
|---|---|
| `src-tauri/src/voice/asr/protocol.rs` | `run_task_frame` 增加可选 `vocabulary_id` |
| `src-tauri/src/voice/config.rs` | `ASR_VOCABULARY_ID` |
| `src-tauri/src/voice/asr/dashscope_ws.rs` | 传入 config id |
| `scripts/vocabulary.ts` | 写/删 `vocabulary-env.sh` |
| `scripts/vocabulary.test.ts` | env 文件内容单测 |
| `.gitignore` | 忽略 `vocabulary-env.sh` |
| `scripts/android-env.sh` | source vocabulary-env |
| `scripts/voice-env.sh.example` | 注释说明 |
| `package.json` | vocabulary 脚本 source 链 |

---

### Task 1: Rust — run-task 可选 vocabulary_id（TDD）

**Files:**
- Modify: `src-tauri/src/voice/asr/protocol.rs`
- Modify: `src-tauri/src/voice/config.rs`
- Modify: `src-tauri/src/voice/asr/dashscope_ws.rs`

- [ ] **Step 1: 写失败测试**

在 `protocol.rs` 的 `tests` 模块中，把现有 `run_task_frame_matches_protocol` 改为三参数签名（`vocabulary_id: Option<&str>`），并新增带 id 的用例：

把原测试改为调用 `run_task_frame("abc123", "fun-asr-realtime", 16000, None)`，期望 JSON **不含** `vocabulary_id`。

追加：

```rust
    #[test]
    fn run_task_frame_includes_vocabulary_id_when_present() {
        let frame = parsed(&run_task_frame(
            "abc123",
            "fun-asr-realtime",
            16000,
            Some("vocab-gdufe-xxxx"),
        ));
        assert_eq!(
            frame["payload"]["parameters"]["vocabulary_id"],
            json!("vocab-gdufe-xxxx")
        );
        assert_eq!(frame["payload"]["parameters"]["sample_rate"], json!(16000));
        assert_eq!(frame["payload"]["parameters"]["format"], json!("pcm"));
    }

    #[test]
    fn run_task_frame_omits_vocabulary_id_for_empty_string() {
        let frame = parsed(&run_task_frame("abc123", "fun-asr-realtime", 16000, Some("")));
        assert!(frame["payload"]["parameters"].get("vocabulary_id").is_none());
    }
```

同步改掉模块内其它对 `run_task_frame(...)` 的调用（目前只有 `run_task_frame_matches_protocol`）。

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
cd src-tauri && cargo test --lib voice::asr::protocol::tests::run_task_frame
```

Expected: 编译失败（函数签名仍是三参数）或断言失败。

- [ ] **Step 3: 实现 protocol + config + dashscope_ws**

将 `run_task_frame` 改为：

```rust
pub fn run_task_frame(
    task_id: &str,
    model: &str,
    sample_rate: u32,
    vocabulary_id: Option<&str>,
) -> String {
    let mut parameters = json!({
        "sample_rate": sample_rate,
        "format": "pcm"
    });
    if let Some(id) = vocabulary_id {
        let id = id.trim();
        if !id.is_empty() {
            parameters["vocabulary_id"] = json!(id);
        }
    }
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
            "parameters": parameters,
            "input": {}
        }
    })
    .to_string()
}
```

在 `config.rs` 增加（放在 `ASR_MODEL` 附近）：

```rust
/// 预编译热词列表 ID。空串表示未配置，run-task 不传 vocabulary_id。
/// 由 `pnpm vocabulary sync` 写入 scripts/vocabulary-env.sh，经 android-env 注入。
pub const ASR_VOCABULARY_ID: &str = env_or!("ASR_VOCABULARY_ID", "");
```

在 `dashscope_ws.rs` 的 `DashScopeWs` 增加字段（或直接在 `open` 里读 config）：

```rust
pub struct DashScopeWs {
    url: String,
    api_key: String,
    model: String,
    sample_rate: u32,
    vocabulary_id: String,
}
```

`from_config` 里：

```rust
            vocabulary_id: config::ASR_VOCABULARY_ID.to_string(),
```

`open` 里发送 run-task：

```rust
        let vocab = (!self.vocabulary_id.trim().is_empty()).then_some(self.vocabulary_id.as_str());
        let run_task = protocol::run_task_frame(&task_id, &self.model, self.sample_rate, vocab);
```

若仓库里已有未提交的 `dashscope_ws.rs` / `protocol.rs` 改动，在其上合并，不要回滚无关修复。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd src-tauri && cargo test --lib voice::asr::protocol
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/voice/asr/protocol.rs src-tauri/src/voice/config.rs src-tauri/src/voice/asr/dashscope_ws.rs
git commit -m "$(cat <<'EOF'
feat(voice): run-task 可选携带 vocabulary_id

EOF
)"
```

只提交上述三文件；勿把无关的 Cargo.lock / tls 等脏改动一并塞进本 commit，除非编译所必需。

---

### Task 2: CLI 写/删 vocabulary-env.sh（TDD）

**Files:**
- Modify: `scripts/vocabulary.ts`
- Modify: `scripts/vocabulary.test.ts`

- [ ] **Step 1: 写失败测试**

在 `vocabulary.test.ts` 追加（并更新 import）：

```ts
import {
  // ...existing
  formatVocabularyEnv,
  VOCAB_ENV_PATH,
} from "./vocabulary.ts";

describe("formatVocabularyEnv", () => {
  it("生成可 source 的 export 行", () => {
    const body = formatVocabularyEnv("vocab-gdufe-xxxx");
    assert.match(body, /^# 由 pnpm vocabulary sync 自动生成/m);
    assert.match(
      body,
      /^export ASR_VOCABULARY_ID="vocab-gdufe-xxxx"$/m,
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node node_modules/tsx/dist/cli.mjs --test scripts/vocabulary.test.ts
```

Expected: FAIL（`formatVocabularyEnv` 未导出）。若 `pnpm vocabulary:test` 因 esbuild build 策略失败，用上面的直连命令。

- [ ] **Step 3: 实现写/删并挂到 sync/delete**

在 `vocabulary.ts` 中（靠近 `STATE_PATH`）：

```ts
export const VOCAB_ENV_PATH = path.join(SCRIPT_DIR, "vocabulary-env.sh");

/** 生成 vocabulary-env.sh 正文（含末尾换行）。 */
export function formatVocabularyEnv(vocabularyId: string): string {
  return [
    "# 由 pnpm vocabulary sync 自动生成，请勿手改。",
    `export ASR_VOCABULARY_ID="${vocabularyId}"`,
    "",
  ].join("\n");
}

export async function writeVocabularyEnv(
  vocabularyId: string,
  filePath: string = VOCAB_ENV_PATH,
): Promise<void> {
  await writeFile(filePath, formatVocabularyEnv(vocabularyId), "utf8");
}

export async function clearVocabularyEnv(
  filePath: string = VOCAB_ENV_PATH,
): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}
```

注意：id 来自服务端，格式为 `vocab-...` 字母数字与连字符；写入双引号内即可。不要对 id 做 shell 转义以外的复杂处理；若 id 含 `"` 或 `$` 则拒绝：

```ts
export function formatVocabularyEnv(vocabularyId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(vocabularyId)) {
    throw new Error("vocabulary_id 含非法字符，拒绝写入 vocabulary-env.sh");
  }
  return [
    "# 由 pnpm vocabulary sync 自动生成，请勿手改。",
    `export ASR_VOCABULARY_ID="${vocabularyId}"`,
    "",
  ].join("\n");
}
```

在测试中可顺带加一条非法字符用例（可选）。

改 `cmdSync`：create 与 update 两条成功路径在 `writeState` 之后都调用 `await writeVocabularyEnv(id)`，并在日志中提示需重编：

Create 路径末尾（`return` 前）：

```ts
    await writeVocabularyEnv(vocabularyId);
    console.log(`已创建热词列表：${vocabularyId}`);
    console.log(`已写入 ${VOCAB_ENV_PATH}（重新编译后 ASR 才会带上热词）`);
    return;
```

Update 路径末尾：

```ts
  await writeVocabularyEnv(state.vocabulary_id);
  console.log(`已更新热词列表：${state.vocabulary_id}`);
  console.log(`已写入 ${VOCAB_ENV_PATH}（重新编译后 ASR 才会带上热词）`);
```

改 `cmdDelete`：在 `clearState()` 同分支内调用 `await clearVocabularyEnv()`：

```ts
  if (state?.vocabulary_id === id) {
    await clearState();
    await clearVocabularyEnv();
  }
```

- [ ] **Step 4: 跑测试**

```bash
node node_modules/tsx/dist/cli.mjs --test scripts/vocabulary.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/vocabulary.ts scripts/vocabulary.test.ts
git commit -m "$(cat <<'EOF'
feat(scripts): sync/delete 维护 ASR_VOCABULARY_ID 旁路 env

EOF
)"
```

---

### Task 3: source 链、gitignore、example，并回填现有 state

**Files:**
- Modify: `.gitignore`
- Modify: `scripts/android-env.sh`
- Modify: `scripts/voice-env.sh.example`
- Modify: `package.json`
- 可能生成: `scripts/vocabulary-env.sh`（不提交）

- [ ] **Step 1: gitignore**

在 `# Secrets` 段增加：

```
scripts/vocabulary-env.sh
```

- [ ] **Step 2: android-env.sh**

在 source `voice-env.sh` 的块之后追加：

```bash
vocab_env="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)/vocabulary-env.sh"
if [ -f "$vocab_env" ]; then
  # shellcheck source=/dev/null
  source "$vocab_env"
fi
unset vocab_env
```

注意：上面又算了一次 dirname。为与现有风格一致、避免重复探测，改用已有 `voice_env` 同目录更干净——在现有块后：

```bash
if [ -f "$voice_env" ]; then
  # shellcheck source=/dev/null
  source "$voice_env"
fi
vocab_env="$(dirname -- "$voice_env")/vocabulary-env.sh"
if [ -f "$vocab_env" ]; then
  # shellcheck source=/dev/null
  source "$vocab_env"
fi
unset voice_env vocab_env
```

（把原来的 `unset _script` 保留在计算 `voice_env` 之后；按文件现状合并，确保 `voice_env` 在 unset 前仍可用于 dirname。）

推荐最终形态（替换现有 voice_env 段落）：

```bash
_script="${BASH_SOURCE[0]:-$0}"
_scripts_dir="$(CDPATH= cd -- "$(dirname -- "$_script")" && pwd)"
unset _script
voice_env="$_scripts_dir/voice-env.sh"
if [ -f "$voice_env" ]; then
  # shellcheck source=/dev/null
  source "$voice_env"
fi
vocab_env="$_scripts_dir/vocabulary-env.sh"
if [ -f "$vocab_env" ]; then
  # shellcheck source=/dev/null
  source "$vocab_env"
fi
unset _scripts_dir voice_env vocab_env
```

- [ ] **Step 3: package.json vocabulary 脚本**

改为：

```json
"vocabulary": "source ./scripts/voice-env.sh && { [ -f ./scripts/vocabulary-env.sh ] && source ./scripts/vocabulary-env.sh; true; } && tsx scripts/vocabulary.ts",
```

（`ASR_VOCABULARY_ID` 对 CLI 管理命令不是必需；source 是为了与编译链一致、便于本地 echo 检查。）

更简单可读的写法若 bash 挑剔，可用：

```json
"vocabulary": "bash -c 'source ./scripts/voice-env.sh; [ -f ./scripts/vocabulary-env.sh ] && source ./scripts/vocabulary-env.sh; exec tsx scripts/vocabulary.ts \"$@\"' --",
```

采用 **bash -c** 版本，保证 `pnpm vocabulary -- sync` 参数传递正确。

- [ ] **Step 4: voice-env.sh.example 注释**

在文件末尾追加：

```bash
# 预编译热词 ID 不要写在本文件。
# 执行 pnpm vocabulary -- sync 后会生成 scripts/vocabulary-env.sh
# （已被 gitignore），android-env.sh 会自动 source。改 ID 后需重新编译。
```

- [ ] **Step 5: 若已有 vocabulary.state.json，回填 env**

```bash
bash -lc 'source ./scripts/voice-env.sh; node node_modules/tsx/dist/cli.mjs scripts/vocabulary.ts sync'
git check-ignore -v scripts/vocabulary-env.sh
grep ASR_VOCABULARY_ID scripts/vocabulary-env.sh
```

Expected: sync 成功（update）；`check-ignore` 命中；env 文件含当前 id。  
**不要** `git add` `vocabulary-env.sh`。

- [ ] **Step 6: Commit（仅跟踪文件）**

```bash
git add .gitignore scripts/android-env.sh scripts/voice-env.sh.example package.json
git commit -m "$(cat <<'EOF'
chore(scripts): source 链注入 ASR_VOCABULARY_ID

EOF
)"
```

---

## Spec 覆盖自检

| Spec 要求 | 任务 |
|---|---|
| sync 写 vocabulary-env.sh | Task 2 |
| delete 清当前 id 时删文件 | Task 2 |
| gitignore | Task 3 |
| android-env / vocabulary script source | Task 3 |
| example 注释 | Task 3 |
| config option_env | Task 1 |
| run_task 可选 vocabulary_id | Task 1 |
| 空串省略字段 | Task 1 单测 |
| 不改前端 | 全程 |

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-08-07-asr-vocabulary-id.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每 Task 新子代理 + 两阶段审查  
**2. Inline Execution** — 本会话按计划连续执行  

Which approach?
