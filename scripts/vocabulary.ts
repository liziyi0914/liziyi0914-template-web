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
export const VOCAB_ENV_PATH = path.join(SCRIPT_DIR, "vocabulary-env.sh");

/** 生成 vocabulary-env.sh 正文（含末尾换行）。 */
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
    if (
      typeof weight !== "number" ||
      !Number.isInteger(weight) ||
      weight < 1 ||
      weight > 5
    ) {
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
  let raw: Partial<VocabularyState>;
  try {
    raw = JSON.parse(text) as Partial<VocabularyState>;
  } catch {
    throw new Error("vocabulary.state.json 不是合法 JSON");
  }
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
  const hasOutput =
    json.output !== null &&
    json.output !== undefined &&
    typeof json.output === "object";
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
    await writeVocabularyEnv(vocabularyId);
    console.log(`已创建热词列表：${vocabularyId}`);
    console.log(`已写入 ${VOCAB_ENV_PATH}（重新编译后 ASR 才会带上热词）`);
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
  await writeVocabularyEnv(state.vocabulary_id);
  console.log(`已更新热词列表：${state.vocabulary_id}`);
  console.log(`已写入 ${VOCAB_ENV_PATH}（重新编译后 ASR 才会带上热词）`);
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
    await clearVocabularyEnv();
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
