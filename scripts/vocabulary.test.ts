import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customizationUrlFromAsrWs,
  formatVocabularyEnv,
  loadEnv,
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

describe("formatVocabularyEnv", () => {
  it("生成可 source 的 export 行", () => {
    const body = formatVocabularyEnv("vocab-gdufe-xxxx");
    assert.match(body, /^# 由 pnpm vocabulary sync 自动生成/m);
    assert.match(
      body,
      /^export ASR_VOCABULARY_ID="vocab-gdufe-xxxx"$/m,
    );
  });

  it("拒绝含非法字符的 id", () => {
    assert.throws(
      () => formatVocabularyEnv('vocab"; rm -rf /'),
      (err: Error) => err.message.includes("非法字符"),
    );
  });
});
