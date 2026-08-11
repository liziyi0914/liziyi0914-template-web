# 机器人端接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让安卓端机器人走完 Device Flow 连上 `/ws/robot`，把唤醒后的语音指令交给带工具调用的大模型，由模型调用平台指令并生成中文回复。

**Architecture:** 协议 crate 补齐 `ws/catalog.rs`（22 个机器人 op 的单点定义）、`http/device.rs`（Device Flow）与机器人要的 `ServerEvent` 变体。`voice/llm/` 上移成 `src/llm/`，`TextModel` 扩展成多轮 + 工具调用，`voice/` 退回纯 ASR，只通过一个 `mpsc<String>` 把 cmd 文本投给 Agent。新的 `platform/robot/` 由四个文件组成：`context.rs` 维护现场快照并渲染提示词、`tools.rs` 做 op 与工具名的双向映射、`agent.rs` 跑两轮工具循环、`mod.rs` 负责授权与重连循环，并用一块 `CommandBus` 把 Agent 和当前那条连接解耦。

**Tech Stack:** Rust / Tauri 2 / tokio / tokio-tungstenite / async-openai 0.41（chat-completion）/ reqwest 0.13 / React 19 / qrcode

---

## 前置说明

**先读设计文档**：`docs/superpowers/specs/2026-08-10-teaching-platform-integration-design.md`。本计划实现其中的实施顺序第 5–7 步（机器人端）；第 1–4 步（协议 crate 骨架、`platform/` 骨架、大屏 APP 端、前端连接层）已由 `docs/superpowers/plans/2026-08-10-teaching-platform-screen-app.md` 完成。

**协议原文**：`../TeachingPlatform/docs/api/WebSocket-对接文档.md` §6（客户端指令全集）与 §7（服务端事件全集）、`../TeachingPlatform/docs/api/HTTP-API-对接文档.md` §4.3（机器人 Device Flow）。参照实现 `../mock-server/robot_sim.py`。

**常用命令**（都在仓库根目录 `gdufe-classroom/` 下执行）：

```bash
# 协议 crate 的测试（纯函数，秒级）
cd src-tauri && cargo test -p teaching-platform

# app crate 的测试。宿主机是桌面 target，所以 platform/robot/ 必须能在
# 桌面下编译，这也是它没有被 #[cfg(mobile)] 包起来的原因
cd src-tauri && cargo test -p app

# 前端
pnpm check              # biome 检查并自动修
pnpm exec tsc --noEmit  # 类型检查
```

**测试命名沿用现有风格**：协议 crate 与 `platform/` 的单测用中文函数名（见 `src-tauri/crates/teaching-platform/src/error.rs`），`voice/` 下的用英文（见 `src-tauri/src/voice/events.rs`）。改哪个文件就跟着那个文件的邻居写。

**编译期密钥**：LLM 相关配置由 `scripts/voice-env.sh` 注入构建期环境变量。本机没有这个文件时 `LLM_MODEL` 等会回落到默认值，单测不依赖它们。

---

## File Structure

### 协议 crate `src-tauri/crates/teaching-platform/`

| 文件 | 责任 |
|---|---|
| `src/ws/catalog.rs`（新建） | 22 个机器人可发 op 的 `OpSpec`（op / 中文描述 / JSON Schema 字面量）。工具清单与白名单都从这里派生 |
| `src/http/device.rs`（新建） | Device Flow 三个 HTTP 调用与 `DeviceTokenPoll` 两形态判别 |
| `src/ws/event.rs`（改） | 补 `ScreenStateChanged` / `AttendanceProgress` / `AttendanceClosed` / `RollcallResult` 四个变体 |
| `src/ws/snapshot.rs`（改） | 给 `ScreenState` / `SignIn` 加 `PartialEq`，好让 `ServerEvent` 继续 derive |
| `src/ws/mod.rs`、`src/http/mod.rs`（改） | 登记新子模块 |

### LLM 层 `src-tauri/src/llm/`（新建，从 `voice/llm/` 上移）

| 文件 | 责任 |
|---|---|
| `mod.rs` | `ChatMessage` / `ToolCall` / `ToolSpec` / `ChatRequest` / `ChatResponse` / `TextModel` / `LlmError` |
| `config.rs` | LLM 的编译期常量（端点、模型名、超时） |
| `openai_sdk.rs` | 用 async-openai 把上面的类型翻译成 OpenAI 兼容请求 |

### 机器人 `src-tauri/src/platform/robot/`（新建）

| 文件 | 责任 |
|---|---|
| `mod.rs` | 授权 + 重连循环、`RobotHandler`（入站 req 一律回 40006）、`CommandBus`、Agent 任务 |
| `device_flow.rs` | Device Flow 编排：申请码 → 广播 `authorizing` → 轮询 → `DeviceSession` |
| `context.rs` | `ContextStore`：吃快照与事件，`render()` 出提示词里的现场段落 |
| `tools.rs` | `catalog::ROBOT_OPS` ↔ `ToolSpec`，工具名 `.` ⇄ `_` 双向映射兼白名单 |
| `agent.rs` | `ToolInvoker` trait、`History`（按轮裁剪）、两轮工具循环 |

### 改动的既有文件

| 文件 | 变更 |
|---|---|
| `src-tauri/src/lib.rs` | 加 `mod llm;`，移动端注册 `robot_device_flow_state` |
| `src-tauri/src/platform/mod.rs` | 加 `pub mod robot;`，移动端 `run_role` 接到 `robot::run` |
| `src-tauri/src/platform/config.rs` | 去掉两个角色配置结构上的 `#[cfg]`，只保留 `RoleConfig` 别名的 |
| `src-tauri/src/platform/events.rs` | 加 `DeviceFlowInfo` |
| `src-tauri/src/platform/state.rs` | 加 cmd 通道发送端与 Device Flow 信息两个格位 |
| `src-tauri/src/platform/commands.rs` | 加 `robot_device_flow_state` |
| `src-tauri/src/platform/screen_app/mod.rs` | `on_event` 的匹配补 catch-all |
| `src-tauri/src/voice/{mod,config,error,events,session,commands}.rs` | 退回纯 ASR，`VoiceEvent::Command` 载荷改成 `{text}` |
| `src-tauri/src/voice/llm/`（删除） | 上移到 `src/llm/` |
| `src/lib/voice/{types,index}.ts`、`src/hooks/use-voice-session.ts`、`src/components/voice-demo.tsx` | 同步语音事件契约 |
| `src/lib/platform-api/{types,index}.ts`、`src/hooks/use-device-flow.ts`（新建）、`src/components/device-flow-card.tsx`（新建）、`src/components/mobile/home.tsx` | 授权卡片与二维码 |
| `package.json` | 加 `qrcode` 与 `@types/qrcode` |

---

### Task 1: `ws/catalog.rs` — 22 个机器人 op 的单点定义

工具清单、白名单校验、参数 schema 三处都要用同一份数据。放在协议 crate 里是因为它就是协议的一部分，而且能直接 `cargo test`。

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/ws/catalog.rs`
- Modify: `src-tauri/crates/teaching-platform/src/ws/mod.rs`

- [ ] **Step 1: 写失败的测试**

新建 `src-tauri/crates/teaching-platform/src/ws/catalog.rs`，只放测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn 机器人指令清单是_22_条() {
        assert_eq!(ROBOT_OPS.len(), 22);
    }

    #[test]
    fn 清单里的_op_不重复() {
        let mut names: Vec<&str> = ROBOT_OPS.iter().map(|spec| spec.op).collect();
        names.sort_unstable();
        let count = names.len();
        names.dedup();
        assert_eq!(names.len(), count, "有重复的 op");
    }

    #[test]
    fn 清单覆盖文档列出的全部命名空间() {
        for op in [
            "ppt.open", "ppt.close", "ppt.next", "ppt.prev", "ppt.goto", "ppt.explain",
            "screen.switch_view",
            "tts.speak", "tts.stop",
            "rollcall.start",
            "quiz.publish", "quiz.close", "quiz.show_question",
            "discussion.open", "discussion.close",
            "attendance.open", "attendance.close",
            "danmaku.switch",
            "ask.show",
            "app.open_url", "app.close_browser", "app.status",
        ] {
            assert!(find(op).is_some(), "清单里缺少 {op}");
        }
    }

    #[test]
    fn 每条_schema_都是_type_为_object_的合法_json() {
        for spec in ROBOT_OPS {
            let schema: Value = serde_json::from_str(spec.params_schema)
                .unwrap_or_else(|e| panic!("{} 的 schema 不是合法 JSON：{e}", spec.op));
            assert_eq!(schema["type"], "object", "{} 的 schema type 必须是 object", spec.op);
            assert!(schema.get("properties").is_some_and(Value::is_object),
                "{} 的 schema 缺少 properties", spec.op);
            assert_eq!(schema["additionalProperties"], false,
                "{} 要禁止多余参数，否则模型会自己发明字段", spec.op);
        }
    }

    #[test]
    fn 每条都有中文描述() {
        for spec in ROBOT_OPS {
            assert!(!spec.summary.trim().is_empty(), "{} 缺少描述", spec.op);
        }
    }

    #[test]
    fn 翻页指令要求填当前页做乐观锁() {
        for op in ["ppt.next", "ppt.prev"] {
            let schema = find(op).unwrap().params_schema;
            assert!(schema.contains("expect_page"), "{op} 应带 expect_page");
        }
    }

    #[test]
    fn 切换视图用_enum_限定七种取值() {
        let schema: Value =
            serde_json::from_str(find("screen.switch_view").unwrap().params_schema).unwrap();
        let values = schema["properties"]["view"]["enum"].as_array().unwrap();
        assert_eq!(values.len(), 7);
        assert!(values.contains(&Value::from("attendance")));
    }

    #[test]
    fn 点名人数上限是_20() {
        let schema: Value =
            serde_json::from_str(find("rollcall.start").unwrap().params_schema).unwrap();
        assert_eq!(schema["properties"]["count"]["maximum"], 20);
    }

    #[test]
    fn 朗读文本上限是_1000_字() {
        let schema: Value = serde_json::from_str(find("tts.speak").unwrap().params_schema).unwrap();
        assert_eq!(schema["properties"]["text"]["maxLength"], 1000);
    }

    #[test]
    fn 打开大屏不接受客户端传_url() {
        // URL 由后端生成，客户端传了会被忽略，schema 里不该出现它
        let schema = find("app.open_url").unwrap().params_schema;
        assert!(!schema.contains("\"url\""), "app.open_url 的 schema 不该有 url");
    }

    #[test]
    fn 刷新大屏不在机器人清单里() {
        // 语音误识别触发刷新会打断正在进行的课程，协议刻意禁止机器人发它
        assert!(find("screen.reload").is_none());
    }

    #[test]
    fn 未知_op_查不到() {
        assert!(find("ppt.dance").is_none());
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

先在 `src-tauri/crates/teaching-platform/src/ws/mod.rs` 里登记模块，否则测试根本不会被编译：

```rust
pub mod backoff;
pub mod catalog;
pub mod conn;
pub mod event;
pub mod frame;
pub mod snapshot;
```

Run: `cd src-tauri && cargo test -p teaching-platform catalog`
Expected: 编译失败，`cannot find value ROBOT_OPS in this scope`、`cannot find function find in this scope`

- [ ] **Step 3: 写实现**

把下面的内容加到 `catalog.rs` 的**测试模块之前**：

```rust
//! 机器人可发的 op 的单点定义。
//!
//! 工具清单、白名单校验、参数 schema 三处都从这里派生。分开写三份的话，
//! 后端加一条指令就得改三个地方，漏一个就是「模型调了个不存在的工具」。
//!
//! 清单以 `GET /api/v1/ws/ops` 于 2026-08-10 的实测结果为准，
//! 对应 WebSocket 对接文档 §6 里发送方含 `robot` 的那些。

/// 一条指令的协议定义。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpSpec {
    pub op: &'static str,
    /// 中文描述，直接用作工具的 description，所以要写给模型看得懂。
    pub summary: &'static str,
    /// JSON Schema 字面量。写成字符串而不是 `serde_json::json!`，
    /// 是为了让它能待在 `const` 里。
    pub params_schema: &'static str,
}

/// 无参数指令共用的 schema。
const NO_PARAMS: &str = r#"{"type":"object","properties":{},"additionalProperties":false}"#;

pub const ROBOT_OPS: &[OpSpec] = &[
    OpSpec {
        op: "ppt.open",
        summary: "打开指定课件并回到第 1 页",
        params_schema: r#"{"type":"object","properties":{"courseware_id":{"type":"integer","description":"课件 id"}},"required":["courseware_id"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "ppt.close",
        summary: "关闭当前课件",
        params_schema: NO_PARAMS,
    },
    OpSpec {
        op: "ppt.next",
        summary: "课件翻到下一页",
        params_schema: r#"{"type":"object","properties":{"expect_page":{"type":"integer","minimum":1,"description":"翻页前的当前页码。必须从现场信息里读出来填上：语音有延迟，不填会翻错页"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "ppt.prev",
        summary: "课件翻到上一页",
        params_schema: r#"{"type":"object","properties":{"expect_page":{"type":"integer","minimum":1,"description":"翻页前的当前页码。必须从现场信息里读出来填上：语音有延迟，不填会翻错页"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "ppt.goto",
        summary: "课件跳到指定页",
        params_schema: r#"{"type":"object","properties":{"page":{"type":"integer","minimum":1,"description":"目标页码，从 1 开始"}},"required":["page"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "ppt.explain",
        summary: "让 AI 讲解课件某一页并朗读出来",
        params_schema: r#"{"type":"object","properties":{"page":{"type":"integer","minimum":1,"description":"要讲解的页码，不填则讲当前页"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "screen.switch_view",
        summary: "切换大屏当前显示的视图",
        params_schema: r#"{"type":"object","properties":{"view":{"type":"string","enum":["ppt","rollcall","discussion","ideology","quiz","danmaku","attendance"],"description":"目标视图：ppt 课件、rollcall 点名、discussion 小组讨论、ideology 课堂思政、quiz 测试统计、danmaku 弹幕墙、attendance 签到"}},"required":["view"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "tts.speak",
        summary: "让大屏朗读一段文本",
        params_schema: r#"{"type":"object","properties":{"text":{"type":"string","maxLength":1000,"description":"要朗读的文本，最长 1000 字"},"voice":{"type":"string","description":"音色，通常不填"},"rate":{"type":"number","description":"语速倍率，通常不填"}},"required":["text"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "tts.stop",
        summary: "立即停止大屏正在进行的朗读",
        params_schema: NO_PARAMS,
    },
    OpSpec {
        op: "rollcall.start",
        summary: "随机点名，抽签由后端完成",
        params_schema: r#"{"type":"object","properties":{"count":{"type":"integer","minimum":1,"maximum":20,"description":"点名人数，默认 1，最多 20"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "quiz.publish",
        summary: "发布一个课堂测试",
        params_schema: r#"{"type":"object","properties":{"quiz_id":{"type":"integer","description":"测试 id"},"seq":{"type":"integer","minimum":1,"description":"本课堂内的测试序号，「发布第一个测试」填 1"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "quiz.close",
        summary: "关闭一个正在进行的课堂测试",
        params_schema: r#"{"type":"object","properties":{"quiz_id":{"type":"integer","description":"测试 id"},"seq":{"type":"integer","minimum":1,"description":"本课堂内的测试序号，与 quiz_id 二选一"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "quiz.show_question",
        summary: "把测试里的某道题连答案与解析投到大屏，要求该测试已关闭",
        params_schema: r#"{"type":"object","properties":{"quiz_id":{"type":"integer","description":"测试 id"},"question_id":{"type":"integer","description":"题目 id"},"seq":{"type":"integer","minimum":1,"description":"题号，与 question_id 二选一"}},"required":["quiz_id"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "discussion.open",
        summary: "开启小组讨论，分组模式下自动分组",
        params_schema: r#"{"type":"object","properties":{"discussion_id":{"type":"integer","description":"讨论 id"}},"required":["discussion_id"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "discussion.close",
        summary: "关闭小组讨论并广播小结",
        params_schema: r#"{"type":"object","properties":{"discussion_id":{"type":"integer","description":"讨论 id"}},"required":["discussion_id"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "attendance.open",
        summary: "开启签到，每次都会重新生成签到码",
        params_schema: r#"{"type":"object","properties":{"duration":{"type":"integer","minimum":1,"description":"签到时长，单位秒，不填用后端默认值"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "attendance.close",
        summary: "关闭签到，签到码立即失效",
        params_schema: NO_PARAMS,
    },
    OpSpec {
        op: "danmaku.switch",
        summary: "打开或关闭大屏的弹幕显示",
        params_schema: r#"{"type":"object","properties":{"enabled":{"type":"boolean","description":"true 显示弹幕，false 隐藏，不填按显示处理"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "ask.show",
        summary: "把某条学生提问投到大屏",
        params_schema: r#"{"type":"object","properties":{"ask_id":{"type":"integer","description":"提问 id"}},"required":["ask_id"],"additionalProperties":false}"#,
    },
    OpSpec {
        op: "app.open_url",
        summary: "让教室里的大屏程序拉起浏览器打开演示大屏",
        params_schema: r#"{"type":"object","properties":{"lesson_id":{"type":"integer","description":"课堂 id，不填则用连接绑定的课堂"}},"additionalProperties":false}"#,
    },
    OpSpec {
        op: "app.close_browser",
        summary: "关闭大屏程序打开的浏览器",
        params_schema: NO_PARAMS,
    },
    OpSpec {
        op: "app.status",
        summary: "查询大屏程序的版本与浏览器是否在运行",
        params_schema: NO_PARAMS,
    },
];

/// 按 op 名查定义。同时是白名单：查不到就是机器人不该发的。
pub fn find(op: &str) -> Option<&'static OpSpec> {
    ROBOT_OPS.iter().find(|spec| spec.op == op)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p teaching-platform catalog`
Expected: `test result: ok. 12 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/crates/teaching-platform/src/ws/catalog.rs src-tauri/crates/teaching-platform/src/ws/mod.rs
git commit -m "feat(protocol): 定义机器人可发的 22 个 op"
```

---

### Task 2: `http/device.rs` — Device Flow 的三个 HTTP 调用

`POST /device/token` 的响应是两种形态之一。判别必须靠有没有 `access_token`，不能靠 `status` 是否存在——成功响应里没有 `status` 字段，而未完成响应将来可能加任何新字段。

**Files:**
- Create: `src-tauri/crates/teaching-platform/src/http/device.rs`
- Modify: `src-tauri/crates/teaching-platform/src/http/mod.rs:1`

- [ ] **Step 1: 写失败的测试**

新建 `src-tauri/crates/teaching-platform/src/http/device.rs`，只放测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 有_access_token_就是成功形态() {
        let poll = DeviceTokenPoll::from_value(&json!({
            "access_token": "dev-token", "expires_in": 43200,
            "lesson_id": 88, "classroom_id": 3
        }));
        assert_eq!(
            poll,
            DeviceTokenPoll::Ok {
                access_token: "dev-token".into(),
                expires_in: 43_200,
                lesson_id: Some(88),
                classroom_id: Some(3),
            }
        );
    }

    #[test]
    fn 成功形态即使带着_status_也按成功处理() {
        // 判别只看 access_token：后端将来在成功响应里加个 status 不该让客户端卡住
        let poll = DeviceTokenPoll::from_value(&json!({
            "access_token": "t", "status": "pending"
        }));
        assert!(matches!(poll, DeviceTokenPoll::Ok { .. }));
    }

    #[test]
    fn 成功形态缺_expires_in_时按_12_小时兜底() {
        let DeviceTokenPoll::Ok { expires_in, .. } =
            DeviceTokenPoll::from_value(&json!({ "access_token": "t" }))
        else {
            panic!("应为 Ok");
        };
        assert_eq!(expires_in, DEVICE_TOKEN_TTL_SECS);
    }

    #[test]
    fn 没有_access_token_就是未完成形态() {
        assert_eq!(
            DeviceTokenPoll::from_value(&json!({ "status": "pending", "interval": 5 })),
            DeviceTokenPoll::Pending {
                status: PollStatus::Pending,
                interval: Some(5)
            }
        );
    }

    #[test]
    fn access_token_是空串时按未完成处理() {
        assert!(matches!(
            DeviceTokenPoll::from_value(&json!({ "access_token": "", "status": "pending" })),
            DeviceTokenPoll::Pending { .. }
        ));
    }

    #[test]
    fn 解析四种轮询状态() {
        for (raw, expected) in [
            ("pending", PollStatus::Pending),
            ("slow_down", PollStatus::SlowDown),
            ("denied", PollStatus::Denied),
            ("expired", PollStatus::Expired),
        ] {
            let DeviceTokenPoll::Pending { status, .. } =
                DeviceTokenPoll::from_value(&json!({ "status": raw }))
            else {
                panic!("{raw} 应为 Pending 形态");
            };
            assert_eq!(status, expected);
        }
    }

    #[test]
    fn 认不出的状态按_pending_处理() {
        // 继续轮询最多浪费几次请求，直接放弃会让老师白扫一次码
        let DeviceTokenPoll::Pending { status, .. } =
            DeviceTokenPoll::from_value(&json!({ "status": "brand_new" }))
        else {
            panic!("应为 Pending 形态");
        };
        assert_eq!(status, PollStatus::Pending);
    }

    #[test]
    fn 只有拒绝与过期是终态() {
        assert!(PollStatus::Denied.is_terminal());
        assert!(PollStatus::Expired.is_terminal());
        assert!(!PollStatus::Pending.is_terminal());
        assert!(!PollStatus::SlowDown.is_terminal());
    }

    #[test]
    fn interval_为_0_时当作没给() {
        let DeviceTokenPoll::Pending { interval, .. } =
            DeviceTokenPoll::from_value(&json!({ "status": "pending", "interval": 0 }))
        else {
            panic!("应为 Pending 形态");
        };
        assert_eq!(interval, None);
    }

    #[test]
    fn 授权码响应缺字段时用默认有效期与间隔() {
        let code: DeviceCode = serde_json::from_value(json!({
            "device_code": "dc", "user_code": "ABCD"
        }))
        .unwrap();
        assert_eq!(code.expires_in, DEFAULT_EXPIRES_IN);
        assert_eq!(code.interval, DEFAULT_INTERVAL);
        assert_eq!(code.verification_uri_complete, "");
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

先在 `src-tauri/crates/teaching-platform/src/http/mod.rs` 第 1 行前登记模块：

```rust
pub mod device;
pub mod screen;
```

Run: `cd src-tauri && cargo test -p teaching-platform device`
Expected: 编译失败，`cannot find type DeviceTokenPoll in this scope`

- [ ] **Step 3: 写实现**

把下面的内容加到 `device.rs` 的**测试模块之前**：

```rust
//! 机器人 Device Flow。流程与轮询语义见 HTTP 对接文档 §4.3。

use crate::envelope::{read_envelope, read_envelope_unit};
use crate::error::{PlatformError, Result};
use crate::http::HttpClient;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const DEVICE_TIMEOUT_SECS: u64 = 15;
/// 文档给的授权码有效期是 10 分钟。
const DEFAULT_EXPIRES_IN: u64 = 600;
const DEFAULT_INTERVAL: u64 = 5;
/// 设备 token 12 小时，且**没有刷新机制**，过期只能重走整个流程。
pub const DEVICE_TOKEN_TTL_SECS: u64 = 12 * 3600;

/// `POST /device/code` 的响应。
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DeviceCode {
    pub device_code: String,
    /// 给老师念/输入的短码。
    pub user_code: String,
    pub verification_uri: String,
    /// 已经带上 user_code 的完整地址，二维码就编码这个。
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

impl Default for DeviceCode {
    fn default() -> Self {
        Self {
            device_code: String::new(),
            user_code: String::new(),
            verification_uri: String::new(),
            verification_uri_complete: String::new(),
            expires_in: DEFAULT_EXPIRES_IN,
            interval: DEFAULT_INTERVAL,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PollStatus {
    Pending,
    SlowDown,
    Denied,
    Expired,
}

impl PollStatus {
    fn parse(raw: &str) -> Self {
        match raw {
            "slow_down" => Self::SlowDown,
            "denied" => Self::Denied,
            "expired" => Self::Expired,
            // 认不出来的一律继续轮询：多发几次请求的代价远小于让老师白扫一次码
            _ => Self::Pending,
        }
    }

    /// 终态：停止轮询，要人重新申请。
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Denied | Self::Expired)
    }
}

/// `POST /device/token` 的两种响应形态。
#[derive(Debug, Clone, PartialEq)]
pub enum DeviceTokenPoll {
    Ok {
        access_token: String,
        expires_in: u64,
        lesson_id: Option<i64>,
        classroom_id: Option<i64>,
    },
    Pending {
        status: PollStatus,
        /// 服务端建议的新间隔，没给就沿用原来的。
        interval: Option<u64>,
    },
}

impl DeviceTokenPoll {
    /// 两种形态靠有没有 `access_token` 区分，不靠 `status` 是否存在——
    /// 成功响应里本来就没有 `status`。
    pub fn from_value(data: &Value) -> Self {
        let token = data
            .get("access_token")
            .and_then(Value::as_str)
            .unwrap_or_default();

        if !token.is_empty() {
            return Self::Ok {
                access_token: token.to_string(),
                expires_in: data
                    .get("expires_in")
                    .and_then(Value::as_u64)
                    .filter(|secs| *secs > 0)
                    .unwrap_or(DEVICE_TOKEN_TTL_SECS),
                lesson_id: data.get("lesson_id").and_then(Value::as_i64),
                classroom_id: data.get("classroom_id").and_then(Value::as_i64),
            };
        }

        Self::Pending {
            status: PollStatus::parse(
                data.get("status").and_then(Value::as_str).unwrap_or_default(),
            ),
            interval: data
                .get("interval")
                .and_then(Value::as_u64)
                .filter(|secs| *secs > 0),
        }
    }
}

impl HttpClient {
    pub async fn device_code(&self, no: &str, secret: &str) -> Result<DeviceCode> {
        let response = self
            .inner()
            .post(self.api("/device/code"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .json(&json!({ "device_no": no, "device_secret": secret }))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        let code: DeviceCode = read_envelope(response).await?;

        if code.device_code.is_empty() || code.user_code.is_empty() {
            return Err(PlatformError::Decode(
                "授权码响应缺少 device_code 或 user_code".into(),
            ));
        }
        Ok(code)
    }

    /// 轮询换 token。`device_code` 换过一次即作废，拿到 token 后不要再调。
    pub async fn device_token(&self, device_code: &str) -> Result<DeviceTokenPoll> {
        let response = self
            .inner()
            .post(self.api("/device/token"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .json(&json!({ "device_code": device_code }))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        let data: Value = read_envelope(response).await?;
        Ok(DeviceTokenPoll::from_value(&data))
    }

    /// 设备自己登出，带设备 token。
    pub async fn device_logout(&self, token: &str) -> Result<()> {
        let response = self
            .inner()
            .post(self.api("/device/logout"))
            .timeout(Duration::from_secs(DEVICE_TIMEOUT_SECS))
            .bearer_auth(token)
            .json(&json!({}))
            .send()
            .await
            .map_err(|e| PlatformError::Http(e.to_string()))?;

        read_envelope_unit(response).await
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p teaching-platform device`
Expected: `test result: ok. 10 passed`

- [ ] **Step 5: 全量跑一遍协议 crate**

Run: `cd src-tauri && cargo test -p teaching-platform`
Expected: 全绿，没有新的 warning

- [ ] **Step 6: 提交**

```bash
git add src-tauri/crates/teaching-platform/src/http/device.rs src-tauri/crates/teaching-platform/src/http/mod.rs
git commit -m "feat(protocol): 实现机器人 Device Flow 的三个接口"
```

---

### Task 3: `ws/event.rs` — 机器人要消费的现场事件

只给 `ContextStore` 真正会存的事件建变体：`ppt.state` / `screen.state`（大屏视图与页码）、`attendance.*`（签到）、`rollcall.result`（最近点名）。`quiz.*` 与 `discussion.*` 继续落 `Unknown`——`auth.login` 快照里 `active_quiz` / `active_discussion` 协议注明恒为 `null`，重连后这两类状态重建不出来，存了反而会给模型过期信息。

**Files:**
- Modify: `src-tauri/crates/teaching-platform/src/ws/snapshot.rs:29-47`
- Modify: `src-tauri/crates/teaching-platform/src/ws/event.rs`
- Modify: `src-tauri/src/platform/screen_app/mod.rs:138-141`

- [ ] **Step 1: 写失败的测试**

把下面这些测试追加到 `src-tauri/crates/teaching-platform/src/ws/event.rs` 的 `mod tests` 里（放在既有的 `未知事件不报错而是落到_unknown` 之后）：

```rust
    #[test]
    fn ppt_state_与_screen_state_解析成同一个变体() {
        let data = json!({ "view": "ppt", "courseware_id": 17, "page": 5,
                           "page_count": 32, "ideology_material_id": null });

        for op in ["ppt.state", "screen.state"] {
            let ServerEvent::ScreenStateChanged { state } = ServerEvent::parse(op, data.clone())
            else {
                panic!("{op} 应为 ScreenStateChanged");
            };
            assert_eq!(state.view, "ppt");
            assert_eq!(state.page, 5);
            assert_eq!(state.page_count, 32);
            assert_eq!(state.courseware_id, Some(17));
        }
    }

    #[test]
    fn 大屏状态字段缺失时归零而不是丢弃事件() {
        let ServerEvent::ScreenStateChanged { state } =
            ServerEvent::parse("screen.state", json!({ "view": "rollcall" }))
        else {
            panic!("应为 ScreenStateChanged");
        };
        assert_eq!(state.view, "rollcall");
        assert_eq!(state.page, 0);
        assert_eq!(state.courseware_id, None);
    }

    #[test]
    fn 签到开启事件状态记为_open_并带出签到码() {
        let ServerEvent::AttendanceProgress { sign_in } = ServerEvent::parse(
            "attendance.open",
            json!({ "lesson_id": 88, "duration": 300, "code": "7K3M9Q",
                    "signed": 0, "total": 45, "rate": 0.0 }),
        ) else {
            panic!("应为 AttendanceProgress");
        };
        // attendance.open 的载荷里没有状态字段，靠 op 本身推断
        assert_eq!(sign_in.status, "open");
        assert_eq!(sign_in.code.as_deref(), Some("7K3M9Q"));
        assert_eq!(sign_in.total, 45);
    }

    #[test]
    fn 签到进度事件用_sign_in_status_字段() {
        let ServerEvent::AttendanceProgress { sign_in } = ServerEvent::parse(
            "attendance.progress",
            json!({ "lesson_id": 88, "signed": 31, "total": 45,
                    "rate": 0.6889, "sign_in_status": "closed" }),
        ) else {
            panic!("应为 AttendanceProgress");
        };
        assert_eq!(sign_in.status, "closed");
        assert_eq!(sign_in.signed, 31);
        assert_eq!(sign_in.code, None);
    }

    #[test]
    fn 签到关闭事件状态记为_closed() {
        let ServerEvent::AttendanceClosed { sign_in } = ServerEvent::parse(
            "attendance.close",
            json!({ "lesson_id": 88, "signed": 40, "total": 45, "rate": 0.8889 }),
        ) else {
            panic!("应为 AttendanceClosed");
        };
        assert_eq!(sign_in.status, "closed");
        assert_eq!(sign_in.signed, 40);
    }

    #[test]
    fn 点名结果取出姓名并跳过空名字() {
        let ServerEvent::RollcallResult { names } = ServerEvent::parse(
            "rollcall.result",
            json!({ "lesson_id": 88, "records": [
                { "roll_call_id": 9, "student_id": 1, "real_name": "李某", "student_no": "01" },
                { "roll_call_id": 10, "student_id": 2, "real_name": "  ", "student_no": "02" },
                { "roll_call_id": 11, "student_id": 3, "real_name": "王某", "student_no": "03" }
            ] }),
        ) else {
            panic!("应为 RollcallResult");
        };
        assert_eq!(names, vec!["李某".to_string(), "王某".to_string()]);
    }

    #[test]
    fn 点名结果没有_records_时给空列表() {
        let ServerEvent::RollcallResult { names } =
            ServerEvent::parse("rollcall.result", json!({ "lesson_id": 88 }))
        else {
            panic!("应为 RollcallResult");
        };
        assert!(names.is_empty());
    }

    #[test]
    fn 测试与讨论事件仍落到_unknown() {
        // 登录快照里 active_quiz / active_discussion 恒为 null，重连后重建不出来，
        // 存进上下文只会给模型过期信息
        for op in ["quiz.publish", "quiz.stats", "discussion.open", "discussion.summary"] {
            assert!(
                matches!(ServerEvent::parse(op, json!({})), ServerEvent::Unknown { .. }),
                "{op} 应落到 Unknown"
            );
        }
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test -p teaching-platform event`
Expected: 编译失败，`no variant named ScreenStateChanged found for enum ServerEvent`

- [ ] **Step 3: 给快照结构加 PartialEq**

`ServerEvent` derive 了 `PartialEq`，装进去的 `ScreenState` / `SignIn` 也得有。改 `src-tauri/crates/teaching-platform/src/ws/snapshot.rs`，只动这两处的 derive 行：

```rust
#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct ScreenState {
    pub view: String,
    pub courseware_id: Option<i64>,
    pub page: i64,
    pub page_count: i64,
    pub ideology_material_id: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct SignIn {
    pub status: String,
    pub code: Option<String>,
    pub signed: i64,
    pub total: i64,
    pub rate: f64,
}
```

`SignIn` 有 `f64` 字段，所以只能 `PartialEq` 不能 `Eq`。`LessonBrief` 也要加，`ContextStore` 的单测会比较它：

```rust
#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct LessonBrief {
```

- [ ] **Step 4: 扩展 ServerEvent**

改 `src-tauri/crates/teaching-platform/src/ws/event.rs`。文件头的 `use` 与枚举替换成：

```rust
use crate::ws::snapshot::{ScreenState, SignIn};
use serde_json::Value;

/// 服务端事件。未知 op 落到 `Unknown` 而不是报错——后端加新事件不该让客户端崩。
///
/// 只给客户端真正会消费的事件建变体：大屏端关心顶号与课堂切换，
/// 机器人端额外关心大屏视图、签到与点名结果（它们要进 `ContextStore`）。
#[derive(Debug, Clone, PartialEq)]
pub enum ServerEvent {
    Kicked {
        reason: String,
    },
    /// 课堂开始。大屏是常驻程序，服务端会把它重挂到新课堂的房间
    LessonStarted {
        lesson: LessonChange,
    },
    /// 课堂结束。此后大屏不再归属任何课堂，直到下一次 LessonStarted
    LessonEnded {
        lesson: LessonChange,
    },
    /// `ppt.state` 与 `screen.state`。两者载荷完全相同，合成一个变体
    ScreenStateChanged {
        state: ScreenState,
    },
    /// `attendance.open` 与 `attendance.progress`
    AttendanceProgress {
        sign_in: SignIn,
    },
    /// `attendance.close`
    AttendanceClosed {
        sign_in: SignIn,
    },
    /// `rollcall.result`，只留姓名——机器人要的是「刚点了谁」
    RollcallResult {
        names: Vec<String>,
    },
    Unknown {
        op: String,
        data: Value,
    },
}
```

`LessonChange` 与它的 `parse` 保持原样。`impl ServerEvent` 里的 `parse` 补上新分支：

```rust
impl ServerEvent {
    pub fn parse(op: &str, data: Value) -> Self {
        match op {
            "conn.kicked" => Self::Kicked {
                reason: data
                    .get("reason")
                    .and_then(Value::as_str)
                    .unwrap_or("同一身份在别处建立了新连接")
                    .to_string(),
            },
            "lesson.started" => Self::LessonStarted {
                lesson: LessonChange::parse(&data),
            },
            "lesson.ended" => Self::LessonEnded {
                lesson: LessonChange::parse(&data),
            },
            // 字段缺失时归零而不是丢弃：视图变了这件事本身比页码重要
            "ppt.state" | "screen.state" => Self::ScreenStateChanged {
                state: serde_json::from_value(data).unwrap_or_default(),
            },
            "attendance.open" => Self::AttendanceProgress {
                sign_in: sign_in_from(&data, "open"),
            },
            "attendance.progress" => Self::AttendanceProgress {
                sign_in: sign_in_from(&data, "open"),
            },
            "attendance.close" => Self::AttendanceClosed {
                sign_in: sign_in_from(&data, "closed"),
            },
            "rollcall.result" => Self::RollcallResult {
                names: rollcall_names(&data),
            },
            _ => Self::Unknown {
                op: op.to_string(),
                data,
            },
        }
    }
}

/// 三个 attendance 事件的载荷字段名不统一：`open` 没有状态字段，
/// `progress` 用 `sign_in_status`，`close` 隐含已关闭。统一成 `SignIn`。
fn sign_in_from(data: &Value, default_status: &str) -> SignIn {
    SignIn {
        status: data
            .get("sign_in_status")
            .and_then(Value::as_str)
            .filter(|status| !status.trim().is_empty())
            .unwrap_or(default_status)
            .to_string(),
        code: data
            .get("code")
            .and_then(Value::as_str)
            .filter(|code| !code.trim().is_empty())
            .map(str::to_string),
        signed: data.get("signed").and_then(Value::as_i64).unwrap_or_default(),
        total: data.get("total").and_then(Value::as_i64).unwrap_or_default(),
        rate: data.get("rate").and_then(Value::as_f64).unwrap_or_default(),
    }
}

fn rollcall_names(data: &Value) -> Vec<String> {
    data.get("records")
        .and_then(Value::as_array)
        .map(|records| {
            records
                .iter()
                .filter_map(|record| record.get("real_name").and_then(Value::as_str))
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p teaching-platform event`
Expected: `test result: ok. 13 passed`

- [ ] **Step 6: 修大屏端因新变体而不完整的匹配**

新增变体会让 `screen_app/mod.rs` 的 `match` 编译失败。改 `src-tauri/src/platform/screen_app/mod.rs` 里 `on_event` 的最后一个分支：

```rust
            ServerEvent::Unknown { op, .. } => {
                log::debug!("忽略事件 {op}");
            }

            // 大屏视图、签到、点名这些是机器人的现场上下文，大屏端不处理
            _ => {}
```

Run: `cd src-tauri && cargo test -p app`
Expected: 编译通过，既有测试全绿

- [ ] **Step 7: 提交**

```bash
git add src-tauri/crates/teaching-platform/src/ws/event.rs src-tauri/crates/teaching-platform/src/ws/snapshot.rs src-tauri/src/platform/screen_app/mod.rs
git commit -m "feat(protocol): 补齐机器人要消费的现场事件"
```

---

### Task 4: `src/llm/` — 上移 LLM 层并改造成多轮 + 工具调用

现在的 `voice/llm/` 只能发单轮 system+user 并要 JSON 输出。机器人要的是「多轮消息 + 工具清单 + 可能返回 tool_calls」。同时它要被 `platform/robot/` 用，留在 `voice/` 下会让 `platform` 依赖 `voice` 的内部模块，所以上移成 `src/llm/`。

暴露的类型全部是本项目自己的中立类型，async-openai 只出现在 `openai_sdk.rs` 一个文件里——这样 `agent.rs` 的测试可以用假模型，不必构造 SDK 类型。

`voice/llm/prompt.rs` 里的 `VoiceCommand` 与 JSON 解析**不迁移，整体删除**：机器人改用工具调用，不再需要「模型输出 JSON 再自己解析意图」这条路。删除动作在 Task 5 做。

**Files:**
- Create: `src-tauri/src/llm/mod.rs`
- Create: `src-tauri/src/llm/config.rs`
- Create: `src-tauri/src/llm/openai_sdk.rs`
- Modify: `src-tauri/src/lib.rs:4-5`

- [ ] **Step 1: 建模块骨架并登记**

新建 `src-tauri/src/llm/config.rs`：

```rust
//! LLM 的编译期常量。密钥由 scripts/voice-env.sh 注入构建期环境变量。
//!
//! 与 `voice/config.rs` 各自 `option_env!` 读同一个 `DASHSCOPE_API_KEY`：
//! ASR 与 LLM 用的是同一个百炼账号，但两个模块不该因此互相依赖。

/// 为空时构造模型直接失败，而不是等到请求被拒。
pub const DASHSCOPE_API_KEY: &str = match option_env!("DASHSCOPE_API_KEY") {
    Some(value) => value,
    None => "",
};

/// 百炼的 OpenAI 兼容端点。async-openai 会在其后自行拼 `/chat/completions`。
pub const BASE_URL: &str = match option_env!("LLM_BASE_URL") {
    Some(value) => value,
    None => "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

pub const MODEL: &str = match option_env!("LLM_MODEL") {
    Some(value) => value,
    None => "qwen3.7-plus",
};

/// 单次请求的等待上限。工具循环最多两轮，所以最坏等两倍。
pub const TIMEOUT_SECS: u64 = 15;
```

新建 `src-tauri/src/llm/mod.rs`：

```rust
//! Text 模型抽象层。调用方只见本模块的中立类型，
//! async-openai 只出现在 `openai_sdk.rs`，这样上层测试能用假模型。

pub mod config;
pub mod openai_sdk;

use async_trait::async_trait;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("缺少配置项 {0}，请检查 scripts/voice-env.sh")]
    Config(&'static str),

    #[error("模型调用失败：{0}")]
    Transport(String),

    #[error("模型 {0} 秒内没有响应")]
    Timeout(u64),

    #[error("模型既没给回复也没给工具调用")]
    Empty,
}

pub type Result<T> = std::result::Result<T, LlmError>;

/// 模型请求的一次工具调用。`arguments` 保留模型给的原始字符串而不是解析成
/// `Value`：模型经常输出不合法 JSON，解析失败时要把原文回给它让它自己改。
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ChatMessage {
    System(String),
    User(String),
    /// 模型上一轮的回复。带工具调用时 `content` 往往是 `None`
    Assistant {
        content: Option<String>,
        tool_calls: Vec<ToolCall>,
    },
    /// 工具执行结果。`call_id` 必须与对应 `ToolCall` 的 id 一致，否则服务端会 400
    Tool {
        call_id: String,
        content: String,
    },
}

/// 一个工具的声明。`parameters` 是 JSON Schema（`type: object`）。
#[derive(Debug, Clone, PartialEq)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    /// 空表示这轮不给工具，模型只能出文本
    pub tools: Vec<ToolSpec>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    /// 模型这条回复的原始 JSON，写进日志 detail 供排查
    pub raw: String,
}

#[async_trait]
pub trait TextModel: Send + Sync {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse>;
}
```

新建空的 `src-tauri/src/llm/openai_sdk.rs`（下一步填内容），并在 `src-tauri/src/lib.rs` 的模块声明处加一行（`mod platform;` 之后）：

```rust
mod llm;
mod platform;
mod voice;
```

Run: `cd src-tauri && cargo build -p app`
Expected: 失败，`file not found for module` 或 `openai_sdk` 里没有内容导致的 unresolved import

- [ ] **Step 2: 写失败的测试**

翻译层容易错的是**线上 JSON 的形状**，所以测试直接把转换结果序列化出来比对。把下面内容写进 `src-tauri/src/llm/openai_sdk.rs`：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn wire(message: ChatMessage) -> serde_json::Value {
        serde_json::to_value(to_message(message)).unwrap()
    }

    #[test]
    fn system_and_user_messages_carry_plain_text() {
        assert_eq!(
            wire(ChatMessage::System("你是教室机器人".into())),
            json!({ "role": "system", "content": "你是教室机器人" })
        );
        assert_eq!(
            wire(ChatMessage::User("翻到下一页".into())),
            json!({ "role": "user", "content": "翻到下一页" })
        );
    }

    #[test]
    fn assistant_tool_calls_use_the_openai_shape() {
        assert_eq!(
            wire(ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: "call_1".into(),
                    name: "ppt_next".into(),
                    arguments: r#"{"expect_page":3}"#.into(),
                }],
            }),
            json!({
                "role": "assistant",
                "tool_calls": [{
                    "type": "function",
                    "id": "call_1",
                    "function": { "name": "ppt_next", "arguments": r#"{"expect_page":3}"# }
                }]
            })
        );
    }

    #[test]
    fn assistant_without_tool_calls_omits_the_field() {
        // 带上空数组有些兼容端点会 400
        assert_eq!(
            wire(ChatMessage::Assistant {
                content: Some("好的".into()),
                tool_calls: Vec::new(),
            }),
            json!({ "role": "assistant", "content": "好的" })
        );
    }

    #[test]
    fn tool_result_is_keyed_by_tool_call_id() {
        assert_eq!(
            wire(ChatMessage::Tool {
                call_id: "call_1".into(),
                content: r#"{"ok":true}"#.into(),
            }),
            json!({
                "role": "tool",
                "content": r#"{"ok":true}"#,
                "tool_call_id": "call_1"
            })
        );
    }

    #[test]
    fn tool_spec_becomes_a_function_tool() {
        let tool = to_tool(ToolSpec {
            name: "ppt_goto".into(),
            description: "跳到指定页".into(),
            parameters: json!({ "type": "object", "properties": {} }),
        });
        assert_eq!(
            serde_json::to_value(tool).unwrap(),
            json!({
                "type": "function",
                "function": {
                    "name": "ppt_goto",
                    "description": "跳到指定页",
                    "parameters": { "type": "object", "properties": {} }
                }
            })
        );
    }

    fn response_of(raw: serde_json::Value) -> ChatResponse {
        from_response(serde_json::from_value(raw).unwrap())
    }

    #[test]
    fn reads_plain_text_replies() {
        let response = response_of(json!({ "role": "assistant", "content": "已经翻页了" }));
        assert_eq!(response.content.as_deref(), Some("已经翻页了"));
        assert!(response.tool_calls.is_empty());
    }

    #[test]
    fn keeps_the_raw_message_for_logging() {
        // 排查模型跑偏时唯一能看的东西，不能因为解析成结构体就把原文丢了
        let response = response_of(json!({ "role": "assistant", "content": "已经翻页了" }));
        assert!(
            response.raw.contains("已经翻页了"),
            "raw 应保留原始 JSON，实际是 {}",
            response.raw
        );
    }

    #[test]
    fn reads_tool_calls() {
        let response = response_of(json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [{
                "type": "function",
                "id": "call_9",
                "function": { "name": "tts_speak", "arguments": "{\"text\":\"你好\"}" }
            }]
        }));
        assert_eq!(response.content, None);
        assert_eq!(
            response.tool_calls,
            vec![ToolCall {
                id: "call_9".into(),
                name: "tts_speak".into(),
                arguments: "{\"text\":\"你好\"}".into(),
            }]
        );
    }

    #[test]
    fn blank_content_counts_as_no_text() {
        // 带工具调用时模型常给个空串，当成有回复会让 Agent 播一句空话
        let response = response_of(json!({ "role": "assistant", "content": "   " }));
        assert_eq!(response.content, None);
    }

    #[test]
    fn ignores_custom_tool_calls() {
        // 我们只声明 function 工具，出现 custom 只能是模型跑偏，忽略比 panic 好
        let response = response_of(json!({
            "role": "assistant",
            "content": "在想",
            "tool_calls": [{
                "type": "custom",
                "id": "call_x",
                "custom_tool": { "name": "whatever", "input": "hi" }
            }]
        }));
        assert_eq!(response.content.as_deref(), Some("在想"));
        assert!(response.tool_calls.is_empty());
    }
}
```

Run: `cd src-tauri && cargo test -p app llm::`
Expected: 编译失败，`cannot find function to_message in this scope`

- [ ] **Step 3: 写实现**

把下面内容加到 `src-tauri/src/llm/openai_sdk.rs` 的**测试模块之前**：

```rust
//! SDK 调用层。用 async-openai 对接百炼的 OpenAI 兼容端点。
//!
//! OpenAI 官方没有 Rust SDK，async-openai 是 OpenAI 文档中列出的社区库，
//! 选型理由见设计文档。本文件是整个项目里唯一 import async-openai 的地方。

use std::time::Duration;

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionMessageToolCall, ChatCompletionMessageToolCalls,
    ChatCompletionRequestAssistantMessage, ChatCompletionRequestAssistantMessageContent,
    ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
    ChatCompletionRequestSystemMessageContent, ChatCompletionRequestToolMessage,
    ChatCompletionRequestToolMessageContent, ChatCompletionRequestUserMessage,
    ChatCompletionRequestUserMessageContent, ChatCompletionResponseMessage, ChatCompletionTool,
    ChatCompletionTools, CreateChatCompletionRequestArgs, FunctionCall, FunctionObject,
};
use async_openai::Client;
use async_trait::async_trait;

use super::config;
use super::{
    ChatMessage, ChatRequest, ChatResponse, LlmError, Result, TextModel, ToolCall, ToolSpec,
};

pub struct OpenAiCompatibleModel {
    client: Client<OpenAIConfig>,
    model: String,
    timeout: Duration,
}

impl OpenAiCompatibleModel {
    pub fn from_config() -> Result<Self> {
        if config::DASHSCOPE_API_KEY.is_empty() {
            return Err(LlmError::Config("DASHSCOPE_API_KEY"));
        }

        // 必须注入自建 TLS 的客户端：默认客户端会走 rustls-platform-verifier，
        // 那玩意在安卓上没做 JNI 初始化会 panic
        let http = crate::voice::tls::http_client()
            .map_err(|e| LlmError::Transport(format!("构造 HTTP 客户端失败：{e}")))?;

        let openai = OpenAIConfig::new()
            .with_api_base(config::BASE_URL)
            .with_api_key(config::DASHSCOPE_API_KEY);

        Ok(Self {
            client: Client::build(http, openai),
            model: config::MODEL.to_string(),
            timeout: Duration::from_secs(config::TIMEOUT_SECS),
        })
    }
}

#[async_trait]
impl TextModel for OpenAiCompatibleModel {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let messages: Vec<ChatCompletionRequestMessage> =
            request.messages.into_iter().map(to_message).collect();

        let mut builder = CreateChatCompletionRequestArgs::default();
        builder.model(self.model.as_str()).messages(messages);
        if !request.tools.is_empty() {
            // 空数组会被部分兼容端点当成参数错误，没有工具时干脆不带这个字段
            let tools: Vec<ChatCompletionTools> =
                request.tools.into_iter().map(to_tool).collect();
            builder.tools(tools);
        }
        let payload = builder
            .build()
            .map_err(|e| LlmError::Transport(format!("组装请求失败：{e}")))?;

        let response = tokio::time::timeout(self.timeout, self.client.chat().create(payload))
            .await
            .map_err(|_| LlmError::Timeout(config::TIMEOUT_SECS))?
            .map_err(|e| LlmError::Transport(e.to_string()))?;

        let message = response
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message)
            .ok_or(LlmError::Empty)?;

        Ok(from_response(message))
    }
}

fn to_message(message: ChatMessage) -> ChatCompletionRequestMessage {
    match message {
        ChatMessage::System(text) => {
            ChatCompletionRequestMessage::System(ChatCompletionRequestSystemMessage {
                content: ChatCompletionRequestSystemMessageContent::Text(text),
                name: None,
            })
        }
        ChatMessage::User(text) => {
            ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
                content: ChatCompletionRequestUserMessageContent::Text(text),
                name: None,
            })
        }
        ChatMessage::Assistant {
            content,
            tool_calls,
        } => {
            ChatCompletionRequestMessage::Assistant(ChatCompletionRequestAssistantMessage {
                content: content.map(ChatCompletionRequestAssistantMessageContent::Text),
                // 用 Default 补齐其余字段：结构里有个 deprecated 的 function_call，
                // 显式写出来会引来 warning
                tool_calls: (!tool_calls.is_empty()).then(|| {
                    tool_calls
                        .into_iter()
                        .map(|call| {
                            ChatCompletionMessageToolCalls::Function(
                                ChatCompletionMessageToolCall {
                                    id: call.id,
                                    function: FunctionCall {
                                        name: call.name,
                                        arguments: call.arguments,
                                    },
                                },
                            )
                        })
                        .collect()
                }),
                ..Default::default()
            })
        }
        ChatMessage::Tool { call_id, content } => {
            ChatCompletionRequestMessage::Tool(ChatCompletionRequestToolMessage {
                content: ChatCompletionRequestToolMessageContent::Text(content),
                tool_call_id: call_id,
            })
        }
    }
}

fn to_tool(spec: ToolSpec) -> ChatCompletionTools {
    ChatCompletionTools::Function(ChatCompletionTool {
        function: FunctionObject {
            name: spec.name,
            description: Some(spec.description),
            parameters: Some(spec.parameters),
            // 不开 strict：百炼兼容模式对 structured outputs 支持不稳定，
            // 参数合法性由我们自己在 agent 里校验
            strict: None,
        },
    })
}

fn from_response(message: ChatCompletionResponseMessage) -> ChatResponse {
    // 先留一份原文再拆结构：模型跑偏时日志里只有这个能看
    let raw = serde_json::to_string(&message).unwrap_or_default();

    ChatResponse {
        raw,
        content: message
            .content
            .filter(|text| !text.trim().is_empty())
            .map(|text| text.trim().to_string()),
        tool_calls: message
            .tool_calls
            .unwrap_or_default()
            .into_iter()
            .filter_map(|call| match call {
                ChatCompletionMessageToolCalls::Function(function) => Some(ToolCall {
                    id: function.id,
                    name: function.function.name,
                    arguments: function.function.arguments,
                }),
                // 我们只声明 function 工具，custom 只能是模型跑偏
                ChatCompletionMessageToolCalls::Custom(_) => None,
            })
            .collect(),
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app llm::`
Expected: `test result: ok. 10 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/llm src-tauri/src/lib.rs
git commit -m "feat(llm): 上移 LLM 层并支持多轮与工具调用"
```

---

### Task 5: `voice/` — 退回纯 ASR

语音链路只做「听 → 唤醒 → 拿到命令句」，命令句原文经一个 `mpsc::Sender<String>` 交给 Agent。理由：命令解释现在需要现场上下文和工具清单，那些东西属于 `platform/robot/`，`voice/` 不该知道。

`VoiceEvent::Command` 的载荷从三段调试信息缩成 `{ text }`；模型这一侧的可观测性改由 `platform` 的日志面板承担（Task 11 会往那里写 `LogEntry`）。

`Stage::Llm` 与 `VoiceError::Llm` 一并删除——语音链路已经不会产生 LLM 错误。

**Files:**
- Delete: `src-tauri/src/voice/llm/`（整个目录）
- Modify: `src-tauri/src/voice/mod.rs:1-10`
- Modify: `src-tauri/src/voice/config.rs:28-37`
- Modify: `src-tauri/src/voice/error.rs`
- Modify: `src-tauri/src/voice/events.rs`
- Modify: `src-tauri/src/voice/session.rs`
- Modify: `src-tauri/src/voice/commands.rs`

- [ ] **Step 1: 改事件契约的测试**

先钉住新契约。改 `src-tauri/src/voice/events.rs` 的测试：把 `command_event_matches_the_contract` 整个替换成

```rust
    #[test]
    fn command_event_carries_only_the_raw_utterance() {
        // 命令怎么解释是 platform/robot 的事，voice 只负责把原句递出去
        assert_eq!(
            json_of(VoiceEvent::Command {
                text: "翻到下一页".to_string(),
            }),
            json!({ "type": "command", "text": "翻到下一页" })
        );
    }
```

并把 `error_event_carries_the_stage_of_its_error` 之后追加一条，钉住 stage 只剩三种：

```rust
    #[test]
    fn error_stages_no_longer_include_llm() {
        let stages = serde_json::to_string(&[Stage::Permission, Stage::Audio, Stage::Asr]).unwrap();
        assert_eq!(stages, r#"["permission","audio","asr"]"#);
    }
```

Run: `cd src-tauri && cargo test -p app voice::events`
Expected: 编译失败，`struct variant VoiceEvent::Command has no field named text`

- [ ] **Step 2: 改事件定义**

改 `src-tauri/src/voice/events.rs`：删掉 `use super::llm::prompt::VoiceCommand;`，把 `Command` 变体换成

```rust
    /// 唤醒后收到的命令句原文。怎么解释它由 `platform::robot` 决定。
    Command {
        text: String,
    },
```

- [ ] **Step 3: 删掉 LLM 错误分类**

改 `src-tauri/src/voice/error.rs`：`Stage` 去掉 `Llm`，`VoiceError` 去掉 `Llm(String)` 变体与 `stage()` 里对应的那行。同时删掉文件头注释里提 LLM 的那半句与 `stage_serializes_to_frontend_literals` 里断言 `Stage::Llm` 的那一行。改完的 `Stage` 与 `stage()`：

```rust
//! 错误按「前端需要区别对待的环节」分类：麦克风没权限要引导用户去设置，
//! 识别服务掉线只需重开一次会话，两者不能糊成同一个 message。

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Permission,
    Audio,
    Asr,
}
```

```rust
impl VoiceError {
    pub fn stage(&self) -> Stage {
        match self {
            Self::PermissionDenied => Stage::Permission,
            Self::Audio(_) => Stage::Audio,
            Self::Asr(_) => Stage::Asr,
            Self::Config { stage, .. } => *stage,
        }
    }
}
```

- [ ] **Step 4: 删掉 LLM 相关配置常量**

改 `src-tauri/src/voice/config.rs`：删掉 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_TIMEOUT_SECS` 三个常量及其注释（它们已经搬到 `src/llm/config.rs`）。`DASHSCOPE_API_KEY` 留着——ASR 还要用。

- [ ] **Step 5: 会话改成把命令句投给通道**

改 `src-tauri/src/voice/session.rs`。删掉 `use super::llm::{prompt, TextModel};`，`SessionDeps` 换成

```rust
pub struct SessionDeps {
    pub audio: Arc<dyn AudioSource>,
    pub asr: Arc<dyn AsrProvider>,
    /// 命令句的投递口。没有接收方（比如机器人还没授权）时投递失败，
    /// 只丢这一条命令，麦克风继续开着。
    pub commands: Option<mpsc::Sender<String>>,
}
```

`run` 里把 `deps.llm` 换成 `deps.commands.clone()` 传给 `pump`：

```rust
    let outcome = pump(
        deps.commands.clone(),
        events,
        &mut asr,
        &mut frames,
        &mut asr_rx,
        &mut stop,
    )
    .await;
```

`pump` 的签名与转发同步改：

```rust
async fn pump(
    commands: Option<mpsc::Sender<String>>,
    events: &Channel<VoiceEvent>,
    asr: &mut Box<dyn AsrSession>,
    frames: &mut mpsc::Receiver<Vec<u8>>,
    asr_rx: &mut mpsc::Receiver<AsrEvent>,
    stop: &mut oneshot::Receiver<()>,
) -> Result<()> {
    let mut detector = WakeDetector::new(
        config::WAKE_WORD,
        Duration::from_secs(config::ARMED_TIMEOUT_SECS),
    );

    loop {
        tokio::select! {
            _ = &mut *stop => return Ok(()),

            frame = frames.recv() => match frame {
                Some(pcm) => asr.send_audio(pcm).await?,
                None => return Err(VoiceError::Audio("录音数据流已中断".to_string())),
            },

            event = asr_rx.recv() => match event {
                Some(event) => {
                    if let Some(error) = handle_asr_event(event, commands.as_ref(), events, &mut detector) {
                        return Err(error);
                    }
                }
                None => return Err(VoiceError::Asr("识别事件流已中断".to_string())),
            },
        }
    }
}
```

`handle_asr_event` 的 `WakeOutcome::Command` 分支改成投递，并删掉文件末尾的 `resolve_command` 整个函数：

```rust
/// 返回 `Some` 表示这是个终止会话的错误。
fn handle_asr_event(
    event: AsrEvent,
    commands: Option<&mpsc::Sender<String>>,
    events: &Channel<VoiceEvent>,
    detector: &mut WakeDetector,
) -> Option<VoiceError> {
    match event {
        AsrEvent::Started => None,

        AsrEvent::Partial { text, index } => {
            let _ = events.send(VoiceEvent::Transcript {
                text,
                index,
                is_final: false,
            });
            None
        }

        AsrEvent::Final { text, index } => {
            let _ = events.send(VoiceEvent::Transcript {
                text: text.clone(),
                index,
                is_final: true,
            });

            match detector.on_final(&text, Instant::now()) {
                WakeOutcome::None => {}
                WakeOutcome::Awakened => {
                    let _ = events.send(VoiceEvent::Wake);
                }
                WakeOutcome::Command(utterance) => {
                    let _ = events.send(VoiceEvent::Wake);
                    let _ = events.send(VoiceEvent::Command {
                        text: utterance.clone(),
                    });
                    dispatch_command(commands, utterance);
                }
            }
            None
        }

        AsrEvent::Finished => Some(VoiceError::Asr("识别任务已被服务端结束".to_string())),
        AsrEvent::Failed { message } => Some(VoiceError::Asr(message)),
    }
}

/// 用 `try_send` 而不是 `send`：这里在音频泵的线程上，
/// 阻塞等 Agent 腾出位置会让麦克风的帧堆积起来。
fn dispatch_command(commands: Option<&mpsc::Sender<String>>, utterance: String) {
    let Some(sender) = commands else {
        log::warn!("收到命令「{utterance}」但没有接收方，可能机器人尚未授权");
        return;
    };
    if let Err(error) = sender.try_send(utterance) {
        log::warn!("命令投递失败：{error}");
    }
}
```

- [ ] **Step 6: 命令入口改成从 `PlatformState` 取通道**

改 `src-tauri/src/voice/commands.rs`：删掉 `use super::llm::openai_sdk::OpenAiCompatibleModel;`，`start_asr` 从平台状态里取当前的命令通道。整个文件改成：

```rust
//! 暴露给前端的两个命令。

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::asr::dashscope_ws::DashScopeWs;
use super::audio::android::AndroidMic;
use super::events::VoiceEvent;
use super::session::{self, SessionDeps, SessionHandle};
use crate::platform::state::PlatformState;

#[derive(Default)]
pub struct VoiceState(Mutex<Option<SessionHandle>>);

#[tauri::command]
pub async fn start_asr<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
    on_event: Channel<VoiceEvent>,
) -> Result<(), String> {
    let mut slot = state.0.lock().await;
    // 重复启动直接报错而不是静默重启：静默重启会让前端以为还是原来那个会话。
    // 已经自行结束的会话不算占位，否则一次识别服务掉线就再也起不来了。
    if slot.as_ref().is_some_and(|session| !session.is_finished()) {
        return Err("语音会话已在运行".to_string());
    }

    // 机器人可能还没授权，此时没有接收方，命令句只进事件流供前端展示
    let commands = app
        .try_state::<Arc<PlatformState>>()
        .and_then(|platform| platform.command_sender());

    let deps = SessionDeps {
        audio: Arc::new(AndroidMic::new(app.clone())),
        asr: Arc::new(DashScopeWs::from_config().map_err(|e| e.to_string())?),
        commands,
    };

    *slot = Some(session::spawn(deps, on_event));
    Ok(())
}

#[tauri::command]
pub async fn stop_asr(state: State<'_, VoiceState>) -> Result<(), String> {
    let handle = state.0.lock().await.take();
    if let Some(handle) = handle {
        handle.shutdown().await;
    }
    Ok(())
}
```

`command_sender()` 在 Task 6 加到 `PlatformState` 上，所以这一步之后到 Task 6 之前 app crate 编译不过——两个任务连着做，中间不提交。

- [ ] **Step 7: 删掉旧的 llm 目录并去掉模块声明**

```bash
git rm -r src-tauri/src/voice/llm
```

改 `src-tauri/src/voice/mod.rs`，删掉 `pub mod llm;` 那一行：

```rust
pub mod asr;
pub mod audio;
pub mod commands;
pub mod config;
pub mod error;
pub mod events;
pub mod session;
pub mod tls;
pub mod wake;
```

- [ ] **Step 8: 暂不跑测试，直接进 Task 6**

此时 `PlatformState::command_sender` 还不存在，`cargo test` 必然失败。Task 6 补完后一起验证并提交。

---

### Task 6: `platform/` 骨架 — 配置、状态、事件与 command 的移动端扩展

三件事：

1. 两个角色配置结构去掉 `#[cfg]`。现在 `RobotConfig` 只在 `cfg(mobile)` 下存在，桌面上跑 `cargo test` 就测不到它，而机器人端的所有单测都要在桌面跑。只有 `RoleConfig` 别名保留编译期分支。
2. `PlatformState` 多两个格位：命令通道的发送端（`voice` 从这里取）与 Device Flow 展示信息（前端从这里取）。
3. 加 `robot_device_flow_state` command 并在移动端注册。

**Files:**
- Modify: `src-tauri/src/platform/config.rs:39-83`
- Modify: `src-tauri/src/platform/events.rs`
- Modify: `src-tauri/src/platform/state.rs`
- Modify: `src-tauri/src/platform/commands.rs`
- Modify: `src-tauri/src/lib.rs:63-75`

- [ ] **Step 1: 写失败的测试**

`src-tauri/src/platform/config.rs` 的测试模块里，把三个 `#[cfg(desktop)]` 属性从 `大屏配置要求填齐凭证`、`大屏配置序列化成扁平的_camel_case`、`缺字段的旧配置反序列化成默认值而不是报错` 上删掉，并在末尾追加两条机器人配置的测试：

```rust
    #[test]
    fn 机器人配置要求填齐设备凭证() {
        let complete = RobotConfig {
            base: base(),
            device_no: "ROBOT-001".into(),
            device_secret: "s3cret".into(),
        };
        assert!(complete.is_complete());
        assert!(!RobotConfig {
            device_no: String::new(),
            ..complete.clone()
        }
        .is_complete());
        assert!(!RobotConfig {
            device_secret: "  ".into(),
            ..complete
        }
        .is_complete());
    }

    #[test]
    fn 机器人配置序列化成扁平的_camel_case() {
        let value = serde_json::to_value(RobotConfig {
            base: base(),
            device_no: "ROBOT-001".into(),
            device_secret: "s3cret".into(),
        })
        .unwrap();

        assert_eq!(value["host"], "8.163.33.11");
        assert_eq!(value["deviceNo"], "ROBOT-001");
        assert_eq!(value["deviceSecret"], "s3cret");
        assert!(value.get("device_no").is_none(), "不能出现 snake_case 字段");
    }
```

`src-tauri/src/platform/events.rs` 的测试模块末尾追加：

```rust
    #[test]
    fn 授权信息用_camel_case_并带上完整地址() {
        let value = serde_json::to_value(DeviceFlowInfo {
            user_code: "H7K2QP".into(),
            verification_uri: "http://8.163.33.11:8084/device".into(),
            verification_uri_complete: "http://8.163.33.11:8084/device?code=H7K2QP".into(),
            expires_at: 1_754_800_000_000,
        })
        .unwrap();

        assert_eq!(value["userCode"], "H7K2QP");
        assert_eq!(value["verificationUri"], "http://8.163.33.11:8084/device");
        assert_eq!(
            value["verificationUriComplete"],
            "http://8.163.33.11:8084/device?code=H7K2QP"
        );
        assert_eq!(value["expiresAt"], 1_754_800_000_000_i64);
        assert!(value.get("user_code").is_none(), "不能出现 snake_case 字段");
    }
```

`src-tauri/src/platform/state.rs` 末尾新增测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::events::DeviceFlowInfo;

    fn info() -> DeviceFlowInfo {
        DeviceFlowInfo {
            user_code: "H7K2QP".into(),
            verification_uri: "http://h/device".into(),
            verification_uri_complete: "http://h/device?code=H7K2QP".into(),
            expires_at: 1,
        }
    }

    #[test]
    fn 没接线时取不到命令通道() {
        assert!(PlatformState::default().command_sender().is_none());
    }

    #[tokio::test]
    async fn 命令通道装上后能取到并投递() {
        let state = PlatformState::default();
        let (tx, mut rx) = tokio::sync::mpsc::channel(4);
        state.set_command_sender(Some(tx));

        let sender = state.command_sender().expect("应该能取到通道");
        sender.try_send("翻页".to_string()).unwrap();

        assert_eq!(rx.recv().await.as_deref(), Some("翻页"));
    }

    #[test]
    fn 清掉命令通道后取不到() {
        let state = PlatformState::default();
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        state.set_command_sender(Some(tx));
        state.set_command_sender(None);
        assert!(state.command_sender().is_none());
    }

    #[test]
    fn 授权信息可存可清() {
        let state = PlatformState::default();
        assert!(state.device_flow().is_none());

        state.set_device_flow(Some(info()));
        assert_eq!(state.device_flow().unwrap().user_code, "H7K2QP");

        state.set_device_flow(None);
        assert!(state.device_flow().is_none());
    }
}
```

Run: `cd src-tauri && cargo test -p app platform::`
Expected: 编译失败，`cannot find type DeviceFlowInfo` / `no method named command_sender`

- [ ] **Step 2: 角色配置去掉编译期分支**

改 `src-tauri/src/platform/config.rs`：删掉 `ScreenAppConfig`、`impl ScreenAppConfig`、`RobotConfig`、`impl RobotConfig` 这四处上方的 `#[cfg(desktop)]` / `#[cfg(mobile)]`，并给它们各加一行说明。`RoleConfig` 别名上的 `#[cfg]` 保留：

```rust
/// 两个角色的配置结构在两端都编译：桌面上跑测试也要能覆盖机器人那份。
/// 真正的角色分支只在下面的 `RoleConfig` 别名上。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScreenAppConfig {
```

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RobotConfig {
```

未被 `RoleConfig` 选中的那个结构在对应平台上会触发 dead_code 警告，在两个结构体上各加一条 `#[allow(dead_code)]`：

```rust
#[allow(dead_code)]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RobotConfig {
```

`ScreenAppConfig` 同理加 `#[allow(dead_code)]`。

- [ ] **Step 3: 加 `DeviceFlowInfo`**

改 `src-tauri/src/platform/events.rs`，在 `ConnectionInfo` 的 `impl Default` 之后插入：

```rust
/// Device Flow 待授权信息。老师看着 `user_code` 或扫二维码去网页确认。
/// 只在机器人端产生，字段变更必须同步修改 src/lib/platform-api/types.ts。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowInfo {
    pub user_code: String,
    pub verification_uri: String,
    /// 已经带上 user_code 的完整地址，二维码编码的就是这个
    pub verification_uri_complete: String,
    /// 毫秒时间戳。前端据此显示剩余时间，过期后不必再等后端
    pub expires_at: i64,
}
```

- [ ] **Step 4: `PlatformState` 加两个格位**

改 `src-tauri/src/platform/state.rs`。文件头的 `use` 补上 `DeviceFlowInfo`：

```rust
use crate::platform::events::{
    ConnectionInfo, ConnectionState, DeviceFlowInfo, LogEntry, LogLevel, LogSource,
    CONNECTION_EVENT, LOG_EVENT,
};
```

`Inner` 加两个字段：

```rust
#[derive(Default)]
struct Inner {
    info: ConnectionInfo,
    logs: VecDeque<LogEntry>,
    seq: u64,
    runner: Option<tokio::task::JoinHandle<()>>,
    /// 语音命令的投递口。机器人授权成功后装上，断开时清掉
    commands: Option<tokio::sync::mpsc::Sender<String>>,
    /// 待授权信息，仅机器人端有
    device_flow: Option<DeviceFlowInfo>,
}
```

`impl PlatformState` 里追加四个方法（放在 `swap_runner` 之后）：

```rust
    /// 装上/清掉命令通道。`None` 表示当前没有能接命令的 Agent。
    pub fn set_command_sender(&self, sender: Option<tokio::sync::mpsc::Sender<String>>) {
        self.inner().commands = sender;
    }

    /// 取一份发送端克隆。`voice` 每次开会话时取一次。
    pub fn command_sender(&self) -> Option<tokio::sync::mpsc::Sender<String>> {
        self.inner().commands.clone()
    }

    pub fn set_device_flow(&self, info: Option<DeviceFlowInfo>) {
        self.inner().device_flow = info;
    }

    pub fn device_flow(&self) -> Option<DeviceFlowInfo> {
        self.inner().device_flow.clone()
    }
```

这四个方法都要拿锁，把取锁抽成一个私有方法放在 `impl` 开头，其余方法暂时不动（它们各自 `lock()` 的写法保持原样，免得这个任务的 diff 铺开到无关代码）：

```rust
    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("状态锁被毒化")
    }
```

- [ ] **Step 5: 加 command 并在移动端注册**

改 `src-tauri/src/platform/commands.rs`。`use` 补上 `DeviceFlowInfo`：

```rust
use crate::platform::events::{
    ConnectionInfo, ConnectionState, DeviceFlowInfo, LogEntry, LogLevel, LogSource,
};
```

在 `platform_recent_logs` 之后插入：

```rust
/// 机器人待授权信息。没在等授权时返回 null。
#[cfg(mobile)]
#[tauri::command]
pub fn robot_device_flow_state(state: State<'_, Arc<PlatformState>>) -> Option<DeviceFlowInfo> {
    state.device_flow()
}
```

桌面端不注册这个 command，`DeviceFlowInfo` 的 import 在桌面上会变成未使用，所以桌面下不引它——把上面那行 `use` 写成两段：

```rust
use crate::platform::events::{ConnectionInfo, ConnectionState, LogEntry, LogLevel, LogSource};
#[cfg(mobile)]
use crate::platform::events::DeviceFlowInfo;
```

改 `src-tauri/src/lib.rs` 的移动端 handler，在 `platform::commands::platform_recent_logs,` 之后加一行：

```rust
    platform::commands::platform_recent_logs,
    platform::commands::robot_device_flow_state,
  ]);
```

- [ ] **Step 6: 跑测试确认通过**

Task 5 改的 `voice/` 到这一步才补齐了依赖，两边一起验证。

Run: `cd src-tauri && cargo test -p app`
Expected: 全绿。`voice::events` 里的 command 契约测试与 `platform::state` 的四条新测试都通过

- [ ] **Step 7: 确认没有残留的 LLM 引用**

Run: `cd src-tauri && rg -n "voice::llm|VoiceCommand|Stage::Llm" src`
Expected: 无输出

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src
git commit -m "refactor(voice): 退回纯 ASR 并为机器人扩展 platform 骨架"
```

---

### Task 7: `platform/robot/context.rs` — 现场上下文与提示词段落

机器人拿不到 HTTP 上下文接口（设备凭证换不到那些权限），现场信息只能来自登录快照与事件。`render()` 是纯函数，缺什么就明说「无法获取」——不写这段模型会自己编出一份学生名单。

`robot` 模块**不加 `#[cfg(mobile)]`**：宿主机是桌面 target，包起来的话这些单测在 `cargo test` 里根本不会编译。只有 command 的注册按平台分。

**Files:**
- Create: `src-tauri/src/platform/robot/mod.rs`
- Create: `src-tauri/src/platform/robot/context.rs`
- Modify: `src-tauri/src/platform/mod.rs:1-7`

- [ ] **Step 1: 建模块并登记**

新建 `src-tauri/src/platform/robot/mod.rs`：

```rust
//! 机器人角色。桌面上也编译，因为单测跑在宿主机上；
//! 真正的平台分支只在 command 注册与 `run_role` 上。

pub mod context;
```

改 `src-tauri/src/platform/mod.rs` 的模块声明区，在 `pub mod events;` 之后加一行：

```rust
pub mod commands;
pub mod config;
pub mod events;
pub mod robot;
pub mod state;
```

- [ ] **Step 2: 写失败的测试**

新建 `src-tauri/src/platform/robot/context.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use teaching_platform::ws::event::ServerEvent;

    fn full_snapshot() -> Snapshot {
        Snapshot::from_value(json!({
            "conn_id": "c1", "client_type": "robot",
            "lesson_id": 88, "classroom_id": 1,
            "lesson": { "id": 88, "title": "第 5 讲 决策树", "status": "ongoing",
                        "course_id": 12, "course_name": "机器学习导论" },
            "screen_state": { "view": "ppt", "courseware_id": 17, "page": 5, "page_count": 32 },
            "attendance_open": true,
            "sign_in": { "status": "open", "code": "7K3M9Q", "signed": 31, "total": 45, "rate": 0.6889 }
        }))
        .unwrap()
    }

    fn store_with_everything() -> ContextStore {
        let mut store = ContextStore::default();
        store.apply_snapshot(&full_snapshot());
        store.apply_event(&ServerEvent::RollcallResult {
            names: vec!["李某".into(), "王某".into()],
        });
        store
    }

    #[test]
    fn 字段齐全时逐段渲染() {
        assert_eq!(
            store_with_everything().render(),
            "[当前现场]\n\
             教室 ID：1\n\
             课堂：第 5 讲 决策树（id=88，状态 ongoing）\n\
             课程：机器学习导论（id=12）\n\
             [大屏]\n\
             视图：ppt；当前课件 id=17，第 5 / 32 页\n\
             [签到]\n\
             开启中，已签到 31 / 45\n\
             [最近点名]\n\
             李某、王某\n\
             [无法获取]\n\
             授课教师、学生名单、课件页文本——当前设备凭证不支持查询，需要这些信息时请如实告知老师，不要编造。"
        );
    }

    #[test]
    fn 全空时只剩无法获取段() {
        let rendered = ContextStore::default().render();
        assert!(rendered.starts_with("[无法获取]"), "实际是 {rendered}");
        assert!(!rendered.contains("[大屏]"));
        assert!(!rendered.contains("[当前现场]"));
    }

    #[test]
    fn 没有课堂但有教室时保留当前现场段() {
        let mut store = ContextStore::default();
        store.apply_snapshot(
            &Snapshot::from_value(json!({ "classroom_id": 1, "lesson": null })).unwrap(),
        );
        let rendered = store.render();
        assert!(rendered.contains("[当前现场]\n教室 ID：1\n[无法获取]"), "实际是 {rendered}");
    }

    #[test]
    fn 课程名缺失时省略课程行() {
        let mut store = ContextStore::default();
        store.apply_snapshot(
            &Snapshot::from_value(json!({
                "classroom_id": 1,
                "lesson": { "id": 88, "title": "第 5 讲", "status": "ongoing" }
            }))
            .unwrap(),
        );
        let rendered = store.render();
        assert!(rendered.contains("课堂：第 5 讲（id=88，状态 ongoing）"));
        assert!(!rendered.contains("课程："), "实际是 {rendered}");
    }

    #[test]
    fn 大屏没有课件时只报视图() {
        let mut store = ContextStore::default();
        store.apply_event(&ServerEvent::ScreenStateChanged {
            state: ScreenState {
                view: "rollcall".into(),
                ..ScreenState::default()
            },
        });
        assert!(store.render().contains("[大屏]\n视图：rollcall\n"));
    }

    #[test]
    fn 大屏视图为空串时整段省略() {
        let mut store = ContextStore::default();
        store.apply_event(&ServerEvent::ScreenStateChanged {
            state: ScreenState::default(),
        });
        assert!(!store.render().contains("[大屏]"));
    }

    #[test]
    fn 签到关闭后报最终结果() {
        let mut store = ContextStore::default();
        store.apply_event(&ServerEvent::AttendanceClosed {
            sign_in: SignIn {
                status: "closed".into(),
                code: None,
                signed: 40,
                total: 45,
                rate: 0.8889,
            },
        });
        assert!(store.render().contains("[签到]\n已结束，最终 40 / 45\n"));
    }

    #[test]
    fn 签到状态认不出时原样报出() {
        let mut store = ContextStore::default();
        store.apply_event(&ServerEvent::AttendanceProgress {
            sign_in: SignIn {
                status: "paused".into(),
                code: None,
                signed: 3,
                total: 45,
                rate: 0.06,
            },
        });
        assert!(store.render().contains("[签到]\n状态 paused，已签到 3 / 45\n"));
    }

    #[test]
    fn 课堂开始事件换掉课堂并清空上一节课的现场() {
        let mut store = store_with_everything();
        store.apply_event(&ServerEvent::LessonStarted {
            lesson: teaching_platform::ws::event::LessonChange {
                lesson_id: Some(99),
                title: Some("第 6 讲 随机森林".into()),
                course_name: Some("机器学习导论".into()),
            },
        });

        let rendered = store.render();
        assert!(rendered.contains("课堂：第 6 讲 随机森林（id=99，状态 ongoing）"));
        // 上一节课的页码与签到不能留着，否则模型会拿旧页号去填 expect_page
        assert!(!rendered.contains("[大屏]"), "实际是 {rendered}");
        assert!(!rendered.contains("[签到]"));
        assert!(!rendered.contains("[最近点名]"));
    }

    #[test]
    fn 课堂结束事件清空课堂() {
        let mut store = store_with_everything();
        store.apply_event(&ServerEvent::LessonEnded {
            lesson: teaching_platform::ws::event::LessonChange::default(),
        });
        let rendered = store.render();
        assert!(!rendered.contains("课堂："), "实际是 {rendered}");
        assert!(rendered.contains("教室 ID：1"), "教室归属不随课堂结束消失");
    }

    #[test]
    fn 重连时快照覆盖旧状态并清掉最近点名() {
        let mut store = store_with_everything();
        store.apply_snapshot(&Snapshot::from_value(json!({ "classroom_id": 1 })).unwrap());

        let rendered = store.render();
        // 新连接无从知道上一条连接点了谁，留着就是给模型过期信息
        assert!(!rendered.contains("[最近点名]"), "实际是 {rendered}");
        assert!(!rendered.contains("课堂："));
    }

    #[test]
    fn 顶号与未知事件不改变上下文() {
        let mut store = store_with_everything();
        let before = store.render();
        store.apply_event(&ServerEvent::Kicked {
            reason: "别处登录".into(),
        });
        store.apply_event(&ServerEvent::Unknown {
            op: "quiz.publish".into(),
            data: json!({}),
        });
        assert_eq!(store.render(), before);
    }

    #[test]
    fn 当前页可被读出来供乐观锁使用() {
        assert_eq!(store_with_everything().current_page(), Some(5));
        assert_eq!(ContextStore::default().current_page(), None);
    }
}
```

Run: `cd src-tauri && cargo test -p app robot::context`
Expected: 编译失败，`cannot find type ContextStore in this scope`

- [ ] **Step 3: 写实现**

把下面内容加到 `src-tauri/src/platform/robot/context.rs` 的**测试模块之前**：

```rust
//! 机器人的现场上下文。只吃 WebSocket 给的东西：登录快照与事件。
//!
//! 设备凭证换不到 HTTP 上下文接口，授课教师、学生名单、课件页文本都查不了。
//! 这三项要在提示词里明说「无法获取」——不写模型就会自己编一份名单出来。

use std::fmt::Write as _;

use teaching_platform::ws::event::ServerEvent;
use teaching_platform::ws::snapshot::{LessonBrief, ScreenState, SignIn, Snapshot};

const UNAVAILABLE: &str = "[无法获取]\n授课教师、学生名单、课件页文本——当前设备凭证不支持查询，需要这些信息时请如实告知老师，不要编造。";

#[derive(Debug, Default)]
pub struct ContextStore {
    classroom_id: Option<i64>,
    lesson: Option<LessonBrief>,
    screen: Option<ScreenState>,
    sign_in: Option<SignIn>,
    /// 最近一次点名的姓名，支撑「他答对了」这类指代
    last_rollcall: Vec<String>,
}

impl ContextStore {
    /// 登录快照是全量的，直接覆盖。最近点名清空：
    /// 新连接无从知道上一条连接点了谁，留着就是给模型过期信息。
    pub fn apply_snapshot(&mut self, snapshot: &Snapshot) {
        self.classroom_id = snapshot.classroom_id;
        self.lesson = snapshot.lesson.clone();
        self.screen = snapshot.screen_state.clone();
        self.sign_in = snapshot.sign_in.clone();
        self.last_rollcall.clear();
    }

    pub fn apply_event(&mut self, event: &ServerEvent) {
        match event {
            ServerEvent::LessonStarted { lesson } => {
                self.lesson = Some(LessonBrief {
                    id: lesson.lesson_id.unwrap_or_default(),
                    title: lesson.title.clone().unwrap_or_default(),
                    // 事件载荷不带状态，能收到 started 就是在上课
                    status: "ongoing".to_string(),
                    course_id: None,
                    course_name: lesson.course_name.clone(),
                });
                self.clear_lesson_scoped();
            }
            ServerEvent::LessonEnded { .. } => {
                self.lesson = None;
                self.clear_lesson_scoped();
            }
            ServerEvent::ScreenStateChanged { state } => self.screen = Some(state.clone()),
            ServerEvent::AttendanceProgress { sign_in }
            | ServerEvent::AttendanceClosed { sign_in } => self.sign_in = Some(sign_in.clone()),
            ServerEvent::RollcallResult { names } => self.last_rollcall = names.clone(),
            // 顶号由连接循环处理；未知事件本就不该进上下文
            ServerEvent::Kicked { .. } | ServerEvent::Unknown { .. } => {}
        }
    }

    /// 换课堂时上一节课的页码与签到全部作废，
    /// 留着会让模型拿旧页号去填 `expect_page`，翻页直接被乐观锁拒掉。
    fn clear_lesson_scoped(&mut self) {
        self.screen = None;
        self.sign_in = None;
        self.last_rollcall.clear();
    }

    /// 当前 PPT 页码，供提示词与排查用。
    pub fn current_page(&self) -> Option<i64> {
        self.screen
            .as_ref()
            .filter(|screen| screen.page > 0)
            .map(|screen| screen.page)
    }

    /// 提示词里的现场段落。缺失的段整体省略，「无法获取」段永远保留。
    pub fn render(&self) -> String {
        let mut out = String::new();

        let mut site = String::new();
        if let Some(id) = self.classroom_id {
            let _ = writeln!(site, "教室 ID：{id}");
        }
        if let Some(lesson) = &self.lesson {
            let _ = writeln!(
                site,
                "课堂：{}（id={}，状态 {}）",
                lesson.title, lesson.id, lesson.status
            );
            if let Some(course) = lesson
                .course_name
                .as_deref()
                .filter(|name| !name.trim().is_empty())
            {
                match lesson.course_id {
                    Some(id) => {
                        let _ = writeln!(site, "课程：{course}（id={id}）");
                    }
                    None => {
                        let _ = writeln!(site, "课程：{course}");
                    }
                }
            }
        }
        if !site.is_empty() {
            out.push_str("[当前现场]\n");
            out.push_str(&site);
        }

        if let Some(screen) = self
            .screen
            .as_ref()
            .filter(|screen| !screen.view.trim().is_empty())
        {
            out.push_str("[大屏]\n");
            match (screen.courseware_id, screen.page_count) {
                (Some(id), count) if count > 0 => {
                    let _ = writeln!(
                        out,
                        "视图：{}；当前课件 id={id}，第 {} / {count} 页",
                        screen.view, screen.page
                    );
                }
                (Some(id), _) => {
                    let _ = writeln!(out, "视图：{}；当前课件 id={id}", screen.view);
                }
                (None, _) => {
                    let _ = writeln!(out, "视图：{}", screen.view);
                }
            }
        }

        if let Some(sign_in) = &self.sign_in {
            out.push_str("[签到]\n");
            match sign_in.status.as_str() {
                "open" => {
                    let _ = writeln!(
                        out,
                        "开启中，已签到 {} / {}",
                        sign_in.signed, sign_in.total
                    );
                }
                "closed" => {
                    let _ = writeln!(out, "已结束，最终 {} / {}", sign_in.signed, sign_in.total);
                }
                other => {
                    let _ = writeln!(
                        out,
                        "状态 {other}，已签到 {} / {}",
                        sign_in.signed, sign_in.total
                    );
                }
            }
        }

        if !self.last_rollcall.is_empty() {
            out.push_str("[最近点名]\n");
            let _ = writeln!(out, "{}", self.last_rollcall.join("、"));
        }

        out.push_str(UNAVAILABLE);
        out
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app robot::context`
Expected: `test result: ok. 13 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/platform/robot src-tauri/src/platform/mod.rs
git commit -m "feat(robot): 维护现场上下文并渲染提示词段落"
```

---

### Task 8: `platform/robot/tools.rs` — op 与工具名的双向映射

OpenAI 的函数名只允许 `[a-zA-Z0-9_-]`，op 名里的 `.` 不合法，所以 `ppt.goto` 声明成 `ppt_goto`。反向不能简单地把 `_` 换回 `.`：`app.open_url` 的工具名是 `app_open_url`，反替换会得到 `app.open.url`。必须查表，查表同时就是白名单——模型幻觉出的工具名自然落不到任何 op 上。

**Files:**
- Create: `src-tauri/src/platform/robot/tools.rs`
- Modify: `src-tauri/src/platform/robot/mod.rs`

- [ ] **Step 1: 登记模块**

改 `src-tauri/src/platform/robot/mod.rs`：

```rust
pub mod context;
pub mod tools;
```

- [ ] **Step 2: 写失败的测试**

新建 `src-tauri/src/platform/robot/tools.rs`，先只写测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn 每个_op_都能声明成一个工具() {
        assert_eq!(specs().len(), catalog::ROBOT_OPS.len());
    }

    #[test]
    fn 工具名把点换成下划线() {
        assert_eq!(tool_name("ppt.goto"), "ppt_goto");
        assert_eq!(tool_name("app.open_url"), "app_open_url");
    }

    #[test]
    fn 每个_op_都能原样往返() {
        for spec in catalog::ROBOT_OPS {
            let name = tool_name(spec.op);
            assert_eq!(
                op_of(&name),
                Some(spec.op),
                "{} 的工具名 {name} 反解不回来",
                spec.op
            );
        }
    }

    #[test]
    fn 带下划线的_op_不会被反解成多段() {
        // 简单地把 _ 换回 . 会得到 app.open.url，所以必须查表
        assert_eq!(op_of("app_open_url"), Some("app.open_url"));
        assert_eq!(op_of("screen_switch_view"), Some("screen.switch_view"));
    }

    #[test]
    fn 白名单外的工具名一律拒绝() {
        // 模型幻觉出的名字、带点的原始 op 名、空串都不该放过
        for name in ["ppt_burn", "ppt.goto", "", "PPT_GOTO"] {
            assert_eq!(op_of(name), None, "{name} 不该被接受");
        }
    }

    #[test]
    fn 工具名只含_openai_允许的字符且不超长() {
        for spec in specs() {
            assert!(
                spec.name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
                "{} 含非法字符",
                spec.name
            );
            assert!(spec.name.len() <= 64, "{} 超过 64 字符", spec.name);
        }
    }

    #[test]
    fn 每个工具都带描述与_object_参数() {
        for spec in specs() {
            assert!(!spec.description.trim().is_empty(), "{} 缺描述", spec.name);
            assert_eq!(
                spec.parameters["type"], "object",
                "{} 的参数不是 object",
                spec.name
            );
            assert!(
                spec.parameters.get("properties").is_some_and(Value::is_object),
                "{} 的参数缺 properties",
                spec.name
            );
        }
    }

    #[test]
    fn 参数就是_catalog_里那份_schema() {
        let goto = specs()
            .into_iter()
            .find(|spec| spec.name == "ppt_goto")
            .expect("应有 ppt_goto");
        let expected: Value =
            serde_json::from_str(catalog::find("ppt.goto").unwrap().params_schema).unwrap();
        assert_eq!(goto.parameters, expected);
    }
}
```

Run: `cd src-tauri && cargo test -p app robot::tools`
Expected: 编译失败，`cannot find function specs in this scope`

- [ ] **Step 3: 写实现**

把下面内容加到 `src-tauri/src/platform/robot/tools.rs` 的**测试模块之前**：

```rust
//! `catalog::ROBOT_OPS` 与 LLM 工具清单之间的翻译。
//!
//! 反向映射用查表而不是字符串替换：`app.open_url` 的工具名是 `app_open_url`，
//! 把 `_` 换回 `.` 会得到 `app.open.url`。查表顺便就是白名单——
//! 模型幻觉出来的工具名落不到任何 op 上。

use serde_json::{json, Value};
use teaching_platform::ws::catalog;

use crate::llm::ToolSpec;

/// op → 工具名。OpenAI 的函数名不允许 `.`。
pub fn tool_name(op: &str) -> String {
    op.replace('.', "_")
}

/// 工具名 → op。不在清单里返回 `None`。
pub fn op_of(tool: &str) -> Option<&'static str> {
    catalog::ROBOT_OPS
        .iter()
        .map(|spec| spec.op)
        .find(|op| tool_name(op) == tool)
}

/// 全部 22 个工具的声明，每轮请求都带上。
pub fn specs() -> Vec<ToolSpec> {
    catalog::ROBOT_OPS
        .iter()
        .map(|spec| ToolSpec {
            name: tool_name(spec.op),
            description: spec.summary.to_string(),
            // catalog.rs 的单测已经钉住每条 schema 都是合法 JSON，
            // 这里的兜底只是不想为一条坏 schema 让整个机器人起不来
            parameters: serde_json::from_str(spec.params_schema).unwrap_or_else(|e| {
                log::error!("{} 的参数 schema 无法解析：{e}", spec.op);
                json!({ "type": "object", "properties": {}, "additionalProperties": false })
            }),
        })
        .collect()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app robot::tools`
Expected: `test result: ok. 8 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/platform/robot
git commit -m "feat(robot): op 与 LLM 工具名的双向映射"
```

---

### Task 9: `platform/robot/agent.rs` — 两轮工具循环与历史裁剪

一条 `cmd` 的完整处理：带工具问一次模型 → 没有 `tool_calls` 就直接是回复；有就串行执行、把结果回灌、不带工具再问一次要中文回复。

工具执行抽成 `ToolInvoker` trait，本文件的测试因此不需要真的 WebSocket。历史以「轮」为单位裁剪：OpenAI 协议要求 `tool_calls` 消息与它的 `tool` 结果成对出现，按条裁会留下孤儿消息，服务端直接 400。

`handle` 收的是**已经渲染好的**现场段落字符串而不是 `&ContextStore`：Task 11 里上下文放在读写锁后面，一次模型往返要好几秒，握着锁不放会挡住事件更新。

**Files:**
- Create: `src-tauri/src/platform/robot/agent.rs`
- Modify: `src-tauri/src/platform/robot/mod.rs`

- [ ] **Step 1: 登记模块**

改 `src-tauri/src/platform/robot/mod.rs`：

```rust
pub mod agent;
pub mod context;
pub mod tools;
```

- [ ] **Step 2: 写失败的测试**

新建 `src-tauri/src/platform/robot/agent.rs`，先只写测试。假模型按脚本吐响应并记下每次收到的请求，假执行器记下调用：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use crate::llm::LlmError;

    /// 按脚本回复的假模型，同时记下每次收到的（消息, 工具名）。
    struct ScriptedModel {
        script: Mutex<VecDeque<crate::llm::Result<ChatResponse>>>,
        seen: Mutex<Vec<(Vec<ChatMessage>, Vec<String>)>>,
    }

    impl ScriptedModel {
        fn new(script: Vec<crate::llm::Result<ChatResponse>>) -> Arc<Self> {
            Arc::new(Self {
                script: Mutex::new(script.into()),
                seen: Mutex::new(Vec::new()),
            })
        }

        fn round(&self, index: usize) -> (Vec<ChatMessage>, Vec<String>) {
            self.seen.lock().unwrap()[index].clone()
        }

        fn rounds(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
    }

    #[async_trait]
    impl TextModel for ScriptedModel {
        async fn chat(&self, request: ChatRequest) -> crate::llm::Result<ChatResponse> {
            self.seen.lock().unwrap().push((
                request.messages,
                request.tools.iter().map(|tool| tool.name.clone()).collect(),
            ));
            self.script
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(LlmError::Empty))
        }
    }

    /// 记下调用并按脚本返回的假执行器。
    struct RecordingInvoker {
        calls: Mutex<Vec<(String, Value)>>,
        result: std::result::Result<Value, ApiError>,
    }

    impl RecordingInvoker {
        fn ok() -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                result: Ok(json!({ "page": 6 })),
            }
        }

        fn failing(code: i32, message: &str) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                result: Err(ApiError {
                    code,
                    message: message.to_string(),
                }),
            }
        }

        fn calls(&self) -> Vec<(String, Value)> {
            self.calls.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl ToolInvoker for RecordingInvoker {
        async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError> {
            self.calls.lock().unwrap().push((op.to_string(), params));
            self.result.clone()
        }
    }

    fn reply(content: &str) -> crate::llm::Result<ChatResponse> {
        Ok(ChatResponse {
            content: Some(content.to_string()),
            tool_calls: Vec::new(),
            raw: format!(r#"{{"content":"{content}"}}"#),
        })
    }

    fn calls(name: &str, arguments: &str) -> crate::llm::Result<ChatResponse> {
        Ok(ChatResponse {
            content: None,
            tool_calls: vec![ToolCall {
                id: "call_1".to_string(),
                name: name.to_string(),
                arguments: arguments.to_string(),
            }],
            raw: String::from(r#"{"tool_calls":[...]}"#),
        })
    }

    /// 用真的 `ContextStore` 渲染，好让「系统提示带上现场段落」那条测试有意义。
    fn site() -> String {
        super::super::context::ContextStore::default().render()
    }

    fn tool_content(messages: &[ChatMessage]) -> String {
        messages
            .iter()
            .find_map(|message| match message {
                ChatMessage::Tool { content, .. } => Some(content.clone()),
                _ => None,
            })
            .expect("第二轮消息里应有工具结果")
    }

    #[tokio::test]
    async fn 模型不调工具时只问一次() {
        let model = ScriptedModel::new(vec![reply("现在是第 5 页")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("现在第几页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "现在是第 5 页");
        assert!(outcome.invoked.is_empty());
        assert_eq!(model.rounds(), 1);
        assert!(invoker.calls().is_empty());
    }

    #[tokio::test]
    async fn 第一轮带工具第二轮不带() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", r#"{"expect_page":5}"#),
            reply("已经翻到第 6 页"),
        ]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "已经翻到第 6 页");
        assert_eq!(outcome.invoked, vec!["ppt.next".to_string()]);
        assert_eq!(
            invoker.calls(),
            vec![("ppt.next".to_string(), json!({ "expect_page": 5 }))]
        );

        let (_, first_tools) = model.round(0);
        assert!(first_tools.contains(&"ppt_next".to_string()));
        let (second_messages, second_tools) = model.round(1);
        // 第二轮再给工具，模型容易又调一次，把 PPT 翻两页
        assert!(second_tools.is_empty());
        assert!(tool_content(&second_messages).contains(r#""ok":true"#));
    }

    #[tokio::test]
    async fn 工具执行失败时把后端中文交给模型() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", r#"{"expect_page":3}"#),
            reply("页码已经变了，我重新看一下"),
        ]);
        let invoker = RecordingInvoker::failing(40007, "当前页已变化");
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.reply, "页码已经变了，我重新看一下");
        let (second_messages, _) = model.round(1);
        let content = tool_content(&second_messages);
        assert!(content.contains(r#""ok":false"#));
        assert!(content.contains("当前页已变化"));
        assert!(content.contains("40007"));
    }

    #[tokio::test]
    async fn 幻觉出的工具名不执行只回不支持() {
        let model = ScriptedModel::new(vec![calls("ppt_burn", "{}"), reply("这个我做不到")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("烧掉课件", &site(), &invoker).await.unwrap();

        assert!(invoker.calls().is_empty(), "白名单外的工具不能真发出去");
        assert!(outcome.invoked.is_empty());
        let content = tool_content(&model.round(1).0);
        assert!(content.contains("不支持的指令"), "实际是 {content}");
    }

    #[tokio::test]
    async fn 非法参数按空参数执行() {
        let model = ScriptedModel::new(vec![calls("ppt_next", "{\"expect_page\":"), reply("好的")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        agent.handle("下一页", &site(), &invoker).await.unwrap();

        // 丢掉整条指令还不如让服务端的参数校验去报错，那样日志里能看出原因
        assert_eq!(invoker.calls(), vec![("ppt.next".to_string(), json!({}))]);
    }

    #[tokio::test]
    async fn 参数不是对象时也按空参数执行() {
        let model = ScriptedModel::new(vec![calls("tts_stop", "\"停\""), reply("好的")]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        agent.handle("别念了", &site(), &invoker).await.unwrap();

        assert_eq!(invoker.calls(), vec![("tts.stop".to_string(), json!({}))]);
    }

    #[tokio::test]
    async fn 第二轮失败时指令已执行仍给兜底回复() {
        let model = ScriptedModel::new(vec![
            calls("ppt_next", "{}"),
            Err(LlmError::Timeout(15)),
        ]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model.clone());

        let outcome = agent.handle("下一页", &site(), &invoker).await.unwrap();

        assert_eq!(outcome.invoked, vec!["ppt.next".to_string()]);
        assert!(!outcome.reply.trim().is_empty(), "得有话可播");
    }

    #[tokio::test]
    async fn 第一轮失败时整条命令丢弃() {
        let model = ScriptedModel::new(vec![Err(LlmError::Timeout(15))]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model);

        assert!(agent.handle("下一页", &site(), &invoker).await.is_err());
        assert!(invoker.calls().is_empty());
    }

    #[tokio::test]
    async fn 模型没给回复时用兜底文案() {
        let model = ScriptedModel::new(vec![Ok(ChatResponse::default())]);
        let invoker = RecordingInvoker::ok();
        let mut agent = Agent::new(model);

        let outcome = agent.handle("嗯", &site(), &invoker).await.unwrap();
        assert!(!outcome.reply.trim().is_empty());
    }

    #[tokio::test]
    async fn 系统提示带上现场段落与工具约束() {
        let model = ScriptedModel::new(vec![reply("好")]);
        let mut agent = Agent::new(model.clone());
        agent
            .handle("现在第几页", &site(), &RecordingInvoker::ok())
            .await
            .unwrap();

        let ChatMessage::System(system) = &model.round(0).0[0] else {
            panic!("首条消息必须是 system");
        };
        assert!(system.contains("[无法获取]"), "要带上现场段落");
        assert!(system.contains("expect_page"), "要交代翻页的乐观锁约束");
    }

    #[tokio::test]
    async fn 上一轮对话会进入下一轮请求() {
        let model = ScriptedModel::new(vec![reply("第 5 页"), reply("第 5 页")]);
        let mut agent = Agent::new(model.clone());
        let invoker = RecordingInvoker::ok();

        agent.handle("现在第几页", &site(), &invoker).await.unwrap();
        agent.handle("再说一次", &site(), &invoker).await.unwrap();

        let (messages, _) = model.round(1);
        assert!(messages.contains(&ChatMessage::User("现在第几页".to_string())));
        assert!(messages.contains(&ChatMessage::Assistant {
            content: Some("第 5 页".to_string()),
            tool_calls: Vec::new(),
        }));
    }

    fn turn_with_tool(index: usize) -> Vec<ChatMessage> {
        let id = format!("call_{index}");
        vec![
            ChatMessage::User(format!("命令 {index}")),
            ChatMessage::Assistant {
                content: None,
                tool_calls: vec![ToolCall {
                    id: id.clone(),
                    name: "ppt_next".to_string(),
                    arguments: "{}".to_string(),
                }],
            },
            ChatMessage::Tool {
                call_id: id,
                content: r#"{"ok":true}"#.to_string(),
            },
            ChatMessage::Assistant {
                content: Some(format!("回复 {index}")),
                tool_calls: Vec::new(),
            },
        ]
    }

    #[test]
    fn 历史只留最近十轮() {
        let mut history = History::default();
        for index in 0..12 {
            history.push_turn(turn_with_tool(index));
        }

        let messages = history.messages();
        assert_eq!(messages.len(), HISTORY_TURNS * 4);
        assert!(messages.contains(&ChatMessage::User("命令 2".to_string())));
        assert!(!messages.contains(&ChatMessage::User("命令 1".to_string())));
    }

    #[test]
    fn 裁剪不会留下没有配对的工具结果() {
        let mut history = History::default();
        for index in 0..12 {
            history.push_turn(turn_with_tool(index));
        }

        // 每个 tool 结果都必须能在它前面找到声明了同一个 id 的 assistant 消息，
        // 否则服务端会拒掉整个请求
        let messages = history.messages();
        let mut declared: Vec<String> = Vec::new();
        for message in &messages {
            match message {
                ChatMessage::Assistant { tool_calls, .. } => {
                    declared.extend(tool_calls.iter().map(|call| call.id.clone()));
                }
                ChatMessage::Tool { call_id, .. } => {
                    assert!(declared.contains(call_id), "{call_id} 没有配对的 tool_calls");
                }
                _ => {}
            }
        }
        assert_eq!(declared.len(), HISTORY_TURNS, "每轮一个工具调用");
    }
}
```

Run: `cd src-tauri && cargo test -p app robot::agent`
Expected: 编译失败，`cannot find type Agent in this scope`

- [ ] **Step 3: 写实现**

把下面内容加到 `src-tauri/src/platform/robot/agent.rs` 的**测试模块之前**：

```rust
//! 一条 `cmd` 的处理流程：带工具问一次 → 执行 → 不带工具再问一次要中文回复。
//!
//! 工具执行抽成 `ToolInvoker`，所以这里的测试不需要真的 WebSocket。

use std::collections::VecDeque;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use teaching_platform::error::{code, ApiError};

use super::tools;
use crate::llm::{ChatMessage, ChatRequest, ChatResponse, Result, TextModel, ToolCall};

/// 历史保留的轮数。一轮 = 一条 cmd 及其全部消息。
pub const HISTORY_TURNS: usize = 10;

/// 模型没给回复时的兜底话术。宁可说句废话也不能一声不出。
const UNCLEAR_REPLY: &str = "我没太听明白，可以再说一次吗";
const DONE_REPLY: &str = "好的，已经处理了";

const SYSTEM_PROMPT: &str = "\
你是教室里的教学助手机器人，通过工具操作教学平台。老师的话由语音识别转成文本，可能有错别字或口语化表达。

规则：
- 只能通过工具改变现场状态，不要声称自己做了没调工具的事。
- 翻页时必须从下面的现场信息读出当前页码并填进 expect_page，读不到就先说明情况。
- 现场信息里标为「无法获取」的内容不要编造，如实告诉老师查不到。
- 回复控制在 30 字以内，口语化，这句话会展示给老师，也可能被朗读出来。
- 老师只是闲聊或询问现状时，直接回答，不要调用工具。";

/// 执行一条平台指令。实现方负责发 WebSocket req 并等 ack。
#[async_trait]
pub trait ToolInvoker: Send + Sync {
    async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError>;
}

/// 一轮对话的产物。
#[derive(Debug, Clone)]
pub struct Outcome {
    /// 给老师的中文回复
    pub reply: String,
    /// 这一轮实际发出去的 op，供日志
    pub invoked: Vec<String>,
    /// 模型每轮的原始输出，写进日志 detail
    pub raw: Vec<String>,
}

/// 以「轮」为单位的环形缓冲。按条裁会把 `tool_calls` 与它的 `tool` 结果拆散，
/// 只留一半会被服务端拒绝。
#[derive(Debug, Default)]
pub struct History {
    turns: VecDeque<Vec<ChatMessage>>,
}

impl History {
    pub fn push_turn(&mut self, messages: Vec<ChatMessage>) {
        self.turns.push_back(messages);
        while self.turns.len() > HISTORY_TURNS {
            self.turns.pop_front();
        }
    }

    pub fn messages(&self) -> Vec<ChatMessage> {
        self.turns.iter().flatten().cloned().collect()
    }
}

pub struct Agent {
    model: Arc<dyn TextModel>,
    history: History,
}

impl Agent {
    pub fn new(model: Arc<dyn TextModel>) -> Self {
        Self {
            model,
            history: History::default(),
        }
    }

    /// 处理一条命令。`site` 是 `ContextStore::render()` 出来的现场段落。
    /// 返回 `Err` 表示这一条丢掉了，会话继续。
    pub async fn handle(
        &mut self,
        cmd: &str,
        site: &str,
        invoker: &dyn ToolInvoker,
    ) -> Result<Outcome> {
        let mut messages = vec![ChatMessage::System(format!("{SYSTEM_PROMPT}\n\n{site}"))];
        messages.extend(self.history.messages());
        messages.push(ChatMessage::User(cmd.to_string()));

        let first = self
            .model
            .chat(ChatRequest {
                messages: messages.clone(),
                tools: tools::specs(),
            })
            .await?;
        let mut raw = vec![first.raw];

        if first.tool_calls.is_empty() {
            let reply = first
                .content
                .unwrap_or_else(|| UNCLEAR_REPLY.to_string());
            self.history.push_turn(vec![
                ChatMessage::User(cmd.to_string()),
                ChatMessage::Assistant {
                    content: Some(reply.clone()),
                    tool_calls: Vec::new(),
                },
            ]);
            return Ok(Outcome {
                reply,
                invoked: Vec::new(),
                raw,
            });
        }

        // 串行执行：并发发指令会让 PPT 一次翻两页，这正是协议做 packageId 去重
        // 想避免的事故
        let mut invoked = Vec::new();
        let mut results = Vec::new();
        for call in &first.tool_calls {
            let (op, content) = execute(call, invoker).await;
            if let Some(op) = op {
                invoked.push(op);
            }
            results.push(ChatMessage::Tool {
                call_id: call.id.clone(),
                content,
            });
        }

        let assistant = ChatMessage::Assistant {
            content: first.content,
            tool_calls: first.tool_calls,
        };

        let mut second = messages;
        second.push(assistant.clone());
        second.extend(results.iter().cloned());

        // 第二轮不给 tools：这一轮只要中文回复，给了工具模型容易再调一次
        let reply = match self
            .model
            .chat(ChatRequest {
                messages: second,
                tools: Vec::new(),
            })
            .await
        {
            Ok(response) => {
                raw.push(response.raw);
                response.content.unwrap_or_else(|| DONE_REPLY.to_string())
            }
            Err(error) => {
                // 指令已经执行了，不能因为组织不出话就当整条命令失败
                log::warn!("生成回复失败：{error}");
                raw.push(format!("生成回复失败：{error}"));
                DONE_REPLY.to_string()
            }
        };

        let mut turn = vec![ChatMessage::User(cmd.to_string()), assistant];
        turn.extend(results);
        turn.push(ChatMessage::Assistant {
            content: Some(reply.clone()),
            tool_calls: Vec::new(),
        });
        self.history.push_turn(turn);

        Ok(Outcome {
            reply,
            invoked,
            raw,
        })
    }
}

/// 返回（真正发出去的 op，回给模型的 JSON 字符串）。
async fn execute(call: &ToolCall, invoker: &dyn ToolInvoker) -> (Option<String>, String) {
    let Some(op) = tools::op_of(&call.name) else {
        log::warn!("模型调了清单外的工具 {}", call.name);
        return (None, tool_result_error(code::UNSUPPORTED_OP, "不支持的指令"));
    };

    // 模型给的 arguments 常有截断或多余引号。当空参数发出去，让服务端的参数
    // 校验去报错——比在这里静默丢掉整条指令好排查
    let params = match serde_json::from_str::<Value>(&call.arguments) {
        Ok(Value::Object(map)) => Value::Object(map),
        _ => {
            log::warn!("{op} 的参数不是 JSON 对象，按空参数执行：{}", call.arguments);
            json!({})
        }
    };

    let content = match invoker.invoke(op, params).await {
        Ok(data) => json!({ "ok": true, "data": data }).to_string(),
        // message 是后端给的中文，直接交给模型措辞
        Err(error) => tool_result_error(error.code, &error.message),
    };
    (Some(op.to_string()), content)
}

fn tool_result_error(code: i32, message: &str) -> String {
    json!({ "ok": false, "code": code, "message": message }).to_string()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app robot::agent`
Expected: `test result: ok. 13 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/platform/robot
git commit -m "feat(robot): 两轮工具循环与按轮裁剪的对话历史"
```

---

### Task 10: `platform/robot/device_flow.rs` — Device Flow 编排

申请码 → 广播 `authorizing` 与 `DeviceFlowInfo` → 按 `interval` 轮询 → 拿到设备 token。被拒绝或过期时返回一个 `is_credential()` 为真的错误，这样 Task 11 的重连循环会停下来而不是自动重来（老师得重新扫码）。

轮询期间的网络抖动不算失败：继续等，别让老师白扫一次码。

**Files:**
- Create: `src-tauri/src/platform/robot/device_flow.rs`
- Modify: `src-tauri/src/platform/robot/mod.rs`

- [ ] **Step 1: 登记模块**

改 `src-tauri/src/platform/robot/mod.rs`：

```rust
pub mod agent;
pub mod context;
pub mod device_flow;
pub mod tools;
```

- [ ] **Step 2: 写失败的测试**

新建 `src-tauri/src/platform/robot/device_flow.rs`，先只写测试。轮询循环要 `AppHandle` 没法单测，所以把可测的部分抠成纯函数：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn code() -> DeviceCode {
        DeviceCode {
            device_code: "dc".into(),
            user_code: "H7K2QP".into(),
            verification_uri: "http://h:8084/device".into(),
            verification_uri_complete: "http://h:8084/device?code=H7K2QP".into(),
            expires_in: 600,
            interval: 5,
        }
    }

    #[test]
    fn 待授权时间隔不变() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::Pending, None),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn 收到_slow_down_时间隔加一秒() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::SlowDown, None),
            Duration::from_secs(6)
        );
    }

    #[test]
    fn 服务端给了间隔就照它的来() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::SlowDown, Some(12)),
            Duration::from_secs(12)
        );
    }

    #[test]
    fn 间隔有上限免得实际上放弃轮询() {
        assert_eq!(
            next_interval(Duration::from_secs(5), PollStatus::Pending, Some(600)),
            MAX_INTERVAL
        );
    }

    #[test]
    fn 授权信息取完整地址与短码() {
        let info = info_of(&code());
        assert_eq!(info.user_code, "H7K2QP");
        assert_eq!(info.verification_uri_complete, "http://h:8084/device?code=H7K2QP");
    }

    #[test]
    fn 后端没给完整地址时退回裸地址() {
        // 扫出来还得手动输码，但总比给前端一个空串好
        let info = info_of(&DeviceCode {
            verification_uri_complete: "  ".into(),
            ..code()
        });
        assert_eq!(info.verification_uri_complete, "http://h:8084/device");
    }

    #[test]
    fn 过期时间是当前时间加有效期() {
        let info = info_of(&code());
        let now = crate::platform::events::now_ms();
        assert!(info.expires_at > now, "过期时间必须在将来");
        assert!(info.expires_at <= now + 600_000);
    }

    #[test]
    fn 拒绝与过期被标成凭证错误好让重连循环停下() {
        assert!(refuse("老师拒绝了这次授权").is_credential());
    }
}
```

Run: `cd src-tauri && cargo test -p app robot::device_flow`
Expected: 编译失败，`cannot find function next_interval in this scope`

- [ ] **Step 3: 写实现**

把下面内容加到 `src-tauri/src/platform/robot/device_flow.rs` 的**测试模块之前**：

```rust
//! Device Flow 编排。流程与轮询语义见 HTTP 对接文档 §4.3。
//!
//! 设备 token 12 小时且没有刷新机制，过期只能重走整个流程。

use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use teaching_platform::error::{PlatformError, Result};
use teaching_platform::http::device::{DeviceCode, DeviceTokenPoll, PollStatus};
use teaching_platform::http::HttpClient;

use crate::platform::config::RobotConfig;
use crate::platform::events::{now_ms, ConnectionState, DeviceFlowInfo, LogLevel, LogSource};
use crate::platform::state::PlatformState;

/// 轮询间隔的上限。服务端要是给了个离谱的值，照它做等于放弃轮询。
const MAX_INTERVAL: Duration = Duration::from_secs(30);

/// 授权成功后拿到的东西。
pub struct DeviceSession {
    pub access_token: String,
    /// 秒。到期没有刷新可用，只能重走 Device Flow
    pub expires_in: u64,
    pub lesson_id: Option<i64>,
    pub classroom_id: Option<i64>,
}

/// 走完一次 Device Flow。返回 `Err` 且 `is_credential()` 为真时不要自动重来。
pub async fn authorize(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &RobotConfig,
) -> Result<DeviceSession> {
    let code = http
        .device_code(&config.device_no, &config.device_secret)
        .await?;
    let info = info_of(&code);

    state.set_device_flow(Some(info.clone()));
    state.update(app, |connection| {
        connection.state = ConnectionState::Authorizing;
        connection.last_error = None;
    });
    state.log(
        app,
        LogLevel::Info,
        LogSource::Connection,
        format!("等待授权，授权码 {}", info.user_code),
        Some(info.verification_uri_complete.clone()),
    );

    let mut interval = Duration::from_secs(code.interval.max(1));
    let deadline = tokio::time::Instant::now() + Duration::from_secs(code.expires_in);

    loop {
        tokio::time::sleep(interval).await;

        if tokio::time::Instant::now() >= deadline {
            return Err(give_up(app, state, "授权码已过期，请重新申请"));
        }

        match http.device_token(&code.device_code).await {
            Ok(DeviceTokenPoll::Ok {
                access_token,
                expires_in,
                lesson_id,
                classroom_id,
            }) => {
                state.set_device_flow(None);
                state.log(
                    app,
                    LogLevel::Success,
                    LogSource::Connection,
                    "设备授权成功",
                    None,
                );
                return Ok(DeviceSession {
                    access_token,
                    expires_in,
                    lesson_id,
                    classroom_id,
                });
            }

            Ok(DeviceTokenPoll::Pending {
                status,
                interval: suggested,
            }) => {
                if status.is_terminal() {
                    let message = match status {
                        PollStatus::Denied => "老师拒绝了这次授权，请重新申请",
                        _ => "授权码已过期，请重新申请",
                    };
                    return Err(give_up(app, state, message));
                }
                interval = next_interval(interval, status, suggested);
            }

            // 轮询期间的网络抖动不该让老师白扫一次码
            Err(error) if error.is_transient() => {
                log::warn!("轮询设备 token 失败，继续等待：{error}");
            }

            Err(error) => {
                state.set_device_flow(None);
                return Err(error);
            }
        }
    }
}

/// 清掉待授权信息、记一条错误日志，并给出一个「不要自动重来」的错误。
fn give_up(app: &AppHandle, state: &Arc<PlatformState>, message: &str) -> PlatformError {
    state.set_device_flow(None);
    state.log(app, LogLevel::Error, LogSource::Connection, message, None);
    refuse(message)
}

/// 用 403 表达「不要自动重来」：连接循环把 `is_credential()` 当停止信号。
fn refuse(message: impl Into<String>) -> PlatformError {
    PlatformError::Status {
        status: 403,
        message: message.into(),
    }
}

fn next_interval(current: Duration, status: PollStatus, suggested: Option<u64>) -> Duration {
    let base = match suggested {
        Some(secs) => Duration::from_secs(secs),
        None if status == PollStatus::SlowDown => current + Duration::from_secs(1),
        None => current,
    };
    base.min(MAX_INTERVAL)
}

fn info_of(code: &DeviceCode) -> DeviceFlowInfo {
    let complete = if code.verification_uri_complete.trim().is_empty() {
        code.verification_uri.clone()
    } else {
        code.verification_uri_complete.clone()
    };

    DeviceFlowInfo {
        user_code: code.user_code.clone(),
        verification_uri: code.verification_uri.clone(),
        verification_uri_complete: complete,
        expires_at: now_ms() + (code.expires_in as i64) * 1_000,
    }
}
```

`DeviceFlowInfo` 要能 `clone()`，Task 6 已经给它 derive 了 `Clone`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app robot::device_flow`
Expected: `test result: ok. 8 passed`

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/platform/robot
git commit -m "feat(robot): Device Flow 授权编排"
```

---

### Task 11: `platform/robot/mod.rs` — 连接循环、工具插槽与 Agent 接线

把前面几块接起来：

- **Agent 任务的寿命跨越重连。** 语音会话在 `start_asr` 时取一次命令通道的发送端；如果 Agent 随连接一起重建，每次断线重连都得让老师重开麦克风。所以 Agent 与 `ContextStore` 属于 `run()`，一条连接只是它们手里的一个「当前插槽」。
- **插槽用 mpsc 而不是 `Arc<Connection>`。** `Connection::close(self)` 要拿所有权，塞进 `Arc` 就再也关不掉，而它内部有三个 spawn 出来的任务——不关就是每次重连漏三个任务。所以连接由连接循环独占，Agent 通过一个 `mpsc<ToolRequest>` 请它代发。
- **Agent 任务用 Drop 守卫收摊。** `platform_disconnect` 是直接 `abort()` 连接循环的，abort 之后 `run()` 尾部的清理代码不会执行，但 Drop 会。

**Files:**
- Modify: `src-tauri/src/platform/robot/mod.rs`
- Modify: `src-tauri/src/platform/mod.rs:29-39`

- [ ] **Step 1: 写失败的测试**

`src-tauri/src/platform/robot/mod.rs` 里能单测的是三件事：入站 req 的拒绝帧、错误码的转换、插槽在有无连接两种状态下的行为。把测试模块写进文件末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 入站指令一律回_40006_并带上_op_名() {
        // 协议规定服务端只向 screen-web / screen-app 转发 req。真收到了也要回
        // 一帧 error 而不是静默忽略：静默会让发起方干等到 10 秒超时
        let error = unsupported("ppt.next");
        assert_eq!(error.code, code::UNSUPPORTED_OP);
        assert!(error.message.contains("ppt.next"));
    }

    #[test]
    fn 后端业务错误原样交给模型() {
        let error = api_error_of(PlatformError::Api(ApiError {
            code: 40007,
            message: "当前页已变化".into(),
        }));
        assert_eq!(error.code, 40007);
        assert_eq!(error.message, "当前页已变化");
    }

    #[test]
    fn 非业务错误归成内部错误但保留人话() {
        let error = api_error_of(PlatformError::Timeout);
        assert_eq!(error.code, code::INTERNAL);
        assert_eq!(error.message, "等待响应超时");
    }

    #[tokio::test]
    async fn 没连上时工具调用立刻报离线() {
        let slot = ConnectionSlot::default();
        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("没连上必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
        assert!(!error.message.trim().is_empty(), "这句会被模型转述给老师");
    }

    #[tokio::test]
    async fn 装上插槽后工具调用被转发() {
        let slot = ConnectionSlot::default();
        let (tx, mut rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;

        // 冒充连接循环：收到请求就回一个 ack
        tokio::spawn(async move {
            let request = rx.recv().await.expect("应收到工具请求");
            assert_eq!(request.op, "ppt.next");
            assert_eq!(request.params, serde_json::json!({ "expect_page": 5 }));
            let _ = request.reply.send(Ok(serde_json::json!({ "page": 6 })));
        });

        let data = slot
            .invoke("ppt.next", serde_json::json!({ "expect_page": 5 }))
            .await
            .expect("应拿到 ack");
        assert_eq!(data, serde_json::json!({ "page": 6 }));
    }

    #[tokio::test]
    async fn 连接消失后插槽退回离线() {
        let slot = ConnectionSlot::default();
        let (tx, rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;
        slot.set(None).await;
        drop(rx);

        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("插槽空了必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
    }

    #[tokio::test]
    async fn 连接循环没人应答时也不会永远挂着() {
        // 转发端还在但接收端已经没了，说明连接刚断，要立刻回错误而不是等
        let slot = ConnectionSlot::default();
        let (tx, rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;
        drop(rx);

        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("接收端没了必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
    }
}
```

Run: `cd src-tauri && cargo test -p app robot::tests`
Expected: 编译失败，`cannot find function unsupported in this scope`

- [ ] **Step 2: 写实现**

把 `src-tauri/src/platform/robot/mod.rs` 整个替换成下面的内容（模块声明保留在最上面，测试模块接在末尾）：

```rust
//! 机器人角色：Device Flow 授权 → `/ws/robot` → 语音指令交给带工具的模型。
//!
//! 桌面上也编译，因为单测跑在宿主机上；真正的平台分支只在 command 注册与
//! `run_role` 上。

pub mod agent;
pub mod context;
pub mod device_flow;
pub mod tools;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use tauri::AppHandle;
use teaching_platform::error::{code, ApiError, PlatformError};
use teaching_platform::http::HttpClient;
use teaching_platform::ws::backoff::Backoff;
use teaching_platform::ws::conn::{CloseReason, ConnectOptions, Connection, InboundHandler};
use teaching_platform::ws::event::ServerEvent;
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio::task::JoinHandle;

use crate::llm::openai_sdk::OpenAiCompatibleModel;
use crate::llm::TextModel;
use crate::platform::config::RobotConfig;
use crate::platform::events::{now_ms, ConnectionState, LogLevel, LogSource};
use crate::platform::state::PlatformState;
use agent::{Agent, ToolInvoker};
use context::ContextStore;

/// 机器人连的是这个固定路径，设备 token 响应里不带 ws_url。
const WS_PATH: &str = "/ws/robot";

/// 命令队列容量。老师连说几句时排队处理，满了就丢——
/// 投递方用的是 `try_send`，绝不能把音频泵堵住。
const COMMAND_BUFFER: usize = 8;

/// 设备 token 到期前多久主动重走 Device Flow。它没有刷新接口，
/// 只能提前一点让老师重新扫码，而不是在半节课中间突然掉线。
const REAUTH_LEAD_SECS: u64 = 300;
const MIN_SESSION_SECS: u64 = 60;

/// Agent 请连接循环代发一条指令。
struct ToolRequest {
    op: String,
    params: Value,
    reply: oneshot::Sender<std::result::Result<Value, ApiError>>,
}

/// 当前连接的插槽。Agent 只认这个 mpsc，所以它的寿命与任何一条连接无关。
///
/// 不存 `Arc<Connection>`：`Connection::close(self)` 要拿所有权，塞进 Arc 就
/// 再也关不掉，而它内部有三个 spawn 出来的任务，不关就是每次重连漏三个。
#[derive(Default)]
struct ConnectionSlot {
    sender: RwLock<Option<mpsc::Sender<ToolRequest>>>,
}

impl ConnectionSlot {
    async fn set(&self, sender: Option<mpsc::Sender<ToolRequest>>) {
        *self.sender.write().await = sender;
    }
}

#[async_trait]
impl ToolInvoker for ConnectionSlot {
    async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError> {
        let sender = self.sender.read().await.clone().ok_or_else(offline)?;
        let (reply, wait) = oneshot::channel();

        sender
            .send(ToolRequest {
                op: op.to_string(),
                params,
                reply,
            })
            .await
            .map_err(|_| offline())?;

        // 连接在等待期间断了，转发端会被丢掉，这里立刻拿到 Err 而不是干等
        wait.await.unwrap_or_else(|_| Err(offline()))
    }
}

/// 这句会被模型转述给老师，得是人话。
fn offline() -> ApiError {
    ApiError {
        code: code::DEVICE_OFFLINE,
        message: "机器人还没连上教学平台，稍后再试".to_string(),
    }
}

fn unsupported(op: &str) -> ApiError {
    ApiError {
        code: code::UNSUPPORTED_OP,
        message: format!("机器人不接受指令：{op}"),
    }
}

fn api_error_of(error: PlatformError) -> ApiError {
    match error {
        PlatformError::Api(api) => api,
        other => ApiError {
            code: code::INTERNAL,
            message: other.to_string(),
        },
    }
}

struct RobotHandler {
    app: AppHandle,
    state: Arc<PlatformState>,
    context: Arc<RwLock<ContextStore>>,
    kicked: Arc<AtomicBool>,
}

#[async_trait]
impl InboundHandler for RobotHandler {
    async fn on_request(&self, op: &str, _params: Value) -> std::result::Result<Value, ApiError> {
        Err(unsupported(op))
    }

    async fn on_event(&self, op: &str, data: Value) {
        let event = ServerEvent::parse(op, data);
        self.context.write().await.apply_event(&event);

        match &event {
            ServerEvent::Kicked { reason } => {
                self.kicked.store(true, Ordering::SeqCst);
                self.state.log(
                    &self.app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "已被顶号",
                    Some(reason.clone()),
                );
            }

            ServerEvent::LessonStarted { lesson } => {
                let lesson = lesson.clone();
                let title = lesson.title.clone();
                self.state.update(&self.app, |info| {
                    info.lesson_id = lesson.lesson_id;
                    info.lesson_title = lesson.title.clone();
                    info.course_name = lesson.course_name.clone();
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    format!("课堂开始：{}", title.as_deref().unwrap_or("未知课堂")),
                    None,
                );
            }

            ServerEvent::LessonEnded { .. } => {
                self.state.update(&self.app, |info| {
                    info.lesson_id = None;
                    info.lesson_title = None;
                    info.course_name = None;
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    "课堂结束",
                    None,
                );
            }

            // 现场状态已经进 ContextStore 了，不必逐条刷 UI
            _ => log::debug!("现场事件 {op}"),
        }
    }
}

/// Agent 任务的守卫。`platform_disconnect` 会直接 abort 连接循环，
/// 那时 `run()` 尾部的清理不会执行，但 Drop 会。
struct AgentGuard {
    task: JoinHandle<()>,
    state: Arc<PlatformState>,
}

impl Drop for AgentGuard {
    fn drop(&mut self) {
        self.task.abort();
        self.state.set_command_sender(None);
    }
}

/// 常驻循环。除顶号、凭证被拒与授权被拒外不会主动退出。
pub async fn run(app: AppHandle, state: Arc<PlatformState>, config: RobotConfig) {
    let http = match crate::voice::tls::http_client() {
        Ok(client) => HttpClient::new(config.base.base_url(), client),
        Err(error) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(format!("初始化 HTTP 客户端失败：{error}"));
            });
            return;
        }
    };

    // 没有模型的机器人连上了也听不懂话，配置缺失要显式报出来而不是装作正常
    let model: Arc<dyn TextModel> = match OpenAiCompatibleModel::from_config() {
        Ok(model) => Arc::new(model),
        Err(error) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(error.to_string());
            });
            state.log(
                &app,
                LogLevel::Error,
                LogSource::Agent,
                "语音指令不可用",
                Some(error.to_string()),
            );
            return;
        }
    };

    let context = Arc::new(RwLock::new(ContextStore::default()));
    let slot = Arc::new(ConnectionSlot::default());
    let (commands, inbox) = mpsc::channel::<String>(COMMAND_BUFFER);
    state.set_command_sender(Some(commands));

    let _guard = AgentGuard {
        task: tokio::spawn(agent_loop(
            app.clone(),
            state.clone(),
            context.clone(),
            slot.clone(),
            model,
            inbox,
        )),
        state: state.clone(),
    };

    let kicked = Arc::new(AtomicBool::new(false));
    let mut backoff = Backoff::new();
    let mut first = true;

    loop {
        state.update(&app, |info| {
            info.state = if first {
                ConnectionState::Connecting
            } else {
                ConnectionState::Reconnecting
            };
            if !first {
                info.reconnect_count = info.reconnect_count.saturating_add(1);
            }
        });
        first = false;

        match session_once(&app, &state, &http, &config, &context, &slot, &kicked).await {
            Ok(reason) => {
                // 连接成功建立过，不该背上一次失败的退避时长
                backoff.reset();

                if reason.is_kicked() || kicked.load(Ordering::SeqCst) {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.kicked = true;
                        info.connected_at = None;
                        info.last_error =
                            Some("同一设备已在别处连接，已停止自动重连".to_string());
                    });
                    state.log(
                        &app,
                        LogLevel::Error,
                        LogSource::Connection,
                        "被顶号，停止自动重连",
                        None,
                    );
                    return;
                }

                state.log(
                    &app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "连接已断开",
                    Some(reason.message.clone()),
                );
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(reason.message);
                });
            }

            Err(error) => {
                // 授权被拒/过期与凭证错误都归在这里：自动重来只会刷出一串没人扫的码
                if error.is_credential() {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.connected_at = None;
                        info.last_error = Some(error.to_string());
                    });
                    state.log(
                        &app,
                        LogLevel::Error,
                        LogSource::Connection,
                        "授权被拒绝，已停止重试",
                        Some(error.to_string()),
                    );
                    return;
                }

                state.log(
                    &app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "连接失败",
                    Some(error.to_string()),
                );
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(error.to_string());
                });
            }
        }

        let delay = backoff.next_delay();
        log::info!("{} 秒后重连", delay.as_secs_f32());
        tokio::time::sleep(delay).await;
    }
}

/// 一次「授权 + 连接 + 待到断开」。设备 token 没有刷新接口，
/// 所以每次进来都重走 Device Flow。
async fn session_once(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &RobotConfig,
    context: &Arc<RwLock<ContextStore>>,
    slot: &Arc<ConnectionSlot>,
    kicked: &Arc<AtomicBool>,
) -> std::result::Result<CloseReason, PlatformError> {
    let session = device_flow::authorize(app, state, http, config).await?;
    let url = http.resolve_ws_url(WS_PATH);

    let handler: Arc<dyn InboundHandler> = Arc::new(RobotHandler {
        app: app.clone(),
        state: state.clone(),
        context: context.clone(),
        kicked: kicked.clone(),
    });

    // 机器人不传 lesson_id，服务端按设备绑定的教室决定房间
    let (conn, snapshot) = Connection::open(
        ConnectOptions {
            url: url.clone(),
            token: session.access_token,
        },
        handler,
    )
    .await?;

    context.write().await.apply_snapshot(&snapshot);

    state.update(app, |info| {
        info.state = ConnectionState::Connected;
        info.connected_at = Some(now_ms());
        info.last_error = None;
        info.kicked = false;
        info.classroom_id = snapshot.classroom_id.or(session.classroom_id);
        info.lesson_id = snapshot.lesson_id.or(session.lesson_id);
        info.lesson_title = snapshot.lesson.as_ref().map(|lesson| lesson.title.clone());
        info.course_name = snapshot
            .lesson
            .as_ref()
            .and_then(|lesson| lesson.course_name.clone());
    });
    state.log(
        app,
        LogLevel::Success,
        LogSource::Connection,
        "已连接到教学平台",
        Some(url),
    );

    let (tools_tx, mut tools_rx) = mpsc::channel::<ToolRequest>(4);
    slot.set(Some(tools_tx)).await;

    let reauth_after = std::time::Duration::from_secs(
        session
            .expires_in
            .saturating_sub(REAUTH_LEAD_SECS)
            .max(MIN_SESSION_SECS),
    );
    // 必须先建好再 pin：写在 select! 分支里的话每收一条指令就把计时器重置了，
    // token 就永远等不到过期
    let reauth = tokio::time::sleep(reauth_after);
    tokio::pin!(reauth);

    // 指令串行代发：并发发会让 PPT 一次翻两页
    let reason = loop {
        tokio::select! {
            reason = conn.wait_closed() => break reason,

            _ = &mut reauth => break CloseReason {
                code: None,
                message: "设备 token 即将过期，需要重新授权".to_string(),
            },

            request = tools_rx.recv() => match request {
                Some(request) => {
                    let result = conn
                        .call(&request.op, request.params)
                        .await
                        .map_err(api_error_of);
                    let _ = request.reply.send(result);
                }
                // 插槽的发送端只有 Agent 持有，它没了说明整个角色在收摊
                None => break CloseReason {
                    code: None,
                    message: "指令通道已关闭".to_string(),
                },
            },
        }
    };

    slot.set(None).await;
    conn.close().await;
    Ok(reason)
}

/// 串行处理命令。一次只处理一条：老师连说两句时第二条排队，
/// 并发执行会让 PPT 翻两页。
async fn agent_loop(
    app: AppHandle,
    state: Arc<PlatformState>,
    context: Arc<RwLock<ContextStore>>,
    slot: Arc<ConnectionSlot>,
    model: Arc<dyn TextModel>,
    mut inbox: mpsc::Receiver<String>,
) {
    let mut agent = Agent::new(model);

    while let Some(cmd) = inbox.recv().await {
        // 渲染完立刻放锁：一次模型往返要好几秒，握着读锁会挡住事件更新
        let site = context.read().await.render();

        state.log(
            &app,
            LogLevel::Info,
            LogSource::Command,
            format!("收到指令：{cmd}"),
            Some(site.clone()),
        );

        match agent.handle(&cmd, &site, slot.as_ref()).await {
            Ok(outcome) => {
                if !outcome.invoked.is_empty() {
                    state.log(
                        &app,
                        LogLevel::Info,
                        LogSource::Command,
                        format!("已执行 {}", outcome.invoked.join("、")),
                        None,
                    );
                }
                state.log(
                    &app,
                    LogLevel::Success,
                    LogSource::Agent,
                    outcome.reply,
                    Some(outcome.raw.join("\n\n")),
                );
            }
            Err(error) => {
                // 只丢这一条命令，麦克风继续开着
                state.log(
                    &app,
                    LogLevel::Error,
                    LogSource::Agent,
                    format!("处理指令失败：{error}"),
                    None,
                );
            }
        }
    }
}
```

- [ ] **Step 3: 接到 `run_role` 上**

改 `src-tauri/src/platform/mod.rs` 的移动端分支：

```rust
#[cfg(mobile)]
pub async fn run_role(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    robot::run(app, state, config).await;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test -p app`
Expected: 全绿。`robot::tests` 里 7 条新测试通过

- [ ] **Step 5: 确认桌面端没被卷进机器人代码**

桌面 target 上 `robot` 模块只应被编译，不该被 `run_role` 调用。

Run: `cd src-tauri && cargo build -p app 2>&1 | rg -c "^warning: unused" || echo "无未使用告警"`
Expected: `无未使用告警`

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/platform
git commit -m "feat(robot): 授权重连循环与语音指令 Agent 接线"
```

---

### Task 12: 前端同步语音事件契约

Rust 侧的 `VoiceEvent::Command` 已经缩成 `{ text }`，`Stage` 也没有 `llm` 了。前端不改的话 TypeScript 会继续按旧字段取值，运行时拿到 `undefined`。模型交互的展示挪到 `<LogPanel>`（Rust 侧的 `LogSource::Agent` 日志），所以 `<VoiceDemo>` 只需展示原句。

前端没有测试框架，验证靠 `tsc --noEmit` 与 biome。

**Files:**
- Modify: `src/lib/voice/types.ts`
- Modify: `src/lib/voice/index.ts:23-30`
- Modify: `src/hooks/use-voice-session.ts`
- Modify: `src/components/voice-demo.tsx`

- [ ] **Step 1: 改类型契约**

改 `src/lib/voice/types.ts`：删掉 `VoiceCommand` 接口，`ErrorStage` 去掉 `'llm'`，`command` 事件与 `onCommand` 回调改成只带文本：

```ts
/**
 * 语音链路的事件契约。改这里必须同步改 src-tauri/src/voice/events.rs，
 * 那边有单测钉住了序列化结果。
 */

export type SessionState = 'starting' | 'listening' | 'stopped';

export type ErrorStage = 'permission' | 'audio' | 'asr';

export type VoiceEvent =
  | { type: 'state'; state: SessionState }
  /** index 是句子序号，据此原地更新同一句的中间结果 */
  | { type: 'transcript'; text: string; index: number; final: boolean }
  | { type: 'wake' }
  /** 唤醒后的命令句原文。怎么解释它由 Rust 侧的机器人 Agent 决定 */
  | { type: 'command'; text: string }
  | { type: 'error'; stage: ErrorStage; message: string };

export interface VoiceHandlers {
  onState?: (state: SessionState) => void;
  onTranscript?: (text: string, index: number, final: boolean) => void;
  onWake?: () => void;
  onCommand?: (text: string) => void;
  onError?: (stage: ErrorStage, message: string) => void;
}
```

- [ ] **Step 2: 改事件分发**

改 `src/lib/voice/index.ts`：`export type` 列表去掉 `VoiceCommand`，`command` 分支只传文本：

```ts
export type {
  ErrorStage,
  SessionState,
  VoiceEvent,
  VoiceHandlers,
} from './types';
```

```ts
    case 'command':
      handlers.onCommand?.(event.text);
      break;
```

- [ ] **Step 3: 改时间线状态**

改 `src/hooks/use-voice-session.ts`：`TimelineItem` 的 `command` 项只留文本，`STAGE_LABELS` 去掉 `llm`，`onCommand` 跟着改：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ErrorStage,
  type SessionState,
  startASR,
  stopASR,
} from '@/lib/voice';

export type TimelineItem =
  | {
      id: string;
      kind: 'transcript';
      text: string;
      final: boolean;
    }
  | { id: string; kind: 'wake' }
  | { id: string; kind: 'command'; text: string }
  | { id: string; kind: 'error'; label: string; message: string };

export type VoiceStatus = 'idle' | SessionState;

const STAGE_LABELS: Record<ErrorStage, string> = {
  permission: '麦克风权限',
  audio: '录音',
  asr: '语音识别',
};
```

```ts
        onCommand: (text) => {
          append({ id: `${epoch}-c${Date.now()}`, kind: 'command', text });
        },
```

- [ ] **Step 4: 简化 VoiceDemo**

改 `src/components/voice-demo.tsx`：删掉 `CommandRow` 整个函数与 `import type { VoiceCommand }`，`command` 分支改成一行徽章 + 原句，并在卡片描述里指路日志面板：

```tsx
    case 'command':
      return (
        <div className="flex items-baseline gap-2">
          <Badge variant="default" className="shrink-0">
            指令
          </Badge>
          <span className="break-all text-sm">{item.text}</span>
        </div>
      );
```

```tsx
        <CardDescription>
          唤醒词「你好小财」，助手的回复见下方运行日志
        </CardDescription>
```

- [ ] **Step 5: 类型检查与格式化**

Run: `pnpm exec tsc --noEmit`
Expected: 无输出

Run: `pnpm check`
Expected: `Checked N files`，没有 error

- [ ] **Step 6: 提交**

```bash
git add src/lib/voice src/hooks/use-voice-session.ts src/components/voice-demo.tsx
git commit -m "refactor(web): 语音事件只带命令原句"
```

---

### Task 13: 前端授权卡片与二维码

机器人在 `authorizing` 状态时首页要显示 `user_code` 与一张二维码。Rust 只给字符串，二维码在前端画——为了画一张图给 Rust 引入图像依赖不值得。

Rust 侧没有为待授权信息开事件，只有 `robot_device_flow_state` 这个 command，所以前端在 `authorizing` 期间轮询。轮询只在这个状态下开，其余时间一次请求都不发。

**Files:**
- Modify: `package.json`
- Modify: `src/lib/platform-api/types.ts`
- Modify: `src/lib/platform-api/index.ts`
- Create: `src/hooks/use-device-flow.ts`
- Create: `src/components/device-flow-card.tsx`
- Modify: `src/components/mobile/home.tsx`

- [ ] **Step 1: 装依赖**

Run: `pnpm add qrcode && pnpm add -D @types/qrcode`
Expected: `package.json` 里出现 `qrcode` 与 `@types/qrcode`

- [ ] **Step 2: 加类型**

改 `src/lib/platform-api/types.ts`，在 `LogEntry` 之后插入：

```ts
/** 机器人 Device Flow 的待授权信息，与 events.rs 的 DeviceFlowInfo 对应 */
export interface DeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  /** 已带上 user_code 的完整地址，二维码编码的就是这个 */
  verificationUriComplete: string;
  /** 毫秒时间戳 */
  expiresAt: number;
}
```

- [ ] **Step 3: 加 API 方法**

改 `src/lib/platform-api/index.ts`：`import` 补上 `DeviceFlowInfo`，并在 `getRecentLogs` 之后插入：

```ts
/**
 * 机器人待授权信息。没在等授权时为 null。
 *
 * 桌面端没有注册这个 command，调用会抛错，因此非安卓直接返回 null。
 */
export async function getDeviceFlowState(): Promise<DeviceFlowInfo | null> {
  if (!isTauri() || !IS_ANDROID) return null;
  return await invoke<DeviceFlowInfo | null>('robot_device_flow_state');
}
```

- [ ] **Step 4: 加轮询 hook**

新建 `src/hooks/use-device-flow.ts`：

```ts
import { useEffect, useState } from 'react';
import { useConnection } from '@/hooks/use-connection';
import { type DeviceFlowInfo, getDeviceFlowState } from '@/lib/platform-api';

/** Rust 侧没为待授权信息开事件，只在等授权时轮询，其余时间一次请求都不发 */
const POLL_INTERVAL_MS = 2_000;

export function useDeviceFlow(): DeviceFlowInfo | null {
  const { info } = useConnection();
  const [flow, setFlow] = useState<DeviceFlowInfo | null>(null);
  const authorizing = info.state === 'authorizing';

  useEffect(() => {
    if (!authorizing) {
      setFlow(null);
      return;
    }

    let disposed = false;
    const read = () => {
      void getDeviceFlowState().then((next) => {
        if (!disposed) setFlow(next);
      });
    };

    read();
    const timer = setInterval(read, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [authorizing]);

  return flow;
}
```

- [ ] **Step 5: 加卡片组件**

新建 `src/components/device-flow-card.tsx`：

```tsx
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDeviceFlow } from '@/hooks/use-device-flow';

/**
 * 机器人待授权卡片。只在 Rust 侧处于 authorizing 时出现。
 *
 * 二维码在前端画：Rust 只给出完整地址字符串，为了一张图给它引入图像依赖不值得。
 */
export function DeviceFlowCard() {
  const flow = useDeviceFlow();
  const [qr, setQr] = useState<string | null>(null);
  const target = flow?.verificationUriComplete ?? null;

  useEffect(() => {
    if (!target) {
      setQr(null);
      return;
    }

    let disposed = false;
    // 白底二维码：深色主题下透明背景会让扫码识别不出来
    void QRCode.toDataURL(target, {
      margin: 1,
      width: 240,
      color: { light: '#ffffff' },
    })
      .then((url) => {
        if (!disposed) setQr(url);
      })
      .catch((error: unknown) => {
        console.error('生成二维码失败', error);
        if (!disposed) setQr(null);
      });

    return () => {
      disposed = true;
    };
  }, [target]);

  if (!flow) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>等待授权</CardTitle>
        <CardDescription>
          请老师扫码，或在网页上输入下面的授权码
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <p className="font-mono text-3xl tracking-[0.35em] tabular-nums">
          {flow.userCode}
        </p>
        {qr ? (
          <img
            src={qr}
            alt={`授权码 ${flow.userCode} 的二维码`}
            className="size-40 rounded-lg border bg-white p-2"
          />
        ) : (
          <div className="size-40 animate-pulse rounded-lg border bg-muted" />
        )}
        <p className="break-all text-center text-xs text-muted-foreground">
          {flow.verificationUriComplete}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: 挂到首页**

改 `src/components/mobile/home.tsx`，把卡片放在语音 demo 之前——没授权的时候它是当前最要紧的事：

```tsx
import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { DeviceFlowCard } from '@/components/device-flow-card';
import { LogPanel } from '@/components/log-panel';
import { MobilePage } from '@/components/mobile/page';
import { Button } from '@/components/ui/button';
import { VoiceDemo } from '@/components/voice-demo';

/**
 * 移动端首页。连接状态与配置都在设置页里。
 * 连接由 Rust 在应用启动时自动建立，不依赖本页挂载。
 */
export function MobileHome() {
  return (
    <MobilePage
      actions={
        <Button asChild variant="outline" size="icon" aria-label="设置">
          <Link to="/settings">
            <Settings />
          </Link>
        </Button>
      }
    >
      <DeviceFlowCard />
      <VoiceDemo />
      <LogPanel />
    </MobilePage>
  );
}
```

- [ ] **Step 7: 类型检查与格式化**

Run: `pnpm exec tsc --noEmit`
Expected: 无输出

Run: `pnpm check`
Expected: `Checked N files`，没有 error

- [ ] **Step 8: 浏览器里确认没有回归**

Run: `pnpm dev`
在浏览器打开首页：非 Tauri 环境下 `getDeviceFlowState()` 返回 null，卡片不该出现，控制台不该有报错。确认后 Ctrl-C 结束。

- [ ] **Step 9: 提交**

```bash
git add package.json pnpm-lock.yaml src/lib/platform-api src/hooks/use-device-flow.ts src/components/device-flow-card.tsx src/components/mobile/home.tsx
git commit -m "feat(web): 机器人待授权卡片与二维码"
```

---

### Task 14: 端到端手动联调

前面全部是单测能覆盖的部分。真机链路只能手动跑：Device Flow 要人扫码，语音要人说话。

**Files:** 无（只跑与观察）

对着测试服务器 `http://8.163.33.11:8084`（无 SSL）跑。设备编号与设备密钥用测试环境发给机器人的那一对，也就是 `robot_sim.py --device-flow` 用的同一对；这两个值填进设置页，不进版本库。

- [ ] **Step 1: 起大屏 sim 作为被控端**

指令是转发给大屏的，没有大屏在线的话 `app.open_url` 只会拿到服务端的错误帧。用 mock-server 里的 sim 顶上：

```bash
cd ../mock-server && python screen_app_sim.py \
  --base-url http://8.163.33.11:8084 \
  --app-key 123456 --app-secret 1234567890 \
  --chrome "/Applications/Google Chrome.app"
```
Expected: sim 打印已连上 `/ws/app`

（也可以改用真机上的桌面端 `pnpm pc:dev`，效果一样。）

- [ ] **Step 2: 真机跑起来并完成授权**

```bash
pnpm android:dev
```
在设置页填好服务器地址、设备编号与设备密钥并保存。
Expected: 首页出现「等待授权」卡片，显示六位授权码与二维码；日志区出现「等待授权，授权码 XXXXXX」

- [ ] **Step 3: 在网页上确认授权**

用手机或电脑打开卡片下方的地址（或直接扫码），按平台提示确认。
Expected: 卡片消失；日志依次出现「设备授权成功」「已连接到教学平台」；连接徽章变成「已连接」

- [ ] **Step 4: 让老师在网页端开一节课**

机器人的现场上下文来自绑定课堂后的首帧快照。
Expected: 日志出现「课堂开始：…」；没有可用课堂时后面几步的现场段落会是空的，要在结论里注明

- [ ] **Step 5: 说一条要调工具的指令**

对机器人说「你好小财，打开演示大屏」。
Expected:
- 语音卡片出现「已唤醒」与一条「指令 打开演示大屏」
- 日志区依次出现「收到指令：打开演示大屏」（详情里能看到现场段落）、「已执行 app.open_url」，以及一条助手回复
- 大屏 sim 那一侧拉起 Chrome

- [ ] **Step 6: 说一条不该调工具的话**

对机器人说「你好小财，现在讲到第几页了」。
Expected: 日志里只有「收到指令」与助手回复，没有「已执行」——查询靠现场段落回答，不该触发工具

- [ ] **Step 7: 验证翻页的乐观锁**

先在 sim 或网页端把 PPT 翻一页，再对机器人说「你好小财，下一页」。
Expected: 助手拿现场段落里的当前页填 `expect_page`。页码已经变了的话工具结果是错误帧，日志的助手回复会说明页码不对，而不是静默失败

- [ ] **Step 8: 验证一条指令失败不拖垮会话**

拔掉大屏 sim（Ctrl-C）后再说「你好小财，打开演示大屏」。
Expected: 日志里出现工具的错误结果与一条解释性的助手回复，连接徽章仍是「已连接」，接着还能继续说下一条指令

- [ ] **Step 9: 验证顶号**

用同一对设备凭证再连一个：

```bash
cd ../mock-server && python robot_sim.py --device-flow \
  --device-no <设备编号> --device-secret <设备密钥>
```
Expected: 手机这边日志出现「已被顶号」与「被顶号，停止自动重连」，徽章变「连接异常」，并且**不再重连**；关掉 sim 后在设置页点「重新连接」能恢复

- [ ] **Step 10: 验证断网重连**

把手机 Wi-Fi 关掉十几秒再打开。
Expected: 状态走到「重连中」；设备 token 没有刷新机制，所以恢复网络后会重新走一遍 Device Flow，卡片带着新的授权码再出现一次

- [ ] **Step 11: 验证授权被拒**

在网页上对新的授权请求点拒绝。
Expected: 日志出现「老师拒绝了这次授权，请重新申请」，状态变「连接异常」，**不会**自动刷出新的授权码

- [ ] **Step 12: 排查参考**

| 现象 | 排查方向 |
|---|---|
| 卡片一直不出现，日志停在「未配置」 | `RobotConfig` 有字段没填；`isConfigComplete` 不通过时 Rust 不发起连接 |
| 卡片出现但二维码是空占位 | `QRCode.toDataURL` 抛错，看 WebView 控制台；`verificationUriComplete` 为空则是后端没给这个字段 |
| 网页上确认了但手机还在等 | 轮询没拿到 token，看 `DeviceTokenPoll` 的判别是不是把带 `access_token` 的响应误判成了 pending |
| 授权成功后立刻 4001 | 连的路径不对，机器人固定连 `/ws/robot`，设备 token 响应里没有 `ws_url` |
| 连上但说话没反应 | cmd 通道没接上：`start_asr` 组装 `SessionDeps` 时要从 `PlatformState` 取 `command_sender` |
| 日志有「收到指令」但没有回复也没有「已执行」 | LLM 请求失败，看日志详情里的错误；`LLM_MODEL` / `DASHSCOPE_API_KEY` 没注入时会在这一步炸 |
| 模型每次都回「我不能这么做」 | 工具清单没送进去，检查 `tools::specs()` 是否为空以及工具名里的 `.` 有没有换成 `_` |
| 模型调了一个不存在的工具 | 白名单生效了就应该回 40006 文案给模型，看 `tools::op_of` 返回 `None` 时的分支 |
| 一条指令翻了两页 | Agent 并发处理了指令，检查是不是串行 `recv` |
| token 快过期时没有重新授权 | `session_once` 里的 sleep 没有 pin，被 `select!` 每轮重建了 |

- [ ] **Step 13: 记录结果**

把每一步的实际现象填进本文件末尾的「联调记录」小节，失败的项写清现象与日志片段；实测到的 `expires_in`、轮询 `interval`、后端对拒绝/过期返回的业务码补进设计文档对应小节。

```bash
git add docs/superpowers/plans/2026-08-10-teaching-platform-robot.md docs/superpowers/specs/2026-08-10-teaching-platform-integration-design.md
git commit -m "docs: 补充机器人端联调结论"
```

---

## 联调记录

（Task 14 执行时填写：日期、设备、每步实际现象、未通过项与后续处理）
