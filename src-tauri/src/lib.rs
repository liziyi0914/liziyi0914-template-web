#[cfg(desktop)]
mod tray;

mod llm;
mod platform;
mod voice;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // reqwest 开了 rustls-no-provider 后，进程内任何 Client（含 Tauri 移动端
  // dev 协议）在 build 前都必须有 process-default CryptoProvider，否则直接 abort。
  // 必须放在 Builder 之前：Tauri 会在创建 webview 协议处理器时立刻建 Client。
  voice::tls::ensure_crypto_provider();

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_mic::init())
    .manage(voice::VoiceState::default())
    .manage(Arc::new(platform::state::PlatformState::default()))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
        app.manage(Arc::new(platform::BrowserManager::default()));
        if let Err(error) = tray::init(app.handle()) {
          log::error!("托盘初始化失败: {error}");
        }
      }

      // 大屏是开机常驻程序，不该要求用户在 UI 上点一下才连
      let handle = app.handle().clone();
      let state = app
        .state::<Arc<platform::state::PlatformState>>()
        .inner()
        .clone();
      let config = platform::config::load(&handle);
      platform::commands::start(handle, state, config);

      Ok(())
    });

  #[cfg(desktop)]
  let builder = builder.invoke_handler(tauri::generate_handler![
    voice::commands::start_asr,
    voice::commands::stop_asr,
    voice::tls_smoke_test,
    platform::commands::platform_config_get,
    platform::commands::platform_config_set,
    platform::commands::platform_connect,
    platform::commands::platform_disconnect,
    platform::commands::platform_connection_info,
    platform::commands::platform_recent_logs,
    platform::commands::screen_app_browser_status,
  ]);

  #[cfg(mobile)]
  let builder = builder.invoke_handler(tauri::generate_handler![
    voice::commands::start_asr,
    voice::commands::stop_asr,
    voice::tls_smoke_test,
    platform::commands::platform_config_get,
    platform::commands::platform_config_set,
    platform::commands::platform_connect,
    platform::commands::platform_disconnect,
    platform::commands::platform_connection_info,
    platform::commands::platform_recent_logs,
  ]);

  // 关闭按钮只隐藏窗口，退出由托盘菜单负责；窗口真正销毁时顺手收掉 Chrome，
  // 免得残留一个没有父进程的浏览器。两件事必须在同一个闭包里：
  // on_window_event 只能注册一次，后注册的会覆盖前一个。
  #[cfg(desktop)]
  let builder = builder.on_window_event(|window, event| match event {
    tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
      api.prevent_close();
      let _ = window.hide();
    }
    tauri::WindowEvent::Destroyed if window.label() == "main" => {
      if let Some(browser) = window
        .app_handle()
        .try_state::<Arc<platform::BrowserManager>>()
      {
        browser.close();
      }
    }
    _ => {}
  });

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
