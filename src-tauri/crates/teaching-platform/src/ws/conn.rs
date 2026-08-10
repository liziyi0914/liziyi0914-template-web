use crate::error::{ApiError, PlatformError, Result};
use crate::ws::frame::Frame;
use crate::ws::snapshot::Snapshot;
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

/// 本地等待比服务端 10 秒转发超时更长，否则会先本地超时、随后又收到迟到的 ack。
pub const CALL_TIMEOUT: Duration = Duration::from_secs(15);
/// 服务端 60 秒收不到任何帧就以 4009 断开。
pub const PING_INTERVAL: Duration = Duration::from_secs(25);
/// 关闭时给收尾留的时间。
const CLOSE_GRACE: Duration = Duration::from_secs(3);

pub struct ConnectOptions {
    pub url: String,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloseReason {
    pub code: Option<u16>,
    pub message: String,
}

impl CloseReason {
    /// 顶号。收到后必须停止自动重连，否则两条连接会来回顶成死循环。
    pub fn is_kicked(&self) -> bool {
        self.code == Some(4005)
    }

    /// 认证失败。不要原样重连，先重新取 token。
    pub fn is_auth_failure(&self) -> bool {
        self.code == Some(4001)
    }
}

#[async_trait]
pub trait InboundHandler: Send + Sync {
    /// 服务端转发来的 req。返回 Ok 回 ack，Err 回 error 帧。
    async fn on_request(&self, op: &str, params: Value) -> std::result::Result<Value, ApiError>;
    /// 事件帧。协议规定客户端不回 ack。
    async fn on_event(&self, op: &str, data: Value);
}

type Waiter = oneshot::Sender<std::result::Result<Value, ApiError>>;

struct Shared {
    pending: Mutex<HashMap<String, Waiter>>,
    close: watch::Sender<Option<CloseReason>>,
}

pub struct Connection {
    shared: Arc<Shared>,
    outbound: mpsc::Sender<Message>,
    writer: JoinHandle<()>,
    reader: JoinHandle<()>,
    heartbeat: JoinHandle<()>,
}

async fn call_inner(
    shared: &Arc<Shared>,
    outbound: &mpsc::Sender<Message>,
    op: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value> {
    let frame = Frame::req(op, params);
    let package_id = frame.package_id().to_string();

    let (tx, rx) = oneshot::channel();
    shared.pending.lock().await.insert(package_id.clone(), tx);

    if outbound.send(Message::text(frame.encode())).await.is_err() {
        shared.pending.lock().await.remove(&package_id);
        return Err(PlatformError::Ws("连接已断开".into()));
    }

    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(Ok(data))) => Ok(data),
        Ok(Ok(Err(api))) => Err(PlatformError::Api(api)),
        Ok(Err(_)) => Err(PlatformError::Ws("连接已断开".into())),
        Err(_) => {
            // 不摘掉登记，迟到的 ack 会让这张表只涨不落
            shared.pending.lock().await.remove(&package_id);
            Err(PlatformError::Timeout)
        }
    }
}

async fn settle(shared: &Arc<Shared>, package_id: &str, result: std::result::Result<Value, ApiError>) {
    if let Some(waiter) = shared.pending.lock().await.remove(package_id) {
        let _ = waiter.send(result);
    } else {
        log::debug!("收到无人等待的响应 packageId={package_id}");
    }
}

async fn read_loop<S>(
    source: &mut S,
    shared: &Arc<Shared>,
    outbound: &mpsc::Sender<Message>,
    handler: Arc<dyn InboundHandler>,
) -> CloseReason
where
    // 约束写在 Stream 上而不是 StreamExt 上：Item 是 Stream 的关联类型，
    // next() 由 StreamExt 的 blanket impl 提供
    S: futures_util::Stream<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
{
    while let Some(message) = source.next().await {
        let raw = match message {
            Ok(Message::Text(text)) => text.to_string(),
            Ok(Message::Close(frame)) => {
                let reason = CloseReason {
                    code: frame.as_ref().map(|f| u16::from(f.code)),
                    message: frame
                        .as_ref()
                        .map(|f| f.reason.to_string())
                        .filter(|reason| !reason.is_empty())
                        .unwrap_or_else(|| "服务端关闭了连接".into()),
                };
                // tokio-tungstenite 的读写两端是各自独立的 split half：
                // 收到对端 Close 后必须由本地也回一个 Close 帧完成关闭握手，
                // 否则底层连接迟迟不进入收尾状态，之后的 source.next() 可能永远挂着。
                let _ = outbound.send(Message::Close(frame)).await;
                return reason;
            }
            Ok(_) => continue,
            Err(e) => return CloseReason { code: None, message: format!("连接中断：{e}") },
        };

        let frame = match Frame::decode(&raw) {
            Ok(frame) => frame,
            Err(e) => {
                log::warn!("丢弃无法解析的帧：{e}");
                continue;
            }
        };

        match frame {
            Frame::Ack { package_id, data, .. } => settle(shared, &package_id, Ok(data)).await,
            Frame::Error { package_id, code, message, .. } => {
                settle(shared, &package_id, Err(ApiError { code, message })).await
            }
            Frame::Event { op, data, .. } => handler.on_event(&op, data).await,
            Frame::Req { package_id, op, params, .. } => {
                // 处理可能要拉起进程，放到独立任务里免得堵住读循环
                let handler = handler.clone();
                let outbound = outbound.clone();
                tokio::spawn(async move {
                    let response = match handler.on_request(&op, params).await {
                        Ok(data) => Frame::ack(package_id, op, data),
                        Err(api) => Frame::error(package_id, op, api.code, api.message),
                    };
                    let _ = outbound.send(Message::text(response.encode())).await;
                });
            }
        }
    }

    CloseReason { code: None, message: "连接已关闭".into() }
}

impl Connection {
    pub async fn open(
        options: ConnectOptions,
        handler: Arc<dyn InboundHandler>,
    ) -> Result<(Self, Snapshot)> {
        let request = options
            .url
            .as_str()
            .into_client_request()
            .map_err(|e| PlatformError::Ws(format!("WebSocket 地址非法：{e}")))?;

        let (stream, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| PlatformError::Ws(format!("连接失败：{e}")))?;

        let (mut sink, mut source) = stream.split();
        let (close_tx, _) = watch::channel(None);
        let shared = Arc::new(Shared {
            pending: Mutex::new(HashMap::new()),
            close: close_tx,
        });
        // 必须在此处（reader/heartbeat 都还没跑起来之前）就订阅，而不是等
        // spawn_heartbeat 内部再 subscribe()：watch 的新订阅者会把创建时刻的值
        // 当作"已读"，如果 close 在 subscribe() 之前就已经 send 过，心跳会永远
        // 等不到那次通知。提前在这里订阅可以保证不会错过任何一次关闭信号。
        let heartbeat_close_rx = shared.close.subscribe();
        let (outbound_tx, mut outbound_rx) = mpsc::channel::<Message>(64);

        let writer = tokio::spawn(async move {
            while let Some(message) = outbound_rx.recv().await {
                if sink.send(message).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let reader_shared = shared.clone();
        let reader_outbound = outbound_tx.clone();
        let reader = tokio::spawn(async move {
            let reason = read_loop(&mut source, &reader_shared, &reader_outbound, handler).await;

            // 连接断了就把所有等待者叫醒，否则每个 call 都要干等满 15 秒
            let waiting: Vec<Waiter> = reader_shared.pending.lock().await.drain().map(|(_, w)| w).collect();
            for waiter in waiting {
                let _ = waiter.send(Err(ApiError { code: -1, message: "连接已断开".into() }));
            }

            let _ = reader_shared.close.send(Some(reason));
        });

        // 服务端要求 5 秒内发出首帧，认证不能排在其他初始化之后
        let data = call_inner(&shared, &outbound_tx, "auth.login", json!({ "token": options.token }), CALL_TIMEOUT).await;
        let snapshot = match data {
            Ok(data) => Snapshot::from_value(data)?,
            Err(e) => {
                writer.abort();
                reader.abort();
                return Err(e);
            }
        };

        let heartbeat = spawn_heartbeat(shared.clone(), outbound_tx.clone(), heartbeat_close_rx);

        Ok((
            Self { shared, outbound: outbound_tx, writer, reader, heartbeat },
            snapshot,
        ))
    }

    pub async fn call(&self, op: &str, params: Value) -> Result<Value> {
        call_inner(&self.shared, &self.outbound, op, params, CALL_TIMEOUT).await
    }

    pub async fn call_timeout(&self, op: &str, params: Value, timeout: Duration) -> Result<Value> {
        call_inner(&self.shared, &self.outbound, op, params, timeout).await
    }

    /// 等待连接终止，返回关闭原因。重连循环靠它衔接。
    pub async fn wait_closed(&self) -> CloseReason {
        let mut rx = self.shared.close.subscribe();
        loop {
            let current = rx.borrow_and_update().clone();
            if let Some(reason) = current {
                return reason;
            }
            if rx.changed().await.is_err() {
                return CloseReason { code: None, message: "连接已关闭".into() };
            }
        }
    }

    pub async fn pending_len(&self) -> usize {
        self.shared.pending.lock().await.len()
    }

    pub async fn close(self) {
        let Self { shared, outbound, mut writer, reader, mut heartbeat } = self;
        let _ = shared.close.send(Some(CloseReason { code: None, message: "本地主动关闭".into() }));

        // 丢掉发送端；写任务要等所有 outbound 克隆都释放、队列排空后
        // 才会走到 sink.close()，所以这一步本身不会让写任务立刻结束。
        drop(outbound);

        // 心跳已经在 open() 里提前订阅了 close，select! 分支应该几乎立刻命中，
        // 这里基本不会真的超时。
        if tokio::time::timeout(CLOSE_GRACE, &mut heartbeat)
            .await
            .is_err()
        {
            heartbeat.abort();
        }

        // 读循环只有等到服务端帧或出错才会返回；本地主动关闭时对端未必会再发
        // 任何东西，source.next() 会一直挂着。它手里那份 outbound 克隆不释放，
        // 写任务的 recv() 就永远拿不到 None，因此不值得为它等满 CLOSE_GRACE，
        // 直接 abort 释放资源——反正关闭原因已经在上面 send 过了。
        reader.abort();
        let _ = reader.await;

        // 到这里心跳和读循环都已经退出、各自的 outbound 克隆也已释放，
        // 写任务的 recv() 很快就会拿到 None 并调用 sink.close()。
        if tokio::time::timeout(CLOSE_GRACE, &mut writer)
            .await
            .is_err()
        {
            writer.abort();
        }
    }
}

fn spawn_heartbeat(
    shared: Arc<Shared>,
    outbound: mpsc::Sender<Message>,
    mut closed: watch::Receiver<Option<CloseReason>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(PING_INTERVAL);
        ticker.tick().await; // interval 的首次 tick 立即返回，跳过

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(e) = call_inner(&shared, &outbound, "conn.ping", json!({}), CALL_TIMEOUT).await {
                        log::warn!("心跳失败，停止发送：{e}");
                        // 必须主动广播关闭，否则 read_loop 若卡在半开的 socket 上，
                        // wait_closed() 会永远等不到结果，重连循环也就跟着卡死。
                        let reason = CloseReason { code: None, message: format!("心跳失败：{e}") };
                        let _ = shared.close.send(Some(reason));
                        return;
                    }
                }
                _ = closed.changed() => return,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use serde_json::json;
    use tokio::sync::mpsc::unbounded_channel;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;

    fn text(frame: Frame) -> Message {
        Message::text(frame.encode())
    }

    fn auth_ack(package_id: &str) -> Message {
        text(Frame::ack(
            package_id.to_string(),
            "auth.login".to_string(),
            json!({ "conn_id": "c1", "classroom_id": 3,
                    "lesson": { "id": 88, "title": "第 5 讲", "status": "ongoing" } }),
        ))
    }

    /// 启动一个只接一条连接的假服务端。收到的每一帧都转发给测试，
    /// 同时把 responder 返回的报文写回客户端。
    async fn spawn_server<F>(responder: F) -> (String, tokio::sync::mpsc::UnboundedReceiver<Frame>)
    where
        F: Fn(&Frame) -> Vec<Message> + Send + Sync + 'static,
    {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (seen_tx, seen_rx) = unbounded_channel();

        tokio::spawn(async move {
            let Ok((stream, _)) = listener.accept().await else { return };
            let Ok(ws) = tokio_tungstenite::accept_async(stream).await else { return };
            let (mut sink, mut source) = ws.split();

            while let Some(Ok(message)) = source.next().await {
                let Message::Text(raw) = message else { continue };
                let Ok(frame) = Frame::decode(&raw) else { continue };
                let replies = responder(&frame);
                let _ = seen_tx.send(frame);
                for reply in replies {
                    if sink.send(reply).await.is_err() {
                        return;
                    }
                }
            }
        });

        (format!("ws://{addr}"), seen_rx)
    }

    struct TestHandler {
        requests: tokio::sync::mpsc::UnboundedSender<String>,
    }

    #[async_trait]
    impl InboundHandler for TestHandler {
        async fn on_request(&self, op: &str, _params: Value) -> std::result::Result<Value, ApiError> {
            let _ = self.requests.send(op.to_string());
            if op == "app.status" {
                Ok(json!({ "version": "test" }))
            } else {
                Err(ApiError { code: crate::error::code::UNSUPPORTED_OP, message: "不支持".into() })
            }
        }

        async fn on_event(&self, op: &str, _data: Value) {
            let _ = self.requests.send(format!("event:{op}"));
        }
    }

    fn handler() -> (Arc<dyn InboundHandler>, tokio::sync::mpsc::UnboundedReceiver<String>) {
        let (tx, rx) = unbounded_channel();
        (Arc::new(TestHandler { requests: tx }), rx)
    }

    async fn open(url: String) -> (Connection, Snapshot, tokio::sync::mpsc::UnboundedReceiver<String>) {
        let (handler, rx) = handler();
        let (conn, snapshot) = Connection::open(
            ConnectOptions { url, token: "tk".into() },
            handler,
        )
        .await
        .unwrap();
        (conn, snapshot, rx)
    }

    #[tokio::test]
    async fn 建连后立刻发_auth_login_并返回快照() {
        let (url, mut seen) = spawn_server(|frame| vec![auth_ack(frame.package_id())]).await;
        let (conn, snapshot, _) = open(url).await;

        let first = seen.recv().await.unwrap();
        assert_eq!(first.op(), "auth.login");
        assert_eq!(first.params_or_data()["token"], "tk");
        assert_eq!(snapshot.classroom_id, Some(3));
        assert_eq!(snapshot.lesson.unwrap().title, "第 5 讲");

        conn.close().await;
    }

    #[tokio::test]
    async fn conn_pong_的_op_不同也能按_package_id_配对() {
        let (url, _seen) = spawn_server(|frame| {
            let reply = if frame.op() == "auth.login" {
                auth_ack(frame.package_id())
            } else {
                // 心跳的响应 op 是 conn.pong，配对时不能比对 op
                text(Frame::ack(frame.package_id().to_string(), "conn.pong".into(), json!({})))
            };
            vec![reply]
        })
        .await;

        let (conn, _, _) = open(url).await;
        assert!(conn.call("conn.ping", json!({})).await.is_ok());
        conn.close().await;
    }

    #[tokio::test]
    async fn error_帧转成_api_错误() {
        let (url, _seen) = spawn_server(|frame| {
            let reply = if frame.op() == "auth.login" {
                auth_ack(frame.package_id())
            } else {
                text(Frame::error(frame.package_id().to_string(), frame.op().into(), 40006, "不支持的指令".into()))
            };
            vec![reply]
        })
        .await;

        let (conn, _, _) = open(url).await;
        match conn.call("ppt.next", json!({})).await.unwrap_err() {
            PlatformError::Api(api) => {
                assert_eq!(api.code, 40006);
                assert_eq!(api.message, "不支持的指令");
            }
            other => panic!("应为 Api 错误，实际是 {other:?}"),
        }
        conn.close().await;
    }

    #[tokio::test]
    async fn 本地超时后不留下悬挂的登记项() {
        let (url, _seen) = spawn_server(|frame| {
            if frame.op() == "auth.login" { vec![auth_ack(frame.package_id())] } else { vec![] }
        })
        .await;

        let (conn, _, _) = open(url).await;
        let error = conn
            .call_timeout("ppt.next", json!({}), Duration::from_millis(120))
            .await
            .unwrap_err();

        assert!(matches!(error, PlatformError::Timeout));
        assert_eq!(conn.pending_len().await, 0, "超时后登记表必须清空，否则会一直涨");
        conn.close().await;
    }

    #[tokio::test]
    async fn 入站_req_交给_handler_并回_ack() {
        let (url, mut seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            // 认证通过后紧接着推一条 req 过来
            vec![
                auth_ack(frame.package_id()),
                text(Frame::Req {
                    package_id: "srv-1".into(),
                    op: "app.status".into(),
                    ts: 1,
                    params: json!({}),
                }),
            ]
        })
        .await;

        let (conn, _, mut handled) = open(url).await;

        assert_eq!(handled.recv().await.unwrap(), "app.status");

        let _login = seen.recv().await.unwrap();
        let ack = seen.recv().await.unwrap();
        assert_eq!(ack.package_id(), "srv-1", "packageId 必须原样带回");
        assert_eq!(ack.op(), "app.status");
        assert_eq!(ack.params_or_data()["version"], "test");

        conn.close().await;
    }

    #[tokio::test]
    async fn 未知_op_回_error_帧而不是静默忽略() {
        let (url, mut seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            vec![
                auth_ack(frame.package_id()),
                text(Frame::Req { package_id: "srv-2".into(), op: "ppt.next".into(), ts: 1, params: json!({}) }),
            ]
        })
        .await;

        let (conn, _, _) = open(url).await;
        let _login = seen.recv().await.unwrap();
        let response = seen.recv().await.unwrap();

        match response {
            Frame::Error { package_id, code, .. } => {
                assert_eq!(package_id, "srv-2");
                assert_eq!(code, crate::error::code::UNSUPPORTED_OP);
            }
            other => panic!("应为 error 帧，实际是 {other:?}"),
        }
        conn.close().await;
    }

    #[tokio::test]
    async fn 服务端关闭时_wait_closed_给出关闭码() {
        let (url, _seen) = spawn_server(|frame| {
            if frame.op() != "auth.login" {
                return vec![];
            }
            vec![
                auth_ack(frame.package_id()),
                Message::Close(Some(CloseFrame {
                    code: CloseCode::Library(4005),
                    reason: "顶号".into(),
                })),
            ]
        })
        .await;

        let (conn, _, _) = open(url).await;
        let reason = conn.wait_closed().await;

        assert_eq!(reason.code, Some(4005));
        assert!(reason.is_kicked());
        conn.close().await;
    }
}
