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
