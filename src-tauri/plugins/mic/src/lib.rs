//! 安卓麦克风采集插件。
//!
//! 只暴露给 Rust 侧使用，不注册任何 WebView 可见的命令。

mod error;
mod models;

#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
mod desktop;

pub use error::{Error, Result};
pub use models::{PermissionState, PermissionStatus, RecordingConfig};

#[cfg(mobile)]
pub use mobile::Mic;

#[cfg(desktop)]
pub use desktop::Mic;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(mobile)]
const PLUGIN_IDENTIFIER: &str = "cn.edu.gdufe.classroom.mic";

pub trait MicExt<R: Runtime> {
    fn mic(&self) -> &Mic<R>;
}

impl<R: Runtime, T: Manager<R>> MicExt<R> for T {
    fn mic(&self) -> &Mic<R> {
        self.state::<Mic<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mic")
        .setup(|app, _api| {
            #[cfg(mobile)]
            let mic = Mic::new(_api.register_android_plugin(PLUGIN_IDENTIFIER, "MicPlugin")?);
            #[cfg(desktop)]
            let mic = Mic::<R>::new();

            app.manage(mic);
            Ok(())
        })
        .build()
}
