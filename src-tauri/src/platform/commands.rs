use crate::platform::config::{self, RoleConfig};
use crate::platform::events::{ConnectionInfo, ConnectionState, LogEntry, LogLevel, LogSource};
#[cfg(mobile)]
use crate::platform::events::DeviceFlowInfo;
use crate::platform::state::PlatformState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn platform_config_get(app: AppHandle) -> RoleConfig {
    config::load(&app)
}

#[tauri::command]
pub async fn platform_config_set(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
    config: RoleConfig,
) -> Result<(), String> {
    config::save(&app, &config)?;
    let state = state.inner().clone();
    start(app, state, config);
    Ok(())
}

#[tauri::command]
pub async fn platform_connect(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
) -> Result<(), String> {
    let config = config::load(&app);
    let state = state.inner().clone();
    start(app, state, config);
    Ok(())
}

#[tauri::command]
pub async fn platform_disconnect(
    app: AppHandle,
    state: State<'_, Arc<PlatformState>>,
) -> Result<(), String> {
    if let Some(runner) = state.swap_runner(None) {
        runner.abort();
    }
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(browser) = app.try_state::<Arc<crate::platform::BrowserManager>>() {
            browser.close();
        }
    }
    state.mark_disconnected(&app);
    state.log(&app, LogLevel::Info, LogSource::Connection, "已手动断开", None);
    Ok(())
}

#[tauri::command]
pub fn platform_connection_info(state: State<'_, Arc<PlatformState>>) -> ConnectionInfo {
    state.info()
}

#[tauri::command]
pub fn platform_recent_logs(state: State<'_, Arc<PlatformState>>) -> Vec<LogEntry> {
    state.recent_logs()
}

/// 机器人待授权信息。没在等授权时返回 null。
#[cfg(mobile)]
#[tauri::command]
pub fn robot_device_flow_state(state: State<'_, Arc<PlatformState>>) -> Option<DeviceFlowInfo> {
    state.device_flow()
}

#[cfg(desktop)]
#[tauri::command]
pub fn screen_app_browser_status(app: AppHandle) -> bool {
    use tauri::Manager;
    app.try_state::<Arc<crate::platform::BrowserManager>>()
        .map(|browser| browser.running())
        .unwrap_or(false)
}

/// 起一条新的连接循环，旧的先掐掉。配置不完整就停在 idle。
pub fn start(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    if let Some(previous) = state.swap_runner(None) {
        previous.abort();
    }

    if !config.is_complete() {
        state.update(&app, |info| {
            info.state = ConnectionState::Idle;
            info.connected_at = None;
            info.kicked = false;
            info.last_error = None;
        });
        state.log(&app, LogLevel::Info, LogSource::Connection, "配置不完整，暂不连接", None);
        return;
    }

    // 重新连接时把顶号标记与重连计数清零，否则会一直显示上一轮的结果
    state.update(&app, |info| {
        info.kicked = false;
        info.reconnect_count = 0;
        info.last_error = None;
    });

    let runner = {
        let app = app.clone();
        let state = state.clone();
        // PlatformState::swap_runner 存的是 tokio::task::JoinHandle，这里不能用
        // tauri::async_runtime::spawn（返回类型不同），Tauri 底层本就跑在 tokio 上。
        tokio::spawn(async move {
            crate::platform::run_role(app, state, config).await;
        })
    };

    state.swap_runner(Some(runner));
}
