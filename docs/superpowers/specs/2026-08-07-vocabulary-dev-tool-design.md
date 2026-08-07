# 开发期定制热词管理工具设计

日期：2026-08-07
状态：已确认，待实现

## 背景

安卓语音链路使用阿里云百炼 Fun-ASR-Realtime。为提升课堂场景专有名词（唤醒词、校名缩写等）的识别准确率，需要对接百炼「定制热词」能力。

官方能力见：

- [定制热词总览](https://help.aliyun.com/zh/model-studio/custom-hot-words/)
- [定制热词 HTTP API](https://help.aliyun.com/zh/model-studio/vocabulary-http-api)

热词列表在云端以 `vocabulary_id` 标识；管理接口统一 `POST` 到业务空间专属域名下的 customization 路径，通过 `input.action` 区分 create / list / query / update / delete。

本阶段只交付**开发期 CLI**，用本地 JSON 作为词表源，同步到云端并维护本地 state。不改 ASR 运行时、不把热词注入生产包。

## 范围

在范围内：

- TypeScript CLI（`tsx` 运行），经 `pnpm vocabulary …` 调用
- 本地源文件 `scripts/vocabulary.json`（入库）与状态文件 `scripts/vocabulary.state.json`（gitignore）
- 子命令：`sync` / `list` / `query` / `delete` / `pull`
- 复用 `scripts/voice-env.sh` 中的 `DASHSCOPE_API_KEY` 与 `ASR_WS_URL`
- 从 `ASR_WS_URL` 推导 HTTP 热词端点
- 本地校验 prefix / weight / text 长度等 API 约束

不在范围内：

- 把 `vocabulary_id` 写入 `voice-env.sh` 或编译期配置
- 修改 Rust ASR / `run-task` 以携带热词
- CI 自动 sync、打包进 app
- Python / Java 官方 SDK
- 交互式确认（`pull` 覆盖本地时只打印摘要）

## 关键决策

### 为什么用 TypeScript + tsx，而不是 Bash/curl 或 Python SDK

项目日常工作流是 pnpm；热词管理需要解析 JSON、写 state、做校验，TS 比 Bash 更合适。官方 Python SDK 与文档示例最接近，但会为本仓库引入独立的 Python 依赖与环境。`tsx` 仅作开发依赖，用原生 `fetch` 调 HTTP API，与 [HTTP API 参考](https://help.aliyun.com/zh/model-studio/vocabulary-http-api) 一一对应。

被否决的替代：

- 单文件 `.mjs`：零依赖，但缺少类型检查；本工具仍会演进字段与校验，TS 更划算
- 多文件小模块 + 测试：对「仅开发期 CRUD」过重

### 为什么用本地 JSON 源 + state，而不是每次手写 curl

词表会随课堂用语迭代；以入库的 `vocabulary.json` 为源，可 review、可 diff。`vocabulary_id` 由服务端生成，落在 gitignore 的 state 里，下次 `sync` 自动走 update，避免重复创建多份词表。

### 为什么本阶段不接入 ASR 运行时

热词管理与识别会话是两条链路。先有可重复的词表运维工具，再在后续任务把 `vocabulary_id` 接到 `run-task`（或等价参数）。本工具写出的 state 已足够支撑后续接线。

## 架构

```
scripts/vocabulary.json          ← 源（git）
        │
        ▼
scripts/vocabulary.ts            ← CLI（tsx）
        │  Authorization: Bearer $DASHSCOPE_API_KEY
        │  POST https://{host}/api/v1/services/audio/asr/customization
        ▼
阿里云百炼定制热词 API
        │
        ▼
scripts/vocabulary.state.json     ← vocabulary_id（gitignore）
```

端点推导：`ASR_WS_URL` 形如  
`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`  
→ HTTP  
`https://{同 host}/api/v1/services/audio/asr/customization`

请求体固定 `model: "speech-biasing"`，`input.action` 为各操作名（`create_vocabulary` 等）。

## 文件清单

| 路径 | 作用 | 入库 |
|------|------|------|
| `scripts/vocabulary.ts` | CLI 实现 | 是 |
| `scripts/vocabulary.json` | 热词源（含起步示例词条，可直接改） | 是 |
| `scripts/vocabulary.state.json` | 云端 id 与同步时间 | 否 |
| `package.json` | `vocabulary` script；devDependency `tsx` | 是 |
| `.gitignore` | 增加 `scripts/vocabulary.state.json` | 是 |

`package.json` 脚本形态（与 android 脚本一致，先 source 密钥）：

```bash
"vocabulary": "source ./scripts/voice-env.sh && tsx scripts/vocabulary.ts"
```

用法：`pnpm vocabulary sync` 等（参数原样传给脚本）。

## 数据格式

### `vocabulary.json`

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

- `prefix`：必填；仅小写字母与数字；长度 1–10
- `target_model`：必填；须与后续 ASR 所用模型一致。默认写当前项目的 `fun-asr-realtime`；若服务端要求短名（如 `fun-asr`），只改源文件，工具不硬编码模型名
- `vocabulary[]`：
  - `text`：必填；非空；含非 ASCII 时总长 ≤15；纯 ASCII 时按空格分段，每段 ≤7
  - `weight`：必填；整数 1–5（常用 4）
  - `lang`：可选；Fun-ASR 支持 `zh` / `en` / `ja`

### `vocabulary.state.json`

```json
{
  "vocabulary_id": "vocab-gdufe-xxxx",
  "synced_at": "2026-08-07T02:00:00.000Z"
}
```

## 命令语义

| 命令 | 行为 |
|------|------|
| `pnpm vocabulary sync` | 无 state → `create_vocabulary` 并写 state；有 state → `update_vocabulary`（全量替换词表） |
| `pnpm vocabulary list [--prefix <p>]` | `list_vocabulary`；默认用源文件 `prefix` |
| `pnpm vocabulary query [id]` | `query_vocabulary`；省略 id 则用 state |
| `pnpm vocabulary delete [id]` | `delete_vocabulary`；若删除的是当前 state 中的 id，则删除 state 文件 |
| `pnpm vocabulary pull` | 用 state id 拉取云端词表；用响应中的 `target_model` 与 `vocabulary` 覆盖本地对应字段，**保留**本地已有 `prefix`（query 响应不含 prefix） |

## 错误处理

- 缺 `DASHSCOPE_API_KEY` 或 `ASR_WS_URL`：退出并提示配置 `scripts/voice-env.sh`
- 无法从 `ASR_WS_URL` 解析 host：提示期望形态
- 源文件 JSON 不合法或校验失败：非零退出，中文说明字段问题
- `vocabulary` 为空数组：拒绝 `sync`（避免清空云端词表）
- HTTP 非 2xx 或业务错误：打印 `request_id`（若有）与消息摘要，exit 1
- `sync` 时 state 中的 id 在云端已不存在：明确提示手动删 state 或 `delete` 后再 `sync`；**不**静默 recreate
- `query` / `delete` / `pull` 无 id 且无 state：提示补 id 或先 `sync`

## 验收标准

1. 配置好 `voice-env.sh` 后，`sync` / `list` / `query` / `delete` / `pull` 可对真实百炼 API 跑通
2. `vocabulary.state.json` 被 gitignore，不会进库
3. 缺密钥、非法 JSON、空词表会失败并给出可读中文错误
4. 不修改 Rust ASR、前端业务代码或生产构建产物

## 后续（非本阶段）

- 将 `vocabulary_id` 注入 ASR `run-task`（或文档规定的参数名）
- 可选：sync 成功后同步写 `ASR_VOCABULARY_ID` 到本地 env（仍不入库）
