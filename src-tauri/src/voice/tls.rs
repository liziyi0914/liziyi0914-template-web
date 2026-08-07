//! reqwest 0.13 起一律使用 rustls-platform-verifier 取根证书，而它在 Android 上
//! 必须先做 JNI 初始化，否则首次 HTTPS 请求就会 panic。这里改用 webpki-roots
//! 自带的根证书自行构造 ClientConfig，绕开对 JVM 的依赖。
//!
//! 同时我们开了 `rustls-no-provider`（为了用 ring、避开 aws-lc 在安卓上的坑）。
//! 这是整棵依赖树共享的 feature：Tauri 移动端 dev 协议自己也会 `ClientBuilder::new().build()`，
//! 若不在进程入口尽早 `install_default`，就会在 reqwest 里直接 abort：
//! `No rustls crypto provider is configured`。

use std::sync::Arc;
use std::sync::OnceLock;

/// ring 的 crypto provider 只能安装一次，重复安装会返回 Err，因此用 OnceLock 兜住。
///
/// 必须在任何 `reqwest::Client` / `rustls::ClientConfig::builder()` 之前调用。
/// 应用入口（`lib.rs::run`）会再调一次，保证早于 Tauri 自己的 HTTP 客户端构建。
pub fn ensure_crypto_provider() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        // 已经有别的代码装过就忽略 Err；关键是 process-default 非空。
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn client_config() -> Arc<rustls::ClientConfig> {
    ensure_crypto_provider();

    let provider = rustls::crypto::CryptoProvider::get_default()
        .expect("rustls crypto provider must be installed before client_config()")
        .clone();

    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Arc::new(
        rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .expect("ring provider supports default TLS versions")
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// 本项目所有 HTTPS 请求都必须走这里拿客户端。
///
/// rustls-platform-verifier 仍然在依赖树里（reqwest 的 rustls-no-provider 会拉进来），
/// 直接 `reqwest::Client::new()` 会用上它，在安卓上就是一次必然的 panic。
pub fn http_client() -> reqwest::Result<reqwest::Client> {
    ensure_crypto_provider();

    let tls = (*client_config()).clone();
    reqwest::ClientBuilder::new()
        .use_preconfigured_tls(tls)
        .build()
}

#[cfg(test)]
mod smoke {
    use super::*;

    #[test]
    fn http_client_builds_without_panic() {
        let client = http_client().expect("http_client should build");
        // drop is enough — construction is what panics on Android
        drop(client);
    }

    #[test]
    fn crypto_provider_is_installed() {
        ensure_crypto_provider();
        assert!(
            rustls::crypto::CryptoProvider::get_default().is_some(),
            "process-default CryptoProvider must be set"
        );
    }
}
