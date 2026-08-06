//! WS 协议层：把 DashScope 的 WebSocket 会话包装成 `AsrProvider` / `AsrSession`。

use std::time::Duration;

use async_trait::async_trait;
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use super::protocol::{self, SentenceIndexer, ServerEvent};
use super::{AsrEvent, AsrProvider, AsrSession};
use crate::voice::config;
use crate::voice::error::{Result, Stage, VoiceError};
use crate::voice::tls;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// 等待 `task-finished` 的上限。超时就直接关连接，不能让停止按钮卡住 UI。
const FINISH_TIMEOUT: Duration = Duration::from_secs(5);

pub struct DashScopeWs {
    url: String,
    api_key: String,
    model: String,
    sample_rate: u32,
}

impl DashScopeWs {
    /// 从编译期配置构造。缺 Key 时在这里就失败，而不是等握手被服务端拒。
    pub fn from_config() -> Result<Self> {
        if config::DASHSCOPE_API_KEY.is_empty() {
            return Err(VoiceError::Config {
                key: "DASHSCOPE_API_KEY",
                stage: Stage::Asr,
            });
        }
        if config::ASR_WS_URL.is_empty() {
            return Err(VoiceError::Config {
                key: "ASR_WS_URL",
                stage: Stage::Asr,
            });
        }
        Ok(Self {
            url: config::ASR_WS_URL.to_string(),
            api_key: config::DASHSCOPE_API_KEY.to_string(),
            model: config::ASR_MODEL.to_string(),
            sample_rate: config::SAMPLE_RATE,
        })
    }
}

#[async_trait]
impl AsrProvider for DashScopeWs {
    async fn open(&self, events: mpsc::Sender<AsrEvent>) -> Result<Box<dyn AsrSession>> {
        tls::ensure_crypto_provider();

        let mut request = self
            .url
            .as_str()
            .into_client_request()
            .map_err(|e| VoiceError::Asr(format!("WebSocket 地址不合法：{e}")))?;
        // 本协议的鉴权 scheme 在文档里是小写 bearer
        let credential = format!("bearer {}", self.api_key)
            .parse()
            .map_err(|_| VoiceError::Asr("API Key 含有不能放进请求头的字符".to_string()))?;
        request.headers_mut().insert("Authorization", credential);

        let (socket, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| VoiceError::Asr(format!("连接语音识别服务失败：{e}")))?;
        let (mut sink, source) = socket.split();

        let task_id = protocol::new_task_id();
        let run_task = protocol::run_task_frame(&task_id, &self.model, self.sample_rate);
        sink.send(Message::Text(run_task.into()))
            .await
            .map_err(|e| VoiceError::Asr(format!("发送 run-task 失败：{e}")))?;

        let (done_tx, done_rx) = oneshot::channel();
        let reader = tokio::spawn(pump(source, events, done_tx));

        Ok(Box::new(DashScopeSession {
            task_id,
            sink,
            done: Some(done_rx),
            reader,
        }))
    }
}

struct DashScopeSession {
    task_id: String,
    sink: SplitSink<Socket, Message>,
    /// 由读取任务在收到终态事件时触发，供 `finish` 等待。
    done: Option<oneshot::Receiver<()>>,
    reader: JoinHandle<()>,
}

#[async_trait]
impl AsrSession for DashScopeSession {
    async fn send_audio(&mut self, pcm: Vec<u8>) -> Result<()> {
        self.sink
            .send(Message::Binary(pcm.into()))
            .await
            .map_err(|e| VoiceError::Asr(format!("发送音频失败：{e}")))
    }

    async fn finish(&mut self) -> Result<()> {
        let frame = protocol::finish_task_frame(&self.task_id);
        let sent = self.sink.send(Message::Text(frame.into())).await;

        if sent.is_ok() {
            if let Some(done) = self.done.take() {
                // 超时不算失败：音频已经发完了，服务端没回执也不影响本次结果
                let _ = tokio::time::timeout(FINISH_TIMEOUT, done).await;
            }
        }

        let _ = self.sink.close().await;
        sent.map_err(|e| VoiceError::Asr(format!("发送 finish-task 失败：{e}")))
    }
}

impl Drop for DashScopeSession {
    fn drop(&mut self) {
        // 会话被丢弃时读取任务会一直挂在 socket 上，必须显式收掉
        self.reader.abort();
    }
}

/// 读取下行帧并翻译成 `AsrEvent`，直到出现终态或连接断开。
async fn pump(
    mut source: futures_util::stream::SplitStream<Socket>,
    events: mpsc::Sender<AsrEvent>,
    done: oneshot::Sender<()>,
) {
    let mut indexer = SentenceIndexer::new();

    let ending = loop {
        let Some(message) = source.next().await else {
            break Some(AsrEvent::Failed {
                message: "语音识别连接已断开".to_string(),
            });
        };

        let text = match message {
            Ok(Message::Text(text)) => text,
            // 服务端不会主动发二进制，ping/pong 由底层处理
            Ok(Message::Close(_)) => {
                break Some(AsrEvent::Failed {
                    message: "语音识别连接被服务端关闭".to_string(),
                })
            }
            Ok(_) => continue,
            Err(e) => {
                break Some(AsrEvent::Failed {
                    message: format!("读取识别结果失败：{e}"),
                })
            }
        };

        let parsed = match protocol::parse_event(&text) {
            Ok(Some(event)) => event,
            Ok(None) => continue,
            Err(e) => {
                break Some(AsrEvent::Failed {
                    message: e.to_string(),
                })
            }
        };

        let is_terminal = matches!(parsed, ServerEvent::Finished | ServerEvent::Failed { .. });
        let event = to_asr_event(parsed, &mut indexer);

        if events.send(event).await.is_err() {
            // 接收端没了，会话已经在关，不必再报错
            break None;
        }
        if is_terminal {
            break None;
        }
    };

    if let Some(event) = ending {
        let _ = events.send(event).await;
    }
    let _ = done.send(());
}

fn to_asr_event(event: ServerEvent, indexer: &mut SentenceIndexer) -> AsrEvent {
    match event {
        ServerEvent::Started => AsrEvent::Started,
        ServerEvent::Finished => AsrEvent::Finished,
        ServerEvent::Failed { message } => AsrEvent::Failed { message },
        ServerEvent::Sentence {
            text,
            begin_time,
            is_final,
        } => {
            let index = indexer.index_for(begin_time);
            if is_final {
                AsrEvent::Final { text, index }
            } else {
                AsrEvent::Partial { text, index }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sentence(text: &str, begin_time: i64, is_final: bool) -> ServerEvent {
        ServerEvent::Sentence {
            text: text.to_string(),
            begin_time,
            is_final,
        }
    }

    #[test]
    fn partials_of_one_sentence_share_an_index() {
        let mut indexer = SentenceIndexer::new();
        assert_eq!(
            to_asr_event(sentence("你", 170, false), &mut indexer),
            AsrEvent::Partial {
                text: "你".to_string(),
                index: 0
            }
        );
        assert_eq!(
            to_asr_event(sentence("你好小财", 170, true), &mut indexer),
            AsrEvent::Final {
                text: "你好小财".to_string(),
                index: 0
            }
        );
    }

    #[test]
    fn a_new_sentence_gets_the_next_index() {
        let mut indexer = SentenceIndexer::new();
        to_asr_event(sentence("你好小财", 170, true), &mut indexer);
        assert_eq!(
            to_asr_event(sentence("打开投影仪", 1200, true), &mut indexer),
            AsrEvent::Final {
                text: "打开投影仪".to_string(),
                index: 1
            }
        );
    }

    #[test]
    fn lifecycle_events_pass_through() {
        let mut indexer = SentenceIndexer::new();
        assert_eq!(
            to_asr_event(ServerEvent::Started, &mut indexer),
            AsrEvent::Started
        );
        assert_eq!(
            to_asr_event(ServerEvent::Finished, &mut indexer),
            AsrEvent::Finished
        );
        assert_eq!(
            to_asr_event(
                ServerEvent::Failed {
                    message: "boom".to_string()
                },
                &mut indexer
            ),
            AsrEvent::Failed {
                message: "boom".to_string()
            }
        );
    }
}
