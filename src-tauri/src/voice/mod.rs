pub mod asr;
pub mod audio;
pub mod commands;
pub mod config;
pub mod error;
pub mod events;
pub mod session;
pub mod tls;
pub mod wake;

// 命令本身不在这里转发：generate_handler! 依赖 #[tauri::command] 生成的
// 隐藏项，那些项不会跟着 pub use 一起过来，必须用定义处的完整路径引用。
pub use commands::VoiceState;

/// 冒烟验证：确认在目标平台上能完成一次 HTTPS 握手。
///
/// 真机调试时用它把「TLS 不通」和「凭据或协议不对」区分开，
/// 等安卓端确认通过后可以连同前端调用一起删掉。
#[tauri::command]
pub async fn tls_smoke_test() -> Result<u16, String> {
    let client = tls::http_client().map_err(|e| e.to_string())?;
    let response = client
        .get("https://dashscope.aliyuncs.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(response.status().as_u16())
}
