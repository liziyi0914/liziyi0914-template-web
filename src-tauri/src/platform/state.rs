use crate::platform::events::{
    ConnectionInfo, ConnectionState, DeviceFlowInfo, LogEntry, LogLevel, LogSource,
    CONNECTION_EVENT, LOG_EVENT,
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
    /// 语音命令的投递口。机器人授权成功后装上，断开时清掉
    commands: Option<tokio::sync::mpsc::Sender<String>>,
    /// 待授权信息，仅机器人端有
    device_flow: Option<DeviceFlowInfo>,
}

#[derive(Default)]
pub struct PlatformState {
    inner: Mutex<Inner>,
}

impl PlatformState {
    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("状态锁被毒化")
    }

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
