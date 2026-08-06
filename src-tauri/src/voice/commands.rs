//! 暴露给前端的两个命令。

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::Mutex;

use super::asr::dashscope_ws::DashScopeWs;
use super::audio::android::AndroidMic;
use super::events::VoiceEvent;
use super::llm::openai_sdk::OpenAiCompatibleModel;
use super::session::{self, SessionDeps, SessionHandle};

#[derive(Default)]
pub struct VoiceState(Mutex<Option<SessionHandle>>);

#[tauri::command]
pub async fn start_asr<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VoiceState>,
    on_event: Channel<VoiceEvent>,
) -> Result<(), String> {
    let mut slot = state.0.lock().await;
    // 重复启动直接报错而不是静默重启：静默重启会让前端以为还是原来那个会话。
    // 已经自行结束的会话不算占位，否则一次识别服务掉线就再也起不来了。
    if slot.as_ref().is_some_and(|session| !session.is_finished()) {
        return Err("语音会话已在运行".to_string());
    }

    let deps = SessionDeps {
        audio: Arc::new(AndroidMic::new(app)),
        asr: Arc::new(DashScopeWs::from_config().map_err(|e| e.to_string())?),
        llm: Arc::new(OpenAiCompatibleModel::from_config().map_err(|e| e.to_string())?),
    };

    *slot = Some(session::spawn(deps, on_event));
    Ok(())
}

#[tauri::command]
pub async fn stop_asr(state: State<'_, VoiceState>) -> Result<(), String> {
    let handle = state.0.lock().await.take();
    if let Some(handle) = handle {
        handle.shutdown().await;
    }
    Ok(())
}
