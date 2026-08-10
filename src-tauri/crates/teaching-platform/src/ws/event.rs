use serde_json::Value;

/// 服务端事件。本阶段大屏端只关心顶号与课堂切换，其余一律落到 Unknown——
/// 后端加新事件不该让客户端报错。机器人端的事件在第二份计划里补。
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
            _ => Self::Unknown {
                op: op.to_string(),
                data,
            },
        }
    }
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
}
