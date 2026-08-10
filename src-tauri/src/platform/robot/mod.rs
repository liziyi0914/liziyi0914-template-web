//! 机器人角色：Device Flow 授权 → `/ws/robot` → 语音指令交给带工具的模型。
//!
//! 桌面上也编译，因为单测跑在宿主机上；真正的平台分支只在 command 注册与
//! `run_role` 上。

pub mod agent;
pub mod context;
pub mod device_flow;
pub mod tools;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use tauri::AppHandle;
use teaching_platform::error::{code, ApiError, PlatformError};
use teaching_platform::http::HttpClient;
use teaching_platform::ws::backoff::Backoff;
use teaching_platform::ws::conn::{CloseReason, ConnectOptions, Connection, InboundHandler};
use teaching_platform::ws::event::ServerEvent;
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio::task::JoinHandle;

use crate::llm::openai_sdk::OpenAiCompatibleModel;
use crate::llm::TextModel;
use crate::platform::config::RobotConfig;
use crate::platform::events::{now_ms, ConnectionState, LogLevel, LogSource};
use crate::platform::state::PlatformState;
use agent::{Agent, ToolInvoker};
use context::ContextStore;

/// 机器人连的是这个固定路径，设备 token 响应里不带 ws_url。
const WS_PATH: &str = "/ws/robot";

/// 命令队列容量。老师连说几句时排队处理，满了就丢——
/// 投递方用的是 `try_send`，绝不能把音频泵堵住。
const COMMAND_BUFFER: usize = 8;

/// 设备 token 到期前多久主动重走 Device Flow。它没有刷新接口，
/// 只能提前一点让老师重新扫码，而不是在半节课中间突然掉线。
const REAUTH_LEAD_SECS: u64 = 300;
const MIN_SESSION_SECS: u64 = 60;

/// Agent 请连接循环代发一条指令。
struct ToolRequest {
    op: String,
    params: Value,
    reply: oneshot::Sender<std::result::Result<Value, ApiError>>,
}

/// 当前连接的插槽。Agent 只认这个 mpsc，所以它的寿命与任何一条连接无关。
///
/// 不存 `Arc<Connection>`：`Connection::close(self)` 要拿所有权，塞进 Arc 就
/// 再也关不掉，而它内部有三个 spawn 出来的任务，不关就是每次重连漏三个。
#[derive(Default)]
struct ConnectionSlot {
    sender: RwLock<Option<mpsc::Sender<ToolRequest>>>,
}

impl ConnectionSlot {
    async fn set(&self, sender: Option<mpsc::Sender<ToolRequest>>) {
        *self.sender.write().await = sender;
    }
}

#[async_trait]
impl ToolInvoker for ConnectionSlot {
    async fn invoke(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError> {
        let sender = self.sender.read().await.clone().ok_or_else(offline)?;
        let (reply, wait) = oneshot::channel();

        sender
            .send(ToolRequest {
                op: op.to_string(),
                params,
                reply,
            })
            .await
            .map_err(|_| offline())?;

        // 连接在等待期间断了，转发端会被丢掉，这里立刻拿到 Err 而不是干等
        wait.await.unwrap_or_else(|_| Err(offline()))
    }
}

/// 这句会被模型转述给老师，得是人话。
fn offline() -> ApiError {
    ApiError {
        code: code::DEVICE_OFFLINE,
        message: "机器人还没连上教学平台，稍后再试".to_string(),
    }
}

fn unsupported(op: &str) -> ApiError {
    ApiError {
        code: code::UNSUPPORTED_OP,
        message: format!("机器人不接受指令：{op}"),
    }
}

fn api_error_of(error: PlatformError) -> ApiError {
    match error {
        PlatformError::Api(api) => api,
        other => ApiError {
            code: code::INTERNAL,
            message: other.to_string(),
        },
    }
}

struct RobotHandler {
    app: AppHandle,
    state: Arc<PlatformState>,
    context: Arc<RwLock<ContextStore>>,
    kicked: Arc<AtomicBool>,
}

#[async_trait]
impl InboundHandler for RobotHandler {
    async fn on_request(&self, op: &str, _params: Value) -> std::result::Result<Value, ApiError> {
        Err(unsupported(op))
    }

    async fn on_event(&self, op: &str, data: Value) {
        let event = ServerEvent::parse(op, data);
        self.context.write().await.apply_event(&event);

        match &event {
            ServerEvent::Kicked { reason } => {
                self.kicked.store(true, Ordering::SeqCst);
                self.state.log(
                    &self.app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "已被顶号",
                    Some(reason.clone()),
                );
            }

            ServerEvent::LessonStarted { lesson } => {
                let lesson = lesson.clone();
                let title = lesson.title.clone();
                self.state.update(&self.app, |info| {
                    info.lesson_id = lesson.lesson_id;
                    info.lesson_title = lesson.title.clone();
                    info.course_name = lesson.course_name.clone();
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    format!("课堂开始：{}", title.as_deref().unwrap_or("未知课堂")),
                    None,
                );
            }

            ServerEvent::LessonEnded { .. } => {
                self.state.update(&self.app, |info| {
                    info.lesson_id = None;
                    info.lesson_title = None;
                    info.course_name = None;
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    "课堂结束",
                    None,
                );
            }

            // 现场状态已经进 ContextStore 了，不必逐条刷 UI
            _ => log::debug!("现场事件 {op}"),
        }
    }
}

/// Agent 任务的守卫。`platform_disconnect` 会直接 abort 连接循环，
/// 那时 `run()` 尾部的清理不会执行，但 Drop 会。
struct AgentGuard {
    task: JoinHandle<()>,
    state: Arc<PlatformState>,
}

impl Drop for AgentGuard {
    fn drop(&mut self) {
        self.task.abort();
        self.state.set_command_sender(None);
    }
}

/// 常驻循环。除顶号、凭证被拒与授权被拒外不会主动退出。
pub async fn run(app: AppHandle, state: Arc<PlatformState>, config: RobotConfig) {
    let http = match crate::voice::tls::http_client() {
        Ok(client) => HttpClient::new(config.base.base_url(), client),
        Err(error) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(format!("初始化 HTTP 客户端失败：{error}"));
            });
            return;
        }
    };

    // 没有模型的机器人连上了也听不懂话，配置缺失要显式报出来而不是装作正常
    let model: Arc<dyn TextModel> = match OpenAiCompatibleModel::from_config() {
        Ok(model) => Arc::new(model),
        Err(error) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(error.to_string());
            });
            state.log(
                &app,
                LogLevel::Error,
                LogSource::Agent,
                "语音指令不可用",
                Some(error.to_string()),
            );
            return;
        }
    };

    let context = Arc::new(RwLock::new(ContextStore::default()));
    let slot = Arc::new(ConnectionSlot::default());
    let (commands, inbox) = mpsc::channel::<String>(COMMAND_BUFFER);
    state.set_command_sender(Some(commands));

    let _guard = AgentGuard {
        task: tokio::spawn(agent_loop(
            app.clone(),
            state.clone(),
            context.clone(),
            slot.clone(),
            model,
            inbox,
        )),
        state: state.clone(),
    };

    let kicked = Arc::new(AtomicBool::new(false));
    let mut backoff = Backoff::new();
    let mut first = true;

    loop {
        state.update(&app, |info| {
            info.state = if first {
                ConnectionState::Connecting
            } else {
                ConnectionState::Reconnecting
            };
            if !first {
                info.reconnect_count = info.reconnect_count.saturating_add(1);
            }
        });
        first = false;

        match session_once(&app, &state, &http, &config, &context, &slot, &kicked).await {
            Ok(reason) => {
                // 连接成功建立过，不该背上一次失败的退避时长
                backoff.reset();

                if reason.is_kicked() || kicked.load(Ordering::SeqCst) {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.kicked = true;
                        info.connected_at = None;
                        info.last_error =
                            Some("同一设备已在别处连接，已停止自动重连".to_string());
                    });
                    state.log(
                        &app,
                        LogLevel::Error,
                        LogSource::Connection,
                        "被顶号，停止自动重连",
                        None,
                    );
                    return;
                }

                state.log(
                    &app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "连接已断开",
                    Some(reason.message.clone()),
                );
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(reason.message);
                });
            }

            Err(error) => {
                // 授权被拒/过期与凭证错误都归在这里：自动重来只会刷出一串没人扫的码
                if error.is_credential() {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.connected_at = None;
                        info.last_error = Some(error.to_string());
                    });
                    state.log(
                        &app,
                        LogLevel::Error,
                        LogSource::Connection,
                        "授权被拒绝，已停止重试",
                        Some(error.to_string()),
                    );
                    return;
                }

                state.log(
                    &app,
                    LogLevel::Warn,
                    LogSource::Connection,
                    "连接失败",
                    Some(error.to_string()),
                );
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(error.to_string());
                });
            }
        }

        let delay = backoff.next_delay();
        log::info!("{} 秒后重连", delay.as_secs_f32());
        tokio::time::sleep(delay).await;
    }
}

/// 一次「授权 + 连接 + 待到断开」。设备 token 没有刷新接口，
/// 所以每次进来都重走 Device Flow。
async fn session_once(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &RobotConfig,
    context: &Arc<RwLock<ContextStore>>,
    slot: &Arc<ConnectionSlot>,
    kicked: &Arc<AtomicBool>,
) -> std::result::Result<CloseReason, PlatformError> {
    let session = device_flow::authorize(app, state, http, config).await?;
    let url = http.resolve_ws_url(WS_PATH);

    let handler: Arc<dyn InboundHandler> = Arc::new(RobotHandler {
        app: app.clone(),
        state: state.clone(),
        context: context.clone(),
        kicked: kicked.clone(),
    });

    // 机器人不传 lesson_id，服务端按设备绑定的教室决定房间
    let (conn, snapshot) = Connection::open(
        ConnectOptions {
            url: url.clone(),
            token: session.access_token,
        },
        handler,
    )
    .await?;

    context.write().await.apply_snapshot(&snapshot);

    state.update(app, |info| {
        info.state = ConnectionState::Connected;
        info.connected_at = Some(now_ms());
        info.last_error = None;
        info.kicked = false;
        info.classroom_id = snapshot.classroom_id.or(session.classroom_id);
        info.lesson_id = snapshot.lesson_id.or(session.lesson_id);
        info.lesson_title = snapshot.lesson.as_ref().map(|lesson| lesson.title.clone());
        info.course_name = snapshot
            .lesson
            .as_ref()
            .and_then(|lesson| lesson.course_name.clone());
    });
    state.log(
        app,
        LogLevel::Success,
        LogSource::Connection,
        "已连接到教学平台",
        Some(url),
    );

    let (tools_tx, mut tools_rx) = mpsc::channel::<ToolRequest>(4);
    slot.set(Some(tools_tx)).await;

    let reauth_after = std::time::Duration::from_secs(
        session
            .expires_in
            .saturating_sub(REAUTH_LEAD_SECS)
            .max(MIN_SESSION_SECS),
    );
    // 必须先建好再 pin：写在 select! 分支里的话每收一条指令就把计时器重置了，
    // token 就永远等不到过期
    let reauth = tokio::time::sleep(reauth_after);
    tokio::pin!(reauth);

    // 指令串行代发：并发发会让 PPT 一次翻两页
    let reason = loop {
        tokio::select! {
            reason = conn.wait_closed() => break reason,

            _ = &mut reauth => break CloseReason {
                code: None,
                message: "设备 token 即将过期，需要重新授权".to_string(),
            },

            request = tools_rx.recv() => match request {
                Some(request) => {
                    let result = conn
                        .call(&request.op, request.params)
                        .await
                        .map_err(api_error_of);
                    let _ = request.reply.send(result);
                }
                // 插槽的发送端只有 Agent 持有，它没了说明整个角色在收摊
                None => break CloseReason {
                    code: None,
                    message: "指令通道已关闭".to_string(),
                },
            },
        }
    };

    slot.set(None).await;
    conn.close().await;
    Ok(reason)
}

/// 串行处理命令。一次只处理一条：老师连说两句时第二条排队，
/// 并发执行会让 PPT 翻两页。
async fn agent_loop(
    app: AppHandle,
    state: Arc<PlatformState>,
    context: Arc<RwLock<ContextStore>>,
    slot: Arc<ConnectionSlot>,
    model: Arc<dyn TextModel>,
    mut inbox: mpsc::Receiver<String>,
) {
    let mut agent = Agent::new(model);

    while let Some(cmd) = inbox.recv().await {
        // 渲染完立刻放锁：一次模型往返要好几秒，握着读锁会挡住事件更新
        let site = context.read().await.render();

        state.log(
            &app,
            LogLevel::Info,
            LogSource::Command,
            format!("收到指令：{cmd}"),
            Some(site.clone()),
        );

        match agent.handle(&cmd, &site, slot.as_ref()).await {
            Ok(outcome) => {
                if !outcome.invoked.is_empty() {
                    state.log(
                        &app,
                        LogLevel::Info,
                        LogSource::Command,
                        format!("已执行 {}", outcome.invoked.join("、")),
                        None,
                    );
                }
                state.log(
                    &app,
                    LogLevel::Success,
                    LogSource::Agent,
                    outcome.reply,
                    Some(outcome.raw.join("\n\n")),
                );
            }
            Err(error) => {
                // 只丢这一条命令，麦克风继续开着
                state.log(
                    &app,
                    LogLevel::Error,
                    LogSource::Agent,
                    format!("处理指令失败：{error}"),
                    None,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 入站指令一律回_40006_并带上_op_名() {
        // 协议规定服务端只向 screen-web / screen-app 转发 req。真收到了也要回
        // 一帧 error 而不是静默忽略：静默会让发起方干等到 10 秒超时
        let error = unsupported("ppt.next");
        assert_eq!(error.code, code::UNSUPPORTED_OP);
        assert!(error.message.contains("ppt.next"));
    }

    #[test]
    fn 后端业务错误原样交给模型() {
        let error = api_error_of(PlatformError::Api(ApiError {
            code: 40007,
            message: "当前页已变化".into(),
        }));
        assert_eq!(error.code, 40007);
        assert_eq!(error.message, "当前页已变化");
    }

    #[test]
    fn 非业务错误归成内部错误但保留人话() {
        let error = api_error_of(PlatformError::Timeout);
        assert_eq!(error.code, code::INTERNAL);
        assert_eq!(error.message, "等待响应超时");
    }

    #[tokio::test]
    async fn 没连上时工具调用立刻报离线() {
        let slot = ConnectionSlot::default();
        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("没连上必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
        assert!(!error.message.trim().is_empty(), "这句会被模型转述给老师");
    }

    #[tokio::test]
    async fn 装上插槽后工具调用被转发() {
        let slot = ConnectionSlot::default();
        let (tx, mut rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;

        // 冒充连接循环：收到请求就回一个 ack
        tokio::spawn(async move {
            let request = rx.recv().await.expect("应收到工具请求");
            assert_eq!(request.op, "ppt.next");
            assert_eq!(request.params, serde_json::json!({ "expect_page": 5 }));
            let _ = request.reply.send(Ok(serde_json::json!({ "page": 6 })));
        });

        let data = slot
            .invoke("ppt.next", serde_json::json!({ "expect_page": 5 }))
            .await
            .expect("应拿到 ack");
        assert_eq!(data, serde_json::json!({ "page": 6 }));
    }

    #[tokio::test]
    async fn 连接消失后插槽退回离线() {
        let slot = ConnectionSlot::default();
        let (tx, rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;
        slot.set(None).await;
        drop(rx);

        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("插槽空了必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
    }

    #[tokio::test]
    async fn 连接循环没人应答时也不会永远挂着() {
        // 转发端还在但接收端已经没了，说明连接刚断，要立刻回错误而不是等
        let slot = ConnectionSlot::default();
        let (tx, rx) = mpsc::channel::<ToolRequest>(1);
        slot.set(Some(tx)).await;
        drop(rx);

        let error = slot
            .invoke("ppt.next", serde_json::json!({}))
            .await
            .expect_err("接收端没了必须失败");
        assert_eq!(error.code, code::DEVICE_OFFLINE);
    }
}
