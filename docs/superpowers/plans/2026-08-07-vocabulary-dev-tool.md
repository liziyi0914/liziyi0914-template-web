# 开发期定制热词管理工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供开发期 `pnpm vocabulary` CLI，以本地 `vocabulary.json` 为源，通过百炼定制热词 HTTP API 完成 sync / list / query / delete / pull，并把 `vocabulary_id` 落在 gitignore 的 state 文件中。

**Architecture:** 单文件 TypeScript CLI（`tsx` 运行）。纯函数负责端点推导与本地校验（可单测）；`fetch` 调用 `POST …/audio/asr/customization`；CLI 解析子命令并读写 JSON 源/state。凭据来自已 source 的 `voice-env.sh` 环境变量。不改 ASR 运行时。

**Tech Stack:** Node 原生 `fetch` / TypeScript / `tsx` / Node 内置 `node:test`

设计文档：`docs/superpowers/specs/2026-08-07-vocabulary-dev-tool-design.md`

API 参考：https://help.aliyun.com/zh/model-studio/vocabulary-http-api

---

## 开始前必读

- 需要已配置 `scripts/voice-env.sh`（含 `DASHSCOPE_API_KEY`、`ASR_WS_URL`）。模板见 `scripts/voice-env.sh.example`。
- 真机/真实 API 冒烟放在最后一步；纯函数单测不依赖网络。
- 注释用中文；只写约束与意图，不复述代码在做什么。
- pnpm 传参：`pnpm vocabulary -- sync`（`--` 之后的参数交给脚本）。

---

## 文件结构

### 新建

| 路径 | 职责 |
|---|---|
| `scripts/vocabulary.ts` | 端点推导、校验、HTTP 客户端、CLI 入口 |
| `scripts/vocabulary.test.ts` | 纯函数单测（端点 / 校验） |
| `scripts/vocabulary.json` | 热词源（起步示例词条） |

### 修改

| 路径 | 改动 |
|---|---|
| `package.json` | 增加 `tsx` devDependency；增加 `vocabulary` / `vocabulary:test` scripts |
| `.gitignore` | 增加 `scripts/vocabulary.state.json` |

---

### Task 1: 脚手架（tsx、gitignore、源文件、pnpm script）

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/vocabulary.json`
- Create: `scripts/vocabulary.ts`（最小可执行骨架）

- [ ] **Step 1: 安装 tsx**

Run:

```bash
pnpm add -D tsx
```

Expected: `package.json` 的 `devDependencies` 出现 `tsx`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 增加 pnpm scripts 与 gitignore**

在 `package.json` 的 `scripts` 中增加（与 `android:*` 一样先 source 密钥）：

```json
"vocabulary": "source ./scripts/voice-env.sh && tsx scripts/vocabulary.ts",
"vocabulary:test": "tsx --test scripts/vocabulary.test.ts"
```

在 `.gitignore` 的 `# Secrets` 段落后增加：

```
scripts/vocabulary.state.json
```

- [ ] **Step 3: 创建起步源文件**

Create `scripts/vocabulary.json`:

```json
{
  "prefix": "gdufe",
  "target_model": "fun-asr-realtime",
  "vocabulary": [
    { "text": "你好小财", "weight": 4, "lang": "zh" },
    { "text": "广财", "weight": 4, "lang": "zh" }
  ]
}
```

- [ ] **Step 4: 创建最小 CLI 骨架**

Create `scripts/vocabulary.ts`:

```ts
#!/usr/bin/env npx tsx
/** 开发期定制热词管理：以 vocabulary.json 为源，同步到百炼 HTTP API。 */

const USAGE = `用法:
  pnpm vocabulary -- sync
  pnpm vocabulary -- list [--prefix <p>]
  pnpm vocabulary -- query [id]
  pnpm vocabulary -- delete [id]
  pnpm vocabulary -- pull`;

function main(argv: string[]): void {
  const [cmd] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  console.error(`尚未实现子命令：${cmd}`);
  process.exit(1);
}

main(process.argv.slice(2));
```

- [ ] **Step 5: 冒烟骨架**

Run:

```bash
pnpm vocabulary -- --help
```

Expected: 打印用法，exit 0。

Run:

```bash
pnpm vocabulary -- sync; echo exit:$?
```

Expected: stderr 含「尚未实现」，exit 1。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore scripts/vocabulary.json scripts/vocabulary.ts
git commit -m "$(cat <<'EOF'
chore(scripts): 脚手架定制热词 CLI

EOF
)"
```

---

### Task 2: 端点推导与本地校验（TDD）

**Files:**
- Create: `scripts/vocabulary.test.ts`
- Modify: `scripts/vocabulary.ts`

- [ ] **Step 1: 写失败测试**

Create `scripts/vocabulary.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customizationUrlFromAsrWs,
  validateSource,
  type VocabularySource,
} from "./vocabulary.ts";

describe("customizationUrlFromAsrWs", () => {
  it("把 wss inference 地址转成 https customization 地址", () => {
    const ws =
      "wss://abc123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference";
    assert.equal(
      customizationUrlFromAsrWs(ws),
      "https://abc123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/customization",
    );
  });

  it("去掉 ASR 路径尾斜杠后再推导", () => {
    const ws =
      "wss://abc123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/";
    assert.equal(
      customizationUrlFromAsrWs(ws),
      "https://abc123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/customization",
    );
  });

  it("非法 URL 抛出中文错误", () => {
    assert.throws(
      () => customizationUrlFromAsrWs("not-a-url"),
      (err: Error) => err.message.includes("ASR_WS_URL"),
    );
  });
});

describe("validateSource", () => {
  const ok: VocabularySource = {
    prefix: "gdufe",
    target_model: "fun-asr-realtime",
    vocabulary: [{ text: "你好小财", weight: 4, lang: "zh" }],
  };

  it("接受合法源文件", () => {
    assert.deepEqual(validateSource(ok), ok);
  });

  it("拒绝非法 prefix", () => {
    assert.throws(
      () => validateSource({ ...ok, prefix: "GDUFE" }),
      (err: Error) => err.message.includes("prefix"),
    );
  });

  it("拒绝空词表", () => {
    assert.throws(
      () => validateSource({ ...ok, vocabulary: [] }),
      (err: Error) => err.message.includes("空"),
    );
  });

  it("拒绝超长中文热词", () => {
    assert.throws(
      () =>
        validateSource({
          ...ok,
          vocabulary: [{ text: "一二三四五六七八九十一二三四五六", weight: 4 }],
        }),
      (err: Error) => err.message.includes("text"),
    );
  });

  it("拒绝越界 weight", () => {
    assert.throws(
      () =>
        validateSource({
          ...ok,
          vocabulary: [{ text: "广财", weight: 6 }],
        }),
      (err: Error) => err.message.includes("weight"),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
pnpm vocabulary:test
```

Expected: FAIL（无法从 `./vocabulary.ts` 导入符号，或断言失败）。

- [ ] **Step 3: 实现纯函数并导出**

把 `scripts/vocabulary.ts` 改成（保留 CLI 骨架；`main` 仍可先保持「尚未实现」）：

```ts
#!/usr/bin/env npx tsx
/** 开发期定制热词管理：以 vocabulary.json 为源，同步到百炼 HTTP API。 */

import { readFile, writeFile, unlink, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Hotword = {
  text: string;
  weight: number;
  lang?: string;
};

export type VocabularySource = {
  prefix: string;
  target_model: string;
  vocabulary: Hotword[];
};

export type VocabularyState = {
  vocabulary_id: string;
  synced_at: string;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_PATH = path.join(SCRIPT_DIR, "vocabulary.json");
export const STATE_PATH = path.join(SCRIPT_DIR, "vocabulary.state.json");

const USAGE = `用法:
  pnpm vocabulary -- sync
  pnpm vocabulary -- list [--prefix <p>]
  pnpm vocabulary -- query [id]
  pnpm vocabulary -- delete [id]
  pnpm vocabulary -- pull`;

/** 从 ASR WebSocket URL 推导定制热词 HTTP 端点。 */
export function customizationUrlFromAsrWs(asrWsUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(asrWsUrl.trim());
  } catch {
    throw new Error(
      "ASR_WS_URL 无法解析。期望形如 wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
    );
  }
  if (!parsed.host) {
    throw new Error(
      "ASR_WS_URL 缺少 host。期望形如 wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
    );
  }
  return `https://${parsed.host}/api/v1/services/audio/asr/customization`;
}

function isAsciiOnly(text: string): boolean {
  return [...text].every((ch) => ch.charCodeAt(0) <= 0x7f);
}

function assertHotwordText(text: string, index: number): void {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`vocabulary[${index}].text 必须是非空字符串`);
  }
  if (isAsciiOnly(text)) {
    for (const part of text.split(/\s+/).filter(Boolean)) {
      if (part.length > 7) {
        throw new Error(
          `vocabulary[${index}].text 纯 ASCII 时空格分段每段不得超过 7 个字符`,
        );
      }
    }
  } else if ([...text].length > 15) {
    throw new Error(
      `vocabulary[${index}].text 含非 ASCII 时不得超过 15 个字符`,
    );
  }
}

/** 校验并返回规范化后的源对象；失败抛中文 Error。 */
export function validateSource(raw: unknown): VocabularySource {
  if (!raw || typeof raw !== "object") {
    throw new Error("vocabulary.json 必须是 JSON 对象");
  }
  const obj = raw as Record<string, unknown>;
  const prefix = obj.prefix;
  if (typeof prefix !== "string" || !/^[a-z0-9]{1,10}$/.test(prefix)) {
    throw new Error("prefix 须为 1–10 位小写字母或数字");
  }
  if (typeof obj.target_model !== "string" || !obj.target_model) {
    throw new Error("target_model 必须是非空字符串");
  }
  if (!Array.isArray(obj.vocabulary)) {
    throw new Error("vocabulary 必须是数组");
  }
  if (obj.vocabulary.length === 0) {
    throw new Error("vocabulary 不能为空（拒绝 sync 清空云端词表）");
  }
  const vocabulary: Hotword[] = obj.vocabulary.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`vocabulary[${index}] 必须是对象`);
    }
    const row = item as Record<string, unknown>;
    assertHotwordText(row.text as string, index);
    const weight = row.weight;
    if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 1 || weight > 5) {
      throw new Error(`vocabulary[${index}].weight 须为 1–5 的整数`);
    }
    const hotword: Hotword = {
      text: row.text as string,
      weight,
    };
    if (row.lang !== undefined) {
      if (typeof row.lang !== "string" || !row.lang) {
        throw new Error(`vocabulary[${index}].lang 若存在须为非空字符串`);
      }
      hotword.lang = row.lang;
    }
    return hotword;
  });
  return {
    prefix,
    target_model: obj.target_model,
    vocabulary,
  };
}

function main(argv: string[]): void {
  const [cmd] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  console.error(`尚未实现子命令：${cmd}`);
  process.exit(1);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main(process.argv.slice(2));
}
```

注意：`assertHotwordText` 在 `text` 类型不对时也要能抛错——上面把 `row.text as string` 传进去前，`assertHotwordText` 已检查 `typeof text !== "string"`。

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
pnpm vocabulary:test
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/vocabulary.ts scripts/vocabulary.test.ts
git commit -m "$(cat <<'EOF'
feat(scripts): 热词 CLI 端点推导与源文件校验

EOF
)"
```

---

### Task 3: HTTP 客户端与文件 I/O

**Files:**
- Modify: `scripts/vocabulary.ts`
- Modify: `scripts/vocabulary.test.ts`（可选：为 `loadEnv` 错误信息加断言；若无纯函数可测则跳过本任务测试步骤）

- [ ] **Step 1: 增加环境读取、读写与 API 调用**

在 `scripts/vocabulary.ts` 中、`main` 之前追加：

```ts
export type DashScopeEnv = {
  apiKey: string;
  endpoint: string;
};

export function loadEnv(
  env: NodeJS.ProcessEnv = process.env,
): DashScopeEnv {
  const apiKey = env.DASHSCOPE_API_KEY?.trim() ?? "";
  const asrWs = env.ASR_WS_URL?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "缺少 DASHSCOPE_API_KEY。请先配置 scripts/voice-env.sh",
    );
  }
  if (!asrWs) {
    throw new Error("缺少 ASR_WS_URL。请先配置 scripts/voice-env.sh");
  }
  return {
    apiKey,
    endpoint: customizationUrlFromAsrWs(asrWs),
  };
}

export async function readSource(
  filePath: string = SOURCE_PATH,
): Promise<VocabularySource> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`无法读取 ${filePath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${path.basename(filePath)} 不是合法 JSON`);
  }
  return validateSource(raw);
}

export async function writeSource(
  source: VocabularySource,
  filePath: string = SOURCE_PATH,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(source, null, 2)}\n`, "utf8");
}

export async function readState(
  filePath: string = STATE_PATH,
): Promise<VocabularyState | null> {
  try {
    await access(filePath);
  } catch {
    return null;
  }
  const text = await readFile(filePath, "utf8");
  const raw = JSON.parse(text) as Partial<VocabularyState>;
  if (typeof raw.vocabulary_id !== "string" || !raw.vocabulary_id) {
    throw new Error("vocabulary.state.json 缺少 vocabulary_id");
  }
  return {
    vocabulary_id: raw.vocabulary_id,
    synced_at:
      typeof raw.synced_at === "string"
        ? raw.synced_at
        : new Date(0).toISOString(),
  };
}

export async function writeState(
  state: VocabularyState,
  filePath: string = STATE_PATH,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function clearState(
  filePath: string = STATE_PATH,
): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

type ApiOutput = Record<string, unknown>;

export async function callVocabularyApi(
  env: DashScopeEnv,
  input: Record<string, unknown>,
): Promise<{ output: ApiOutput; requestId?: string }> {
  const body = {
    model: "speech-biasing",
    input,
  };
  const res = await fetch(env.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `热词 API 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 400)}`,
    );
  }
  const requestId =
    typeof json.request_id === "string" ? json.request_id : undefined;
  const hasOutput = json.output !== undefined && typeof json.output === "object";
  // 成功：HTTP 2xx 且带 output（update/delete 时可为 {}）
  // 失败：非 2xx，或无 output 且带 message
  if (!res.ok || (!hasOutput && typeof json.message === "string")) {
    const msg =
      typeof json.message === "string"
        ? json.message
        : text.slice(0, 400);
    const rid = requestId ? ` request_id=${requestId}` : "";
    throw new Error(`热词 API 失败（HTTP ${res.status}）${rid}：${msg}`);
  }
  return {
    output: (hasOutput ? json.output : {}) as ApiOutput,
    requestId,
  };
}
```

- [ ] **Step 2: 为 loadEnv 补两条单测**

在 `scripts/vocabulary.test.ts` 追加：

```ts
import { loadEnv } from "./vocabulary.ts";

describe("loadEnv", () => {
  it("缺少 API Key 时抛错", () => {
    assert.throws(
      () =>
        loadEnv({
          DASHSCOPE_API_KEY: "",
          ASR_WS_URL:
            "wss://abc.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
        }),
      (err: Error) => err.message.includes("DASHSCOPE_API_KEY"),
    );
  });

  it("齐全时返回 endpoint", () => {
    const env = loadEnv({
      DASHSCOPE_API_KEY: "sk-test",
      ASR_WS_URL:
        "wss://abc.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
    });
    assert.equal(env.apiKey, "sk-test");
    assert.match(env.endpoint, /\/asr\/customization$/);
  });
});
```

- [ ] **Step 3: 跑测试**

Run:

```bash
pnpm vocabulary:test
```

Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add scripts/vocabulary.ts scripts/vocabulary.test.ts
git commit -m "$(cat <<'EOF'
feat(scripts): 热词 CLI 的 env / 文件 / HTTP 层

EOF
)"
```

---

### Task 4: 实现全部子命令

**Files:**
- Modify: `scripts/vocabulary.ts`

- [ ] **Step 1: 实现命令处理并替换 main**

在 `scripts/vocabulary.ts` 中用下列实现替换现有 `main`（保留上方所有 export）：

```ts
function parseListPrefix(argv: string[], fallback: string): string {
  const idx = argv.indexOf("--prefix");
  if (idx === -1) return fallback;
  const value = argv[idx + 1];
  if (!value || value.startsWith("-")) {
    throw new Error("list --prefix 需要一个值");
  }
  return value;
}

async function resolveId(
  explicit: string | undefined,
  state: VocabularyState | null,
): Promise<string> {
  if (explicit) return explicit;
  if (state?.vocabulary_id) return state.vocabulary_id;
  throw new Error("缺少 vocabulary_id：请传入 id，或先执行 sync");
}

async function cmdSync(): Promise<void> {
  const env = loadEnv();
  const source = await readSource();
  const state = await readState();
  if (!state) {
    const { output } = await callVocabularyApi(env, {
      action: "create_vocabulary",
      target_model: source.target_model,
      prefix: source.prefix,
      vocabulary: source.vocabulary,
    });
    const vocabularyId = output.vocabulary_id;
    if (typeof vocabularyId !== "string" || !vocabularyId) {
      throw new Error("create_vocabulary 响应缺少 vocabulary_id");
    }
    await writeState({
      vocabulary_id: vocabularyId,
      synced_at: new Date().toISOString(),
    });
    console.log(`已创建热词列表：${vocabularyId}`);
    return;
  }
  try {
    await callVocabularyApi(env, {
      action: "update_vocabulary",
      vocabulary_id: state.vocabulary_id,
      vocabulary: source.vocabulary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message}\n若云端词表已不存在：删除 scripts/vocabulary.state.json 后重新 sync，或先手动核对 id。不会自动 recreate。`,
    );
  }
  await writeState({
    vocabulary_id: state.vocabulary_id,
    synced_at: new Date().toISOString(),
  });
  console.log(`已更新热词列表：${state.vocabulary_id}`);
}

async function cmdList(argv: string[]): Promise<void> {
  const env = loadEnv();
  const source = await readSource();
  const prefix = parseListPrefix(argv, source.prefix);
  const { output } = await callVocabularyApi(env, {
    action: "list_vocabulary",
    prefix,
    page_index: 0,
    page_size: 50,
  });
  console.log(JSON.stringify(output.vocabulary_list ?? output, null, 2));
}

async function cmdQuery(argv: string[]): Promise<void> {
  const env = loadEnv();
  const state = await readState();
  const id = await resolveId(argv[0], state);
  const { output } = await callVocabularyApi(env, {
    action: "query_vocabulary",
    vocabulary_id: id,
  });
  console.log(JSON.stringify(output, null, 2));
}

async function cmdDelete(argv: string[]): Promise<void> {
  const env = loadEnv();
  const state = await readState();
  const id = await resolveId(argv[0], state);
  await callVocabularyApi(env, {
    action: "delete_vocabulary",
    vocabulary_id: id,
  });
  if (state?.vocabulary_id === id) {
    await clearState();
  }
  console.log(`已删除热词列表：${id}`);
}

async function cmdPull(): Promise<void> {
  const env = loadEnv();
  const state = await readState();
  const id = await resolveId(undefined, state);
  const local = await readSource();
  const { output } = await callVocabularyApi(env, {
    action: "query_vocabulary",
    vocabulary_id: id,
  });
  const targetModel = output.target_model;
  const vocabulary = output.vocabulary;
  if (typeof targetModel !== "string" || !targetModel) {
    throw new Error("query 响应缺少 target_model");
  }
  if (!Array.isArray(vocabulary)) {
    throw new Error("query 响应缺少 vocabulary 数组");
  }
  const next: VocabularySource = {
    prefix: local.prefix,
    target_model: targetModel,
    vocabulary: vocabulary as Hotword[],
  };
  // pull 前打印摘要；覆盖写回前再校验
  const validated = validateSource(next);
  console.log(
    `将用云端词表覆盖本地（保留 prefix=${validated.prefix}），共 ${validated.vocabulary.length} 条：`,
  );
  for (const w of validated.vocabulary) {
    console.log(`  - ${w.text} (weight=${w.weight}${w.lang ? `, lang=${w.lang}` : ""})`);
  }
  await writeSource(validated);
  console.log(`已写入 ${SOURCE_PATH}`);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  try {
    switch (cmd) {
      case "sync":
        await cmdSync();
        break;
      case "list":
        await cmdList(rest);
        break;
      case "query":
        await cmdQuery(rest);
        break;
      case "delete":
        await cmdDelete(rest);
        break;
      case "pull":
        await cmdPull();
        break;
      default:
        console.error(`未知子命令：${cmd}\n\n${USAGE}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void main(process.argv.slice(2));
}
```

- [ ] **Step 2: 单测仍通过**

Run:

```bash
pnpm vocabulary:test
```

Expected: 全部 PASS。

- [ ] **Step 3: 本地无密钥时错误可读**

若当前 shell 未导出密钥，可临时：

```bash
env -u DASHSCOPE_API_KEY -u ASR_WS_URL pnpm exec tsx scripts/vocabulary.ts sync; echo exit:$?
```

Expected: stderr 提示缺少 `DASHSCOPE_API_KEY` 或配置 `voice-env.sh`，exit 1。  
（`pnpm vocabulary -- sync` 会先 source `voice-env.sh`，本机有密钥时会走到真实 API；上面用 `tsx` 直跑是为了测缺省环境。）

- [ ] **Step 4: Commit**

```bash
git add scripts/vocabulary.ts
git commit -m "$(cat <<'EOF'
feat(scripts): 实现热词 sync/list/query/delete/pull

EOF
)"
```

---

### Task 5: 真实 API 冒烟与收尾

**Files:**
- 无新文件（必要时微调错误判定以匹配实测响应）

- [ ] **Step 1: sync 创建或更新**

确保 `scripts/voice-env.sh` 已配置。Run:

```bash
pnpm vocabulary -- sync
```

Expected:
- 首次：打印 `已创建热词列表：vocab-gdufe-…`，生成被 gitignore 的 `scripts/vocabulary.state.json`
- 再次：打印 `已更新热词列表：…`

- [ ] **Step 2: query / list / pull**

```bash
pnpm vocabulary -- query
pnpm vocabulary -- list
pnpm vocabulary -- pull
```

Expected:
- `query` 打出含 `vocabulary` 的 JSON
- `list` 打出含当前 prefix 的列表
- `pull` 打印摘要并写回 `vocabulary.json`（内容与云端一致，`prefix` 仍为本地值）

- [ ] **Step 3: 确认 state 不被 git 跟踪**

```bash
git status --short scripts/vocabulary.state.json
```

Expected: 无输出，或显示为 ignored（`git check-ignore -v scripts/vocabulary.state.json` 有命中）。

- [ ] **Step 4:（可选清理）删除刚创建的测试词表**

若冒烟用的是正式空间、不想留下测试表：

```bash
pnpm vocabulary -- delete
```

Expected: 打印已删除；`vocabulary.state.json` 消失。

- [ ] **Step 5: 若 API 错误形态与实现不符，收紧 `callVocabularyApi` 后提交**

仅在 Step 1–2 因响应解析失败时修改；改完再跑 `pnpm vocabulary:test` 与一次 `sync`。

```bash
git add scripts/vocabulary.ts
git commit -m "$(cat <<'EOF'
fix(scripts): 对齐百炼热词 API 错误响应形态

EOF
)"
```

若无需修改，本步跳过，不提交空 commit。

---

## Spec 覆盖自检

| Spec 要求 | 对应任务 |
|---|---|
| TS + tsx CLI / `pnpm vocabulary` | Task 1 |
| `vocabulary.json` 入库 + 起步词条 | Task 1 |
| `vocabulary.state.json` gitignore | Task 1 / Task 5 |
| 从 `ASR_WS_URL` 推导端点 | Task 2 |
| 本地校验 prefix / weight / text / 空词表 | Task 2 |
| `sync` create/update | Task 4 |
| `list` / `query` / `delete` / `pull` | Task 4 |
| 缺密钥中文错误 | Task 3 / Task 4 |
| 云端 id 不存在不静默 recreate | Task 4 `cmdSync` |
| `pull` 保留本地 prefix | Task 4 `cmdPull` |
| 不改 Rust ASR / 运行时 | 全程无相关文件改动 |
| 真实 API 可跑通 | Task 5 |

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-08-07-vocabulary-dev-tool.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 开一个新子代理，Task 间复审，迭代快

**2. Inline Execution** — 本会话内按 executing-plans 批量执行，设检查点

Which approach?
