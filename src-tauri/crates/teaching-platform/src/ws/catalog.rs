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
