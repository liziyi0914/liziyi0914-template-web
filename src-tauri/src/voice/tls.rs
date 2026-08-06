//! reqwest 0.13 起一律使用 rustls-platform-verifier 取根证书，而它在 Android 上
//! 必须先做 JNI 初始化，否则首次 HTTPS 请求就会 panic。这里改用 webpki-roots
//! 自带的根证书自行构造 ClientConfig，绕开对 JVM 的依赖。

use std::sync::Arc;
use std::sync::OnceLock;

/// ring 的 crypto provider 只能安装一次，重复安装会返回 Err，因此用 OnceLock 兜住。
fn ensure_crypto_provider() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn client_config() -> Arc<rustls::ClientConfig> {
    ensure_crypto_provider();

    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// 本项目所有 HTTPS 请求都必须走这里拿客户端。
///
/// rustls-platform-verifier 仍然在依赖树里（reqwest 的 rustls-no-provider 会拉进来），
/// 直接 `reqwest::Client::new()` 会用上它，在安卓上就是一次必然的 panic。
pub fn http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::ClientBuilder::new()
        .use_preconfigured_tls((*client_config()).clone())
        .build()
}
