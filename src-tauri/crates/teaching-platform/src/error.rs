/// 后端返回的业务错误。message 保证是可直接展示或朗读的中文，不做二次翻译。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub code: i32,
    pub message: String,
}

/// 只把客户端要分支处理的码做成常量，全表见 HTTP 对接文档 §3.1。
pub mod code {
    pub const UNSUPPORTED_OP: i32 = 40006;
    pub const EXPIRED_COMMAND: i32 = 40007;
    pub const TOKEN_EXPIRED: i32 = 40102;
    pub const DUPLICATE_PACKAGE: i32 = 40902;
    pub const INTERNAL: i32 = 50001;
    pub const SCREEN_OFFLINE: i32 = 50401;
    pub const DEVICE_OFFLINE: i32 = 50402;
}

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("网络请求失败：{0}")]
    Http(String),

    #[error("{}", .0.message)]
    Api(ApiError),

    /// 非 2xx 且响应体不是标准信封，只能拿状态码分类
    #[error("服务端返回 {status}")]
    Status { status: u16, message: String },

    #[error("WebSocket 错误：{0}")]
    Ws(String),

    #[error("连接已关闭（{code}）")]
    Closed { code: u16 },

    #[error("等待响应超时")]
    Timeout,

    #[error("解析失败：{0}")]
    Decode(String),
}

pub type Result<T> = std::result::Result<T, PlatformError>;

impl PlatformError {
    /// 凭证或授权错误：重试没有意义，要人工改配置
    pub fn is_credential(&self) -> bool {
        match self {
            Self::Api(error) => (40100..40300).contains(&error.code),
            Self::Status { status, .. } => matches!(status, 401 | 403),
            Self::Closed { code } => *code == 4001,
            _ => false,
        }
    }

    /// 临时故障：退避后重试
    pub fn is_transient(&self) -> bool {
        match self {
            Self::Http(_) | Self::Ws(_) | Self::Timeout => true,
            Self::Status { status, .. } => *status >= 500 || matches!(status, 408 | 429),
            // 4005 是顶号，重连会和新连接来回顶成死循环
            Self::Closed { code } => *code != 4005,
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api(code: i32) -> PlatformError {
        PlatformError::Api(ApiError {
            code,
            message: "测试".into(),
        })
    }

    #[test]
    fn 业务码_401xx_视为凭证错误() {
        assert!(api(40101).is_credential());
        assert!(api(40102).is_credential());
        assert!(api(40299).is_credential());
    }

    #[test]
    fn 业务码_403xx_之外不算凭证错误() {
        assert!(!api(40300).is_credential());
        assert!(!api(40001).is_credential());
    }

    #[test]
    fn http_401_与_403_视为凭证错误() {
        for status in [401u16, 403] {
            let error = PlatformError::Status {
                status,
                message: String::new(),
            };
            assert!(error.is_credential(), "status {status} 应判为凭证错误");
        }
    }

    #[test]
    fn 服务端_5xx_与限流视为临时故障() {
        for status in [500u16, 502, 503, 504, 408, 429] {
            let error = PlatformError::Status {
                status,
                message: String::new(),
            };
            assert!(error.is_transient(), "status {status} 应判为临时故障");
        }
    }

    #[test]
    fn 网络与超时视为临时故障() {
        assert!(PlatformError::Http("connection refused".into()).is_transient());
        assert!(PlatformError::Ws("broken pipe".into()).is_transient());
        assert!(PlatformError::Timeout.is_transient());
    }

    #[test]
    fn 顶号不可重试而其他关闭码可以() {
        assert!(!PlatformError::Closed { code: 4005 }.is_transient());
        assert!(PlatformError::Closed { code: 4009 }.is_transient());
    }

    #[test]
    fn 认证失败的关闭码算凭证错误() {
        assert!(PlatformError::Closed { code: 4001 }.is_credential());
    }

    #[test]
    fn api_错误直接展示后端中文文案() {
        let error = PlatformError::Api(ApiError {
            code: 40006,
            message: "不支持的指令".into(),
        });
        assert_eq!(error.to_string(), "不支持的指令");
    }
}
