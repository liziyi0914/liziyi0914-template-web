use crate::platform::config;
use crate::platform::events::{ConnectionInfo, ConnectionState};
use crate::platform::state::PlatformState;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};

const MAIN_WINDOW: &str = "main";
const ICON_SIZE: u32 = 32;

/// 托盘的菜单项句柄。状态由 Rust 直接写入，不再让前端 emit 一圈绕回来。
/// `MenuItem` 没有像 `TrayIcon` 那样的 `default_runtime`，必须显式写 `Wry`。
struct TrayHandles {
    tray: TrayIcon,
    status: MenuItem<Wry>,
    detail: MenuItem<Wry>,
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let title_item = MenuItemBuilder::with_id("title", "GDUFE Classroom")
        .enabled(false)
        .build(app)?;
    let status_item = MenuItemBuilder::with_id("status", "未配置")
        .enabled(false)
        .build(app)?;
    let detail_item = MenuItemBuilder::with_id("detail", "课堂：未知")
        .enabled(false)
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "打开主窗口").build(app)?;
    let reconnect_item = MenuItemBuilder::with_id("reconnect", "重新连接").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&title_item)
        .item(&status_item)
        .item(&detail_item)
        .separator()
        .item(&open_item)
        .item(&reconnect_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let tray = TrayIconBuilder::with_id("status-tray")
        .icon(status_icon(ConnectionState::Idle))
        .tooltip("GDUFE Classroom\n未配置")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "reconnect" => reconnect(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayHandles {
        tray,
        status: status_item,
        detail: detail_item,
    });

    Ok(())
}

/// 连接状态每次变化都会调到这里。托盘不存在时静默返回。
pub fn sync(app: &AppHandle, info: &ConnectionInfo) {
    let Some(handles) = app.try_state::<TrayHandles>() else {
        return;
    };

    let status = status_line(info);
    let detail = detail_line(info);

    let _ = handles.status.set_text(&status);
    let _ = handles.detail.set_text(&detail);
    let _ = handles
        .tray
        .set_tooltip(Some(&format!("GDUFE Classroom\n{status}\n{detail}")));
    let _ = handles.tray.set_icon(Some(status_icon(info.state)));
}

fn reconnect(app: &AppHandle) {
    let Some(state) = app.try_state::<Arc<PlatformState>>() else {
        return;
    };
    let state = state.inner().clone();
    let config = config::load(app);
    crate::platform::commands::start(app.clone(), state, config);
}

fn status_line(info: &ConnectionInfo) -> String {
    match info.state {
        ConnectionState::Idle => "未配置".into(),
        ConnectionState::Authorizing => "等待授权".into(),
        ConnectionState::Connecting => "连接中".into(),
        ConnectionState::Connected => "已连接".into(),
        ConnectionState::Reconnecting => format!("重连中（第 {} 次）", info.reconnect_count),
        ConnectionState::Disconnected => "已断开".into(),
        ConnectionState::Error if info.kicked => "已在别处连接".into(),
        ConnectionState::Error => "连接异常".into(),
    }
}

fn detail_line(info: &ConnectionInfo) -> String {
    match (&info.lesson_title, info.classroom_id) {
        (Some(title), _) => format!("课堂：{title}"),
        (None, Some(classroom)) => format!("教室：{classroom}"),
        (None, None) => "课堂：未知".into(),
    }
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn status_color(state: ConnectionState) -> [u8; 3] {
    match state {
        ConnectionState::Connected => [34, 197, 94],
        ConnectionState::Connecting | ConnectionState::Reconnecting | ConnectionState::Authorizing => {
            [234, 179, 8]
        }
        ConnectionState::Error => [239, 68, 68],
        _ => [148, 163, 184],
    }
}

/// 运行时绘制一个状态色圆点，省去为每种状态准备图标资源
fn status_icon(state: ConnectionState) -> Image<'static> {
    let [r, g, b] = status_color(state);
    let center = (ICON_SIZE as f32 - 1.0) / 2.0;
    let radius = ICON_SIZE as f32 / 2.0 - 1.0;

    let mut rgba = Vec::with_capacity((ICON_SIZE * ICON_SIZE * 4) as usize);
    for y in 0..ICON_SIZE {
        for x in 0..ICON_SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            // 边缘一像素内做线性淡出，避免锯齿
            let coverage = (radius - distance).clamp(0.0, 1.0);
            rgba.extend_from_slice(&[r, g, b, (coverage * 255.0) as u8]);
        }
    }

    Image::new_owned(rgba, ICON_SIZE, ICON_SIZE)
}
