//! 安卓录音实现。真正的采集在 tauri-plugin-mic 的 Kotlin 侧，
//! 这里只负责申请权限、把插件回调接到 mpsc 上。
//!
//! 非安卓平台走插件里的桩实现，调用会直接返回不支持，因此这里不需要 cfg。

use async_trait::async_trait;
use tauri::{AppHandle, Runtime};
use tauri_plugin_mic::{MicExt, RecordingConfig};
use tokio::sync::mpsc;

use super::{AudioSource, PcmFrame};
use crate::voice::config;
use crate::voice::error::{Result, VoiceError};

/// 缓冲 64 帧约合 12 秒音频。真到了堆积这么多的地步，
/// 说明上游 WebSocket 已经不通了，丢帧不是主要矛盾。
const FRAME_BUFFER: usize = 64;

pub struct AndroidMic<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> AndroidMic<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    fn ensure_permission(&self) -> Result<()> {
        let mic = self.app.mic();

        let status = mic
            .check_permissions()
            .map_err(|e| VoiceError::Audio(e.to_string()))?;
        if status.microphone.is_granted() {
            return Ok(());
        }

        let status = mic
            .request_permissions()
            .map_err(|e| VoiceError::Audio(e.to_string()))?;
        if status.microphone.is_granted() {
            Ok(())
        } else {
            Err(VoiceError::PermissionDenied)
        }
    }
}

#[async_trait]
impl<R: Runtime> AudioSource for AndroidMic<R> {
    async fn start(&self) -> Result<mpsc::Receiver<PcmFrame>> {
        self.ensure_permission()?;

        let (sender, receiver) = mpsc::channel(FRAME_BUFFER);
        let config = RecordingConfig {
            sample_rate: config::SAMPLE_RATE,
            frame_bytes: config::FRAME_BYTES,
        };

        self.app
            .mic()
            .start(config, move |pcm| {
                // 回调跑在 Tauri 的 IPC 线程上，绝不能在这里阻塞等消费者
                if sender.try_send(pcm).is_err() {
                    log::warn!("音频缓冲已满，丢弃一帧");
                }
            })
            .map_err(|e| VoiceError::Audio(e.to_string()))?;

        Ok(receiver)
    }

    async fn stop(&self) -> Result<()> {
        self.app
            .mic()
            .stop()
            .map_err(|e| VoiceError::Audio(e.to_string()))
    }
}
