pub mod browser;

use crate::platform::config::ScreenAppConfig;
use crate::platform::events::{ConnectionState, LogLevel, LogSource};
use crate::platform::state::PlatformState;
use async_trait::async_trait;
use browser::BrowserManager;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use teaching_platform::error::{code, ApiError, PlatformError};
use teaching_platform::http::HttpClient;
use teaching_platform::ws::backoff::Backoff;
use teaching_platform::ws::conn::{CloseReason, ConnectOptions, Connection, InboundHandler};
use teaching_platform::ws::event::ServerEvent;

/// token 到期前一小时主动换票重连，别等它在半节课中间失效
const RENEW_LEAD_SECS: u64 = 3_600;
const MIN_RENEW_SECS: u64 = 60;

fn version() -> String {
    format!("gdufe-screen-app/{}", env!("CARGO_PKG_VERSION"))
}

struct ScreenHandler {
    app: AppHandle,
    state: Arc<PlatformState>,
    browser: Arc<BrowserManager>,
    kicked: Arc<AtomicBool>,
}

#[async_trait]
impl InboundHandler for ScreenHandler {
    async fn on_request(&self, op: &str, params: Value) -> Result<Value, ApiError> {
        match op {
            "app.open_url" => {
                let url = params
                    .get("url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();

                if url.is_empty() {
                    return Err(ApiError { code: 40001, message: "指令缺少 url 参数".into() });
                }

                match self.browser.open_url(&url) {
                    Ok(()) => {
                        self.state.log(
                            &self.app,
                            LogLevel::Success,
                            LogSource::Browser,
                            "已打开演示大屏",
                            Some(url.clone()),
                        );
                        Ok(json!({ "ok": true, "url": url }))
                    }
                    Err(message) => {
                        self.state.log(
                            &self.app,
                            LogLevel::Error,
                            LogSource::Browser,
                            message.clone(),
                            Some(url),
                        );
                        // message 会被转回发起方，可能被 TTS 念出来，所以要是人话
                        Err(ApiError { code: code::INTERNAL, message })
                    }
                }
            }

            "app.close_browser" => {
                let closed = self.browser.close();
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Browser,
                    if closed { "已关闭浏览器" } else { "浏览器本来就没开" },
                    None,
                );
                Ok(json!({ "ok": true, "closed": closed }))
            }

            "app.status" => Ok(json!({
                "version": version(),
                "browser_running": self.browser.running(),
            })),

            other => Err(ApiError {
                code: code::UNSUPPORTED_OP,
                message: format!("大屏端不支持的指令：{other}"),
            }),
        }
    }

    async fn on_event(&self, op: &str, data: Value) {
        match ServerEvent::parse(op, data) {
            ServerEvent::Kicked { reason } => {
                self.kicked.store(true, Ordering::SeqCst);
                self.state.log(&self.app, LogLevel::Warn, LogSource::Connection, "已被顶号", Some(reason));
            }

            // 大屏开机常驻，一条连接会跨很多次课堂，服务端在课堂起止时把它重挂到
            // 新房间。登录快照里的 lesson_id 只在首帧正确，之后必须以事件为准。
            ServerEvent::LessonStarted { lesson } => {
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

            ServerEvent::LessonEnded { lesson } => {
                let title = lesson.title.clone();
                self.state.update(&self.app, |info| {
                    info.lesson_id = None;
                    info.lesson_title = None;
                    info.course_name = None;
                });
                self.state.log(
                    &self.app,
                    LogLevel::Info,
                    LogSource::Connection,
                    format!("课堂结束：{}", title.as_deref().unwrap_or("未知课堂")),
                    None,
                );
            }

            ServerEvent::Unknown { op, .. } => {
                log::debug!("忽略事件 {op}");
            }
        }
    }
}

/// 常驻重连循环。除顶号与凭证错误外不会主动退出。
pub async fn run(
    app: AppHandle,
    state: Arc<PlatformState>,
    browser: Arc<BrowserManager>,
    config: ScreenAppConfig,
) {
    browser.configure(config.chrome_path.clone(), config.kiosk);

    let http = match crate::voice::tls::http_client() {
        Ok(client) => HttpClient::new(config.base.base_url(), client),
        Err(e) => {
            state.update(&app, |info| {
                info.state = ConnectionState::Error;
                info.last_error = Some(format!("初始化 HTTP 客户端失败：{e}"));
            });
            return;
        }
    };

    let kicked = Arc::new(AtomicBool::new(false));
    let mut backoff = Backoff::new();
    let mut first = true;

    loop {
        state.update(&app, |info| {
            info.state = if first { ConnectionState::Connecting } else { ConnectionState::Reconnecting };
            if !first {
                info.reconnect_count = info.reconnect_count.saturating_add(1);
            }
        });
        first = false;

        match connect_once(&app, &state, &http, &config, browser.clone(), kicked.clone()).await {
            Ok(reason) => {
                // 连接已经成功建立过，不管这次是怎么断的，都不该背上一次失败的退避时长
                backoff.reset();

                if reason.is_kicked() || kicked.load(Ordering::SeqCst) {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.kicked = true;
                        info.connected_at = None;
                        info.last_error = Some("同一教室已在别处连接，已停止自动重连".into());
                    });
                    state.log(&app, LogLevel::Error, LogSource::Connection, "被顶号，停止自动重连", None);
                    return;
                }

                state.log(&app, LogLevel::Warn, LogSource::Connection, "连接已断开", Some(reason.message.clone()));
                state.update(&app, |info| {
                    info.state = ConnectionState::Reconnecting;
                    info.connected_at = None;
                    info.last_error = Some(reason.message);
                });
            }
            Err(error) => {
                if error.is_credential() {
                    state.update(&app, |info| {
                        info.state = ConnectionState::Error;
                        info.connected_at = None;
                        info.last_error = Some(error.to_string());
                    });
                    state.log(&app, LogLevel::Error, LogSource::Connection, "凭证被拒绝，已停止重试", Some(error.to_string()));
                    return;
                }

                state.log(&app, LogLevel::Warn, LogSource::Connection, "连接失败", Some(error.to_string()));
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

async fn connect_once(
    app: &AppHandle,
    state: &Arc<PlatformState>,
    http: &HttpClient,
    config: &ScreenAppConfig,
    browser: Arc<BrowserManager>,
    kicked: Arc<AtomicBool>,
) -> Result<CloseReason, PlatformError> {
    let token = http.screen_token(&config.app_key, &config.app_secret).await?;
    let url = http.resolve_ws_url(&token.ws_url);

    let handler: Arc<dyn InboundHandler> = Arc::new(ScreenHandler {
        app: app.clone(),
        state: state.clone(),
        browser,
        kicked,
    });

    let (conn, snapshot) = Connection::open(
        ConnectOptions { url: url.clone(), token: token.access_token },
        handler,
    )
    .await?;

    state.update(app, |info| {
        info.state = ConnectionState::Connected;
        info.connected_at = Some(crate::platform::events::now_ms());
        info.last_error = None;
        info.kicked = false;
        info.classroom_id = snapshot.classroom_id.or(token.classroom_id);
        // 大屏是常驻程序，一条连接会跨越十几节课，课堂信息只作展示不做缓存依据
        info.lesson_id = snapshot.lesson_id;
        info.lesson_title = snapshot.lesson.as_ref().map(|l| l.title.clone());
        info.course_name = snapshot.lesson.as_ref().and_then(|l| l.course_name.clone());
    });
    state.log(app, LogLevel::Success, LogSource::Connection, "已连接到教学平台", Some(url));

    let renew_after = std::time::Duration::from_secs(
        token.expires_in.saturating_sub(RENEW_LEAD_SECS).max(MIN_RENEW_SECS),
    );

    let reason = tokio::select! {
        reason = conn.wait_closed() => reason,
        _ = tokio::time::sleep(renew_after) => CloseReason {
            code: None,
            message: "token 即将过期，主动重连换票".into(),
        },
    };

    conn.close().await;
    Ok(reason)
}
