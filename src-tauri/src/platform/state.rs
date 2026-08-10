use crate::platform::events::{
    ConnectionInfo, ConnectionState, LogEntry, LogLevel, LogSource, CONNECTION_EVENT, LOG_EVENT,
};
use std::collections::VecDeque;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// 前端刷新或后开窗口时要能补齐已经发生的事，而不是只看到订阅之后的增量。
const LOG_CAPACITY: usize = 200;

#[derive(Default)]
struct Inner {
    info: ConnectionInfo,
    logs: VecDeque<LogEntry>,
    seq: u64,
    runner: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Default)]
pub struct PlatformState {
    inner: Mutex<Inner>,
}

impl PlatformState {
    pub fn info(&self) -> ConnectionInfo {
        self.inner.lock().expect("状态锁被毒化").info.clone()
    }

    pub fn recent_logs(&self) -> Vec<LogEntry> {
        self.inner
            .lock()
            .expect("状态锁被毒化")
            .logs
            .iter()
            .cloned()
            .collect()
    }

    /// 改状态并广播。回调里不要做耗时操作，锁是同步的。
    pub fn update(&self, app: &AppHandle, mutate: impl FnOnce(&mut ConnectionInfo)) {
        let info = {
            let mut inner = self.inner.lock().expect("状态锁被毒化");
            mutate(&mut inner.info);
            inner.info.clone()
        };

        #[cfg(desktop)]
        crate::tray::sync(app, &info);

        if let Err(e) = app.emit(CONNECTION_EVENT, &info) {
            log::warn!("广播连接状态失败：{e}");
        }
    }

    pub fn log(
        &self,
        app: &AppHandle,
        level: LogLevel,
        source: LogSource,
        message: impl Into<String>,
        detail: Option<String>,
    ) {
        let entry = {
            let mut inner = self.inner.lock().expect("状态锁被毒化");
            inner.seq += 1;
            let entry = LogEntry::new(inner.seq, level, source, message.into(), detail);
            if inner.logs.len() == LOG_CAPACITY {
                inner.logs.pop_front();
            }
            inner.logs.push_back(entry.clone());
            entry
        };

        log::info!("[platform] {}", entry.message);
        if let Err(e) = app.emit(LOG_EVENT, &entry) {
            log::warn!("广播日志失败：{e}");
        }
    }

    /// 装上新的连接循环，返回被替换掉的旧句柄供调用方 abort。
    pub fn swap_runner(
        &self,
        handle: Option<tokio::task::JoinHandle<()>>,
    ) -> Option<tokio::task::JoinHandle<()>> {
        std::mem::replace(&mut self.inner.lock().expect("状态锁被毒化").runner, handle)
    }

    /// 断开时用：把状态打回终态并清掉课堂信息
    pub fn mark_disconnected(&self, app: &AppHandle) {
        self.update(app, |info| {
            info.state = ConnectionState::Disconnected;
            info.connected_at = None;
            info.lesson_id = None;
            info.lesson_title = None;
            info.course_name = None;
        });
    }
}
