pub mod commands;
pub mod config;
pub mod events;
pub mod robot;
pub mod state;

#[cfg(desktop)]
pub mod screen_app;

use config::RoleConfig;
use state::PlatformState;
use std::sync::Arc;
use tauri::AppHandle;

#[cfg(desktop)]
pub use screen_app::browser::BrowserManager;

/// 桌面端跑大屏角色，移动端跑机器人角色（第二份计划实现）。
#[cfg(desktop)]
pub async fn run_role(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    use tauri::Manager;

    let browser = app
        .try_state::<Arc<BrowserManager>>()
        .map(|managed| managed.inner().clone())
        .unwrap_or_default();
    screen_app::run(app, state, browser, config).await;
}

#[cfg(mobile)]
pub async fn run_role(app: AppHandle, state: Arc<PlatformState>, config: RoleConfig) {
    robot::run(app, state, config).await;
}
