mod platform;
#[cfg(desktop)]
mod tray;
mod voice;

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
    .invoke_handler(tauri::generate_handler![
      voice::commands::start_asr,
      voice::commands::stop_asr,
      voice::tls_smoke_test
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      if let Err(error) = tray::init(app.handle()) {
        log::error!("托盘初始化失败: {error}");
      }

      Ok(())
    });

  // 关闭按钮只隐藏窗口，退出由托盘菜单负责；仅桌面端有此语义
  #[cfg(desktop)]
  let builder = builder.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
      if window.label() == "main" {
        api.prevent_close();
        let _ = window.hide();
      }
    }
  });

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
