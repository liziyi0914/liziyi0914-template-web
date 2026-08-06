#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("麦克风权限被拒绝")]
    PermissionDenied,

    #[error("当前平台不支持麦克风采集")]
    UnsupportedPlatform,

    #[error("调用原生插件失败：{0}")]
    Plugin(String),
}

pub type Result<T> = std::result::Result<T, Error>;
