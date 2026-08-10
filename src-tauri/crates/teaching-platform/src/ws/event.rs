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

/// `lesson.started` / `lesson.ended` 的载荷。字段缺失时留空而不是丢弃整个事件：
/// 课堂归属的变化本身比标题重要，宁可显示「课堂 88」也不能继续显示上一节课。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LessonChange {
    pub lesson_id: Option<i64>,
    pub title: Option<String>,
    pub course_name: Option<String>,
}

impl LessonChange {
    fn parse(data: &Value) -> Self {
        let text = |key: &str| {
            data.get(key)
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .map(str::to_string)
        };

        Self {
            lesson_id: data.get("lesson_id").and_then(Value::as_i64),
            title: text("title"),
            course_name: text("course_name"),
        }
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 解析顶号事件() {
        assert_eq!(
            ServerEvent::parse("conn.kicked", json!({ "reason": "别处登录" })),
            ServerEvent::Kicked {
                reason: "别处登录".into()
            }
        );
    }

    #[test]
    fn 顶号事件缺少_reason_时给默认文案() {
        let ServerEvent::Kicked { reason } = ServerEvent::parse("conn.kicked", json!({})) else {
            panic!("应为 Kicked");
        };
        assert!(!reason.is_empty());
    }

    #[test]
    fn 解析课堂开始与结束() {
        let data =
            json!({ "lesson_id": 88, "title": "第 5 讲 决策树", "course_name": "机器学习导论" });
        let expected = LessonChange {
            lesson_id: Some(88),
            title: Some("第 5 讲 决策树".into()),
            course_name: Some("机器学习导论".into()),
        };

        assert_eq!(
            ServerEvent::parse("lesson.started", data.clone()),
            ServerEvent::LessonStarted {
                lesson: expected.clone()
            }
        );
        assert_eq!(
            ServerEvent::parse("lesson.ended", data),
            ServerEvent::LessonEnded { lesson: expected }
        );
    }

    #[test]
    fn 课堂事件字段缺失或为空串时留空而不是丢弃事件() {
        let ServerEvent::LessonStarted { lesson } =
            ServerEvent::parse("lesson.started", json!({ "title": "   " }))
        else {
            panic!("应为 LessonStarted");
        };

        assert_eq!(lesson, LessonChange::default());
    }

    #[test]
    fn 未知事件不报错而是落到_unknown() {
        assert_eq!(
            ServerEvent::parse("quiz.published", json!({ "quiz_id": 1 })),
            ServerEvent::Unknown {
                op: "quiz.published".into(),
                data: json!({ "quiz_id": 1 })
            }
        );
    }

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
}
