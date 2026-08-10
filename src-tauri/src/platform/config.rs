use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
/// v1 存的是 clientId / clientSecret，与现在的字段语义不同，不做迁移让用户重填。
const CONFIG_KEY: &str = "server-config:v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BaseConfig {
    pub host: String,
    pub port: u16,
    /// 为真时用 https / wss
    pub secure: bool,
}

impl Default for BaseConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 8084,
            secure: false,
        }
    }
}

impl BaseConfig {
    pub fn base_url(&self) -> String {
        let scheme = if self.secure { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }

    pub fn is_complete(&self) -> bool {
        !self.host.trim().is_empty() && self.port > 0
    }
}

#[cfg(desktop)]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScreenAppConfig {
    #[serde(flatten)]
    pub base: BaseConfig,
    pub app_key: String,
    pub app_secret: String,
    pub chrome_path: Option<String>,
    pub kiosk: bool,
}

#[cfg(desktop)]
impl ScreenAppConfig {
    pub fn is_complete(&self) -> bool {
        self.base.is_complete()
            && !self.app_key.trim().is_empty()
            && !self.app_secret.trim().is_empty()
    }
}

#[cfg(mobile)]
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RobotConfig {
    #[serde(flatten)]
    pub base: BaseConfig,
    pub device_no: String,
    pub device_secret: String,
}

#[cfg(mobile)]
impl RobotConfig {
    pub fn is_complete(&self) -> bool {
        self.base.is_complete()
            && !self.device_no.trim().is_empty()
            && !self.device_secret.trim().is_empty()
    }
}

/// 上层代码只认这个别名，角色差异被编译期挡在这里。
#[cfg(desktop)]
pub type RoleConfig = ScreenAppConfig;
#[cfg(mobile)]
pub type RoleConfig = RobotConfig;

/// 读失败一律回落到默认配置，不阻塞启动。
pub fn load<R: Runtime>(app: &AppHandle<R>) -> RoleConfig {
    let Ok(store) = app.store(STORE_FILE) else {
        return RoleConfig::default();
    };
    store
        .get(CONFIG_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, config: &RoleConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(config).map_err(|e| e.to_string())?;
    store.set(CONFIG_KEY, value);
    store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> BaseConfig {
        BaseConfig {
            host: "8.163.33.11".into(),
            port: 8084,
            secure: false,
        }
    }

    #[test]
    fn base_url_按_secure_选协议() {
        assert_eq!(base().base_url(), "http://8.163.33.11:8084");
        assert_eq!(
            BaseConfig {
                secure: true,
                ..base()
            }
            .base_url(),
            "https://8.163.33.11:8084"
        );
    }

    #[test]
    fn 主机为空时视为未配置() {
        assert!(base().is_complete());
        assert!(!BaseConfig {
            host: "   ".into(),
            ..base()
        }
        .is_complete());
        assert!(!BaseConfig { port: 0, ..base() }.is_complete());
    }

    #[cfg(desktop)]
    #[test]
    fn 大屏配置要求填齐凭证() {
        let complete = ScreenAppConfig {
            base: base(),
            app_key: "123456".into(),
            app_secret: "1234567890".into(),
            chrome_path: None,
            kiosk: false,
        };
        assert!(complete.is_complete());
        assert!(!ScreenAppConfig {
            app_key: String::new(),
            ..complete.clone()
        }
        .is_complete());
        assert!(!ScreenAppConfig {
            app_secret: "  ".into(),
            ..complete
        }
        .is_complete());
    }

    #[cfg(desktop)]
    #[test]
    fn 大屏配置序列化成扁平的_camel_case() {
        let value = serde_json::to_value(ScreenAppConfig {
            base: base(),
            app_key: "k".into(),
            app_secret: "s".into(),
            chrome_path: Some("/x".into()),
            kiosk: true,
        })
        .unwrap();

        // base 是 flatten 的，前端看到的是一层扁平对象
        assert_eq!(value["host"], "8.163.33.11");
        assert_eq!(value["port"], 8084);
        assert_eq!(value["appKey"], "k");
        assert_eq!(value["appSecret"], "s");
        assert_eq!(value["chromePath"], "/x");
        assert_eq!(value["kiosk"], true);
    }

    #[cfg(desktop)]
    #[test]
    fn 缺字段的旧配置反序列化成默认值而不是报错() {
        let config: ScreenAppConfig =
            serde_json::from_value(serde_json::json!({ "host": "a" })).unwrap();
        assert_eq!(config.base.host, "a");
        assert_eq!(config.app_key, "");
        assert!(!config.kiosk);
    }
}
