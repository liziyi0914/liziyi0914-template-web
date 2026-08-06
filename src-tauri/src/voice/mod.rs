pub mod asr;
pub mod config;
pub mod error;
pub mod llm;
pub mod tls;
pub mod wake;

/// 冒烟验证：确认在目标平台上能完成一次 HTTPS 握手。
/// Task 1 验证通过后由 Task 11 删除。
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
