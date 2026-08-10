use crate::error::{PlatformError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// `auth.login` ack 的 data。字段全部可缺省——后端加字段不该让客户端崩。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Snapshot {
    pub conn_id: Option<String>,
    pub client_type: Option<String>,
    pub lesson_id: Option<i64>,
    pub classroom_id: Option<i64>,
    pub lesson: Option<LessonBrief>,
    pub screen_state: Option<ScreenState>,
    pub attendance_open: Option<bool>,
    pub sign_in: Option<SignIn>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct LessonBrief {
    pub id: i64,
    pub title: String,
    pub status: String,
    pub course_id: Option<i64>,
    pub course_name: Option<String>,
}

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

impl Snapshot {
    pub fn from_value(value: Value) -> Result<Self> {
        serde_json::from_value(value)
            .map_err(|e| PlatformError::Decode(format!("无法解析现场快照：{e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn 解析完整快照() {
        let snapshot = Snapshot::from_value(json!({
            "conn_id": "c1",
            "client_type": "app",
            "lesson_id": 88,
            "classroom_id": 3,
            "lesson": { "id": 88, "title": "第 5 讲 决策树", "status": "ongoing",
                        "course_id": 12, "course_name": "机器学习导论" },
            "screen_state": { "view": "ppt", "courseware_id": 17, "page": 5,
                              "page_count": 32, "ideology_material_id": null },
            "active_quiz": null,
            "active_discussion": null,
            "attendance_open": true,
            "sign_in": { "status": "open", "code": "7K3M9Q", "signed": 31, "total": 45, "rate": 0.6889 }
        }))
        .unwrap();

        assert_eq!(snapshot.classroom_id, Some(3));
        assert_eq!(snapshot.lesson.as_ref().unwrap().title, "第 5 讲 决策树");
        assert_eq!(
            snapshot.lesson.as_ref().unwrap().course_name.as_deref(),
            Some("机器学习导论")
        );
        assert_eq!(snapshot.screen_state.as_ref().unwrap().page, 5);
        assert_eq!(snapshot.sign_in.as_ref().unwrap().signed, 31);
    }

    #[test]
    fn 未绑定课堂时_lesson_为_null() {
        let snapshot = Snapshot::from_value(json!({
            "conn_id": "c2", "client_type": "app",
            "lesson_id": null, "classroom_id": 3, "lesson": null,
            "screen_state": null, "attendance_open": false, "sign_in": null
        }))
        .unwrap();

        assert!(snapshot.lesson.is_none());
        assert_eq!(snapshot.lesson_id, None);
        assert_eq!(snapshot.classroom_id, Some(3));
    }

    #[test]
    fn 空对象也能解析成默认快照() {
        // 后端加字段不该让老客户端崩，少字段同理
        let snapshot = Snapshot::from_value(json!({})).unwrap();
        assert!(snapshot.lesson.is_none());
        assert!(snapshot.conn_id.is_none());
    }

    #[test]
    fn 出现未知字段时忽略而不是报错() {
        let snapshot =
            Snapshot::from_value(json!({ "classroom_id": 9, "brand_new_field": 1 })).unwrap();
        assert_eq!(snapshot.classroom_id, Some(9));
    }

    #[test]
    fn data_不是对象时报解析错误() {
        assert!(Snapshot::from_value(json!("nope")).is_err());
    }
}
