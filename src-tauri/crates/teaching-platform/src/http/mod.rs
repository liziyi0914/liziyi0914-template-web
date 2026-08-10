pub mod screen;

/// base_url 形如 `http://8.163.33.11:8084`，内部自行拼 `/api/v1`。
/// reqwest::Client 由调用方注入——app crate 用的是绕开平台证书验证器的那一个。
#[derive(Clone)]
pub struct HttpClient {
    base_url: String,
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new(base_url: impl Into<String>, inner: reqwest::Client) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            inner,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn api(&self, path: &str) -> String {
        format!("{}/api/v1{}", self.base_url, path)
    }

    pub(crate) fn inner(&self) -> &reqwest::Client {
        &self.inner
    }

    /// 换票响应里的 ws_url 可能是绝对地址也可能是路径，两种都要能连上。
    pub fn resolve_ws_url(&self, ws_url: &str) -> String {
        if ws_url.starts_with("ws://") || ws_url.starts_with("wss://") {
            return ws_url.to_string();
        }
        if let Some(rest) = ws_url.strip_prefix("https://") {
            return format!("wss://{rest}");
        }
        if let Some(rest) = ws_url.strip_prefix("http://") {
            return format!("ws://{rest}");
        }

        let origin = if let Some(rest) = self.base_url.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = self.base_url.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            self.base_url.clone()
        };

        format!("{origin}/{}", ws_url.trim_start_matches('/'))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(base_url: &str) -> HttpClient {
        // `rustls-no-provider` 要求调用方在创建 reqwest Client 前安装进程默认 provider。
        let _ = rustls::crypto::ring::default_provider().install_default();
        HttpClient::new(base_url, reqwest::Client::new())
    }

    #[test]
    fn base_url_去掉结尾斜杠() {
        assert_eq!(client("http://a:8084/").base_url(), "http://a:8084");
        assert_eq!(client("http://a:8084").base_url(), "http://a:8084");
    }

    #[test]
    fn api_路径统一加_api_v1_前缀() {
        assert_eq!(
            client("http://a:8084").api("/screen/token"),
            "http://a:8084/api/v1/screen/token"
        );
    }

    #[test]
    fn ws_url_是路径时拼到_base_上() {
        // 实测 POST /api/v1/screen/token 返回的就是 "/ws/app"
        assert_eq!(
            client("http://a:8084").resolve_ws_url("/ws/app"),
            "ws://a:8084/ws/app"
        );
    }

    #[test]
    fn https_的_base_拼成_wss() {
        assert_eq!(
            client("https://a").resolve_ws_url("/ws/app"),
            "wss://a/ws/app"
        );
    }

    #[test]
    fn ws_url_已是绝对地址时原样使用() {
        assert_eq!(
            client("http://a:8084").resolve_ws_url("ws://b:9/ws/app"),
            "ws://b:9/ws/app"
        );
        assert_eq!(
            client("http://a:8084").resolve_ws_url("wss://b/ws/app"),
            "wss://b/ws/app"
        );
    }

    #[test]
    fn ws_url_是_http_绝对地址时替换协议() {
        assert_eq!(
            client("http://a").resolve_ws_url("http://b/ws/app"),
            "ws://b/ws/app"
        );
        assert_eq!(
            client("http://a").resolve_ws_url("https://b/ws/app"),
            "wss://b/ws/app"
        );
    }

    #[test]
    fn ws_url_缺少前导斜杠时补上() {
        assert_eq!(
            client("http://a:8084").resolve_ws_url("ws/app"),
            "ws://a:8084/ws/app"
        );
    }
}
