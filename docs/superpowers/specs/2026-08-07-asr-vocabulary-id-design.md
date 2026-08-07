# ASR 接入预编译热词设计

日期：2026-08-07
状态：已确认，待实现

## 背景

开发期热词工具已能把词表同步到百炼并得到 `vocabulary_id`（见 `2026-08-07-vocabulary-dev-tool-design.md`）。Fun-ASR-Realtime 的 `run-task` 支持在 `parameters` 中传入可选的 `vocabulary_id`（[客户端事件文档](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)）。本阶段把该 id（若有）接到 ASR 运行时。

## 范围

在范围内：

- `pnpm vocabulary sync` 成功后写出 `scripts/vocabulary-env.sh`（`export ASR_VOCABULARY_ID=...`）
- `delete` 删除当前 state 中的 id 时移除该文件
- `android-env.sh`（及 vocabulary pnpm 脚本）在存在时 source 该文件
- Rust `config.rs` 用 `option_env!("ASR_VOCABULARY_ID")` 读取；空则视为未配置
- `run_task_frame` / `DashScopeWs`：仅当 id 非空时写入 `parameters.vocabulary_id`

不在范围内：

- 即时热词 `parameters.vocabulary` map（Fun-ASR-Realtime 用预编译 id）
- 运行时从磁盘读 `vocabulary.state.json`（继续走编译期 env，与现有密钥注入一致）
- 前端 UI / 配置页
- 改动 `voice-env.sh` 本体（密钥文件与词表 id 解耦）

## 关键决策

### 为什么用旁路 `vocabulary-env.sh` 而不是改 `voice-env.sh`

`voice-env.sh` 由开发者手填密钥，sync 自动改写容易冲突或误删。单独文件只含一行 `ASR_VOCABULARY_ID`，gitignore，由 `android-env.sh` 在 `voice-env.sh` 之后按需 source。

### 为什么仍是编译期注入

现有 `DASHSCOPE_API_KEY` / `ASR_WS_URL` 已是 `option_env!`。热词 id 沿用同一路径，改 id 后重新编译即可生效；避免 Android 上再开一条读文件通道。

### 为什么缺 id 时静默省略字段

「若有」：未配置或空串时不传 `vocabulary_id`，与官方可选参数语义一致，也不把缺热词当成配置错误阻断 ASR。

## 数据流

```
pnpm vocabulary -- sync
  → vocabulary.state.json
  → scripts/vocabulary-env.sh   # gitignore
       │
       ▼
android-env.sh:
  source voice-env.sh
  source vocabulary-env.sh（若存在）
       │
       ▼
option_env!("ASR_VOCABULARY_ID")
       │
       ▼
run-task.parameters.vocabulary_id   # 仅非空时
```

## 文件清单

| 路径 | 改动 |
|------|------|
| `scripts/vocabulary.ts` | sync 写 env；delete 清当前 id 时删文件 |
| `scripts/vocabulary-env.sh` | 生成物，不入库 |
| `.gitignore` | 增加该路径 |
| `scripts/android-env.sh` | source vocabulary-env（若存在） |
| `scripts/voice-env.sh.example` | 注释说明热词 id 由 sync 生成 |
| `package.json` | `vocabulary` 脚本一并 source vocabulary-env |
| `src-tauri/src/voice/config.rs` | `ASR_VOCABULARY_ID` |
| `src-tauri/src/voice/asr/protocol.rs` | `run_task_frame` 可选 id |
| `src-tauri/src/voice/asr/dashscope_ws.rs` | 传入 config 中的 id |

## `vocabulary-env.sh` 形态

```bash
# 由 pnpm vocabulary sync 自动生成，请勿手改。
export ASR_VOCABULARY_ID="vocab-gdufe-xxxx"
```

## `run-task` 形态（有 id 时）

```json
{
  "payload": {
    "parameters": {
      "sample_rate": 16000,
      "format": "pcm",
      "vocabulary_id": "vocab-gdufe-xxxx"
    }
  }
}
```

无 id 时 `parameters` 仅含 `sample_rate` 与 `format`（与现状一致）。

## 验收标准

1. 未配置 `ASR_VOCABULARY_ID` 时，生成的 run-task JSON 不含 `vocabulary_id` 字段；单测覆盖
2. 配置非空 id 时，字段值与配置一致；单测覆盖
3. `sync` 后出现被 gitignore 的 `vocabulary-env.sh`；`delete` 当前词表后文件消失
4. `pnpm android:dev` 前 source 链能带上该变量（需重编后生效）
5. 不修改前端业务代码

## 使用说明（开发者）

1. `pnpm vocabulary -- sync`
2. 重新编译 / `pnpm android:dev`（编译期读取 env）
3. 之后 ASR 会话自动带热词
