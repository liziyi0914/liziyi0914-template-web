//! 桩实现。桌面端不在本阶段范围内，所有调用直接报不支持，
//! 这样上层代码不必到处写 cfg。

use tauri::Runtime;

use crate::error::{Error, Result};
use crate::models::{PermissionStatus, RecordingConfig};

/// 用 `fn() -> R` 而非 `R` 作幽灵类型，否则 `Mic<R>` 的 Send/Sync
/// 会跟着 R 走，没法直接塞进 Tauri 的状态管理。
pub struct Mic<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> Mic<R> {
    pub(crate) fn new() -> Self {
        Self(std::marker::PhantomData)
    }

    pub fn check_permissions(&self) -> Result<PermissionStatus> {
        Err(Error::UnsupportedPlatform)
    }

    pub fn request_permissions(&self) -> Result<PermissionStatus> {
        Err(Error::UnsupportedPlatform)
    }

    pub fn start<F>(&self, _config: RecordingConfig, _on_frame: F) -> Result<()>
    where
        F: Fn(Vec<u8>) + Send + Sync + 'static,
    {
        Err(Error::UnsupportedPlatform)
    }

    pub fn stop(&self) -> Result<()> {
        Err(Error::UnsupportedPlatform)
    }
}
