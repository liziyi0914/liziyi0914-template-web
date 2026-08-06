use serde::{Deserialize, Serialize};

/// Kotlin 侧推上来的一帧音频。
///
/// PCM 走 base64 而不是裸字节：Kotlin 只能通过 `Channel.send(JSObject)` 主动
///推数据，而它只接受 JSON；Tauri 文档亦说明安卓上不支持 `InvokeBody::Raw`。
#[derive(Debug, Deserialize)]
pub(crate) struct AudioFrame {
    #[serde(default)]
    pub pcm: Option<String>,
    /// 采集线程异常退出时的说明。录音中途死掉不会有任何声音再上来，
    /// 没有这个字段的话现象就只是「一直没识别结果」。
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionState {
    Granted,
    Denied,
    Prompt,
    PromptWithRationale,
}

impl PermissionState {
    pub fn is_granted(self) -> bool {
        matches!(self, Self::Granted)
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PermissionStatus {
    pub microphone: PermissionState,
}

/// 采集参数。字段名对应 Kotlin 侧 `StartArgs` 的属性。
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingConfig {
    pub sample_rate: u32,
    /// 单帧字节数，Kotlin 攒够这么多才推一次。
    pub frame_bytes: usize,
}
