//! 录音抽象层。编排器只认这个 trait，不关心声音从哪来。

pub mod android;

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::voice::error::Result;

/// 一帧 PCM16 单声道音频。
pub type PcmFrame = Vec<u8>;

#[async_trait]
pub trait AudioSource: Send + Sync {
    async fn start(&self) -> Result<mpsc::Receiver<PcmFrame>>;
    async fn stop(&self) -> Result<()>;
}
