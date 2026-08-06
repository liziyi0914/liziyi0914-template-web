use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::plugin::PluginHandle;
use tauri::Runtime;

use crate::error::{Error, Result};
use crate::models::{AudioFrame, PermissionStatus, RecordingConfig};

pub struct Mic<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartRequest {
    on_frame: Channel,
    #[serde(flatten)]
    config: RecordingConfig,
}

#[derive(Serialize)]
struct RequestPermissionsArgs {
    permissions: Vec<&'static str>,
}

impl<R: Runtime> Mic<R> {
    pub(crate) fn new(handle: PluginHandle<R>) -> Self {
        Self(handle)
    }

    pub fn check_permissions(&self) -> Result<PermissionStatus> {
        self.0
            .run_mobile_plugin("checkPermissions", ())
            .map_err(|e| Error::Plugin(e.to_string()))
    }

    pub fn request_permissions(&self) -> Result<PermissionStatus> {
        self.0
            .run_mobile_plugin(
                "requestPermissions",
                RequestPermissionsArgs {
                    permissions: vec!["microphone"],
                },
            )
            .map_err(|e| Error::Plugin(e.to_string()))
    }

    /// 开始采集。`on_frame` 在 Tauri 的 IPC 线程上被调用，不要在里面做阻塞的活。
    pub fn start<F>(&self, config: RecordingConfig, on_frame: F) -> Result<()>
    where
        F: Fn(Vec<u8>) + Send + Sync + 'static,
    {
        let channel = Channel::new(move |body| {
            // 单帧出问题不值得中断整场录音，记下来继续
            match body.deserialize::<AudioFrame>() {
                Ok(AudioFrame { pcm: Some(pcm), .. }) => match BASE64.decode(pcm) {
                    Ok(bytes) => on_frame(bytes),
                    Err(e) => log::warn!("音频帧 base64 解码失败：{e}"),
                },
                Ok(AudioFrame {
                    error: Some(message),
                    ..
                }) => log::error!("录音采集中断：{message}"),
                Ok(_) => log::warn!("收到既无音频也无错误说明的帧"),
                Err(e) => log::warn!("音频帧结构无法解析：{e}"),
            }
            Ok(())
        });

        self.0
            .run_mobile_plugin::<()>(
                "startRecording",
                StartRequest {
                    on_frame: channel,
                    config,
                },
            )
            .map_err(|e| Error::Plugin(e.to_string()))
    }

    pub fn stop(&self) -> Result<()> {
        self.0
            .run_mobile_plugin::<()>("stopRecording", ())
            .map_err(|e| Error::Plugin(e.to_string()))
    }
}
