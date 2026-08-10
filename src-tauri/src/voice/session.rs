//! 会话编排器。唯一同时知道录音链路和命令投递口的地方。

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use super::asr::{AsrEvent, AsrProvider, AsrSession};
use super::audio::AudioSource;
use super::config;
use super::error::{Result, VoiceError};
use super::events::{SessionState, VoiceEvent};
use super::wake::{WakeDetector, WakeOutcome};

/// 等待服务端接受任务的上限。握手过了但迟迟不回 task-started，
/// 多半是模型名或参数不对，早点报错比让用户对着麦克风干等强。
const START_TIMEOUT: Duration = Duration::from_secs(10);

const ASR_EVENT_BUFFER: usize = 64;

pub struct SessionHandle {
    stop: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}

impl SessionHandle {
    /// 会话可能因识别服务断开等原因自行结束，此时留在状态里的句柄已经没用了。
    pub fn is_finished(&self) -> bool {
        self.task.is_finished()
    }

    /// 通知会话停止并等它收尾。
    pub async fn shutdown(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        let _ = self.task.await;
    }
}

pub struct SessionDeps {
    pub audio: Arc<dyn AudioSource>,
    pub asr: Arc<dyn AsrProvider>,
    /// 命令句的投递口。没有接收方（比如机器人还没授权）时投递失败，
    /// 只丢这一条命令，麦克风继续开着。
    pub commands: Option<mpsc::Sender<String>>,
}

pub fn spawn(deps: SessionDeps, events: Channel<VoiceEvent>) -> SessionHandle {
    let (stop_tx, stop_rx) = oneshot::channel();
    let task = tokio::spawn(async move {
        let _ = events.send(VoiceEvent::State {
            state: SessionState::Starting,
        });

        if let Err(error) = run(deps, &events, stop_rx).await {
            log::error!("语音会话终止：{error}");
            let _ = events.send(VoiceEvent::error(&error));
        }

        let _ = events.send(VoiceEvent::State {
            state: SessionState::Stopped,
        });
    });

    SessionHandle {
        stop: Some(stop_tx),
        task,
    }
}

async fn run(
    deps: SessionDeps,
    events: &Channel<VoiceEvent>,
    mut stop: oneshot::Receiver<()>,
) -> Result<()> {
    let (asr_tx, mut asr_rx) = mpsc::channel(ASR_EVENT_BUFFER);
    let mut asr = deps.asr.open(asr_tx).await?;

    // 先确认服务端接受了任务再开麦克风，否则录进来的音频只能丢
    await_started(&mut asr_rx).await?;

    let mut frames = deps.audio.start().await?;
    let _ = events.send(VoiceEvent::State {
        state: SessionState::Listening,
    });

    let outcome = pump(
        deps.commands.clone(),
        events,
        &mut asr,
        &mut frames,
        &mut asr_rx,
        &mut stop,
    )
    .await;

    // 无论因何退出都要收拾干净，麦克风不能留着
    if let Err(error) = deps.audio.stop().await {
        log::warn!("停止录音失败：{error}");
    }
    if let Err(error) = asr.finish().await {
        log::warn!("关闭识别会话失败：{error}");
    }

    outcome
}

async fn await_started(asr_rx: &mut mpsc::Receiver<AsrEvent>) -> Result<()> {
    let wait = async {
        while let Some(event) = asr_rx.recv().await {
            match event {
                AsrEvent::Started => return Ok(()),
                AsrEvent::Failed { message } => return Err(VoiceError::Asr(message)),
                _ => continue,
            }
        }
        Err(VoiceError::Asr(
            "识别服务在任务开始前关闭了连接".to_string(),
        ))
    };

    tokio::time::timeout(START_TIMEOUT, wait)
        .await
        .map_err(|_| VoiceError::Asr("识别服务未在预期时间内接受任务".to_string()))?
}

async fn pump(
    commands: Option<mpsc::Sender<String>>,
    events: &Channel<VoiceEvent>,
    asr: &mut Box<dyn AsrSession>,
    frames: &mut mpsc::Receiver<Vec<u8>>,
    asr_rx: &mut mpsc::Receiver<AsrEvent>,
    stop: &mut oneshot::Receiver<()>,
) -> Result<()> {
    let mut detector = WakeDetector::new(
        config::WAKE_WORD,
        Duration::from_secs(config::ARMED_TIMEOUT_SECS),
    );

    loop {
        tokio::select! {
            _ = &mut *stop => return Ok(()),

            frame = frames.recv() => match frame {
                Some(pcm) => asr.send_audio(pcm).await?,
                None => return Err(VoiceError::Audio("录音数据流已中断".to_string())),
            },

            event = asr_rx.recv() => match event {
                Some(event) => {
                    if let Some(error) = handle_asr_event(event, commands.as_ref(), events, &mut detector) {
                        return Err(error);
                    }
                }
                None => return Err(VoiceError::Asr("识别事件流已中断".to_string())),
            },
        }
    }
}

/// 返回 `Some` 表示这是个终止会话的错误。
fn handle_asr_event(
    event: AsrEvent,
    commands: Option<&mpsc::Sender<String>>,
    events: &Channel<VoiceEvent>,
    detector: &mut WakeDetector,
) -> Option<VoiceError> {
    match event {
        AsrEvent::Started => None,

        AsrEvent::Partial { text, index } => {
            let _ = events.send(VoiceEvent::Transcript {
                text,
                index,
                is_final: false,
            });
            None
        }

        AsrEvent::Final { text, index } => {
            let _ = events.send(VoiceEvent::Transcript {
                text: text.clone(),
                index,
                is_final: true,
            });

            match detector.on_final(&text, Instant::now()) {
                WakeOutcome::None => {}
                WakeOutcome::Awakened => {
                    let _ = events.send(VoiceEvent::Wake);
                }
                WakeOutcome::Command(utterance) => {
                    let _ = events.send(VoiceEvent::Wake);
                    let _ = events.send(VoiceEvent::Command {
                        text: utterance.clone(),
                    });
                    dispatch_command(commands, utterance);
                }
            }
            None
        }

        AsrEvent::Finished => Some(VoiceError::Asr("识别任务已被服务端结束".to_string())),
        AsrEvent::Failed { message } => Some(VoiceError::Asr(message)),
    }
}

/// 用 `try_send` 而不是 `send`：这里在音频泵的线程上，
/// 阻塞等 Agent 腾出位置会让麦克风的帧堆积起来。
fn dispatch_command(commands: Option<&mpsc::Sender<String>>, utterance: String) {
    let Some(sender) = commands else {
        log::warn!("收到命令「{utterance}」但没有接收方，可能机器人尚未授权");
        return;
    };
    if let Err(error) = sender.try_send(utterance) {
        log::warn!("命令投递失败：{error}");
    }
}
