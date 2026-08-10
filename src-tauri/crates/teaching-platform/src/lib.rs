//! 辅助教学平台协议层。不依赖 tauri，可以直接 cargo test。

pub mod envelope;
pub mod error;

pub use error::{ApiError, PlatformError, Result};
