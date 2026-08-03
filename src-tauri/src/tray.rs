use serde::Deserialize;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, Runtime,
};

/// 前端广播的连接状态投影
const STATE_EVENT: &str = "connection://changed";
/// 托盘菜单请求前端重连
const RECONNECT_EVENT: &str = "tray://reconnect";

const MAIN_WINDOW: &str = "main";
const ICON_SIZE: u32 = 32;

/// 文案由前端拼好，这里只负责渲染，避免业务规则散落两侧
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TraySummary {
    state: String,
    status_line: String,
    robot_line: String,
    tooltip: String,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let title_item = MenuItemBuilder::with_id("title", "GDUFE Classroom")
        .enabled(false)
        .build(app)?;
    let status_item = MenuItemBuilder::with_id("status", "未配置")
        .enabled(false)
        .build(app)?;
    let robot_item = MenuItemBuilder::with_id("robot", "机器人：未知")
        .enabled(false)
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "打开主窗口").build(app)?;
    let reconnect_item = MenuItemBuilder::with_id("reconnect", "重新连接").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&title_item)
        .item(&status_item)
        .item(&robot_item)
        .separator()
        .item(&open_item)
        .item(&reconnect_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let tray = TrayIconBuilder::with_id("status-tray")
        .icon(status_icon("idle"))
        .tooltip("GDUFE Classroom\n未配置")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "reconnect" => {
                if let Err(error) = app.emit(RECONNECT_EVENT, ()) {
                    log::error!("下发重连事件失败: {error}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.listen(STATE_EVENT, move |event| {
        let summary: TraySummary = match serde_json::from_str(event.payload()) {
            Ok(summary) => summary,
            Err(error) => {
                log::warn!("托盘状态解析失败: {error}");
                return;
            }
        };

        let _ = status_item.set_text(&summary.status_line);
        let _ = robot_item.set_text(&summary.robot_line);
        let _ = tray.set_tooltip(Some(&summary.tooltip));
        let _ = tray.set_icon(Some(status_icon(&summary.state)));
    });

    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn status_color(state: &str) -> [u8; 3] {
    match state {
        "connected" => [34, 197, 94],
        "connecting" | "reconnecting" => [234, 179, 8],
        "error" => [239, 68, 68],
        _ => [148, 163, 184],
    }
}

/// 运行时绘制一个状态色圆点，省去为每种状态准备图标资源
fn status_icon(state: &str) -> Image<'static> {
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
