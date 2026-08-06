//! ASR 模型抽象层。上层只认这里的 trait 和事件，不知道底下是 WebSocket 还是别的。

pub mod dashscope_ws;
pub mod protocol;

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::voice::error::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AsrEvent {
    /// 服务端已接受任务，可以开始推音频。
    Started,
    Partial {
        text: String,
        index: u32,
    },
    Final {
        text: String,
        index: u32,
    },
    Finished,
    Failed {
        message: String,
    },
}

#[async_trait]
pub trait AsrSession: Send {
    async fn send_audio(&mut self, pcm: Vec<u8>) -> Result<()>;
    /// 发送结束指令并等待服务端确认。
    async fn finish(&mut self) -> Result<()>;
}

#[async_trait]
pub trait AsrProvider: Send + Sync {
    async fn open(&self, events: mpsc::Sender<AsrEvent>) -> Result<Box<dyn AsrSession>>;
}
