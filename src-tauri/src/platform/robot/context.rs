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
