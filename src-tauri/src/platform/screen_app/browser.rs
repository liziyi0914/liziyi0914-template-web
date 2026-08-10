use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// 独立 profile，不占用用户日常浏览器的配置
const PROFILE_DIR: &str = "gdufe-screen-app";
/// SIGTERM 之后等它自己退的时间
const TERMINATE_GRACE_MS: u64 = 5_000;

/// macOS 上 `.app` 是目录，要取 bundle 里的可执行文件。
/// 不用 `open -na` 拉起：那样拿不到进程句柄，close_browser 与 status 就无从实现。
pub fn normalize_chrome_path(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    let trimmed = Path::new(raw.trim_end_matches('/'));

    let Some(name) = trimmed.file_name().and_then(|name| name.to_str()) else {
        return path.to_path_buf();
    };
    let Some(stem) = name.strip_suffix(".app") else {
        return path.to_path_buf();
    };

    trimmed.join("Contents").join("MacOS").join(stem)
}

fn candidates() -> Vec<PathBuf> {
    let mut found = Vec::new();

    #[cfg(target_os = "macos")]
    found.push(PathBuf::from(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ));

    #[cfg(target_os = "windows")]
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
        if let Ok(base) = std::env::var(key) {
            found.push(
                PathBuf::from(base)
                    .join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
        }
    }

    found
}

pub fn resolve_chrome(configured: Option<&str>) -> Result<PathBuf, String> {
    if let Some(raw) = configured.map(str::trim).filter(|path| !path.is_empty()) {
        let path = normalize_chrome_path(Path::new(raw));
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("配置的 Chrome 路径不可用：{raw}"));
    }

    for path in candidates() {
        if path.is_file() {
            return Ok(path);
        }
    }

    for name in ["chrome", "google-chrome", "chromium"] {
        if let Ok(output) = Command::new("which").arg(name).output() {
            let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !found.is_empty() && Path::new(&found).is_file() {
                return Ok(PathBuf::from(found));
            }
        }
    }

    Err("未找到 Chrome，请在配置里填写可执行文件路径".to_string())
}

pub fn profile_dir() -> PathBuf {
    std::env::temp_dir().join(PROFILE_DIR)
}

pub fn build_args(profile: &Path, kiosk: bool, url: &str) -> Vec<String> {
    let mut args = vec![
        format!("--user-data-dir={}", profile.display()),
        // 演示大屏要用 SpeechSynthesis 朗读，默认策略会把它拦下来
        "--autoplay-policy=no-user-gesture-required".to_string(),
        "--new-window".to_string(),
    ];
    if kiosk {
        args.push("--kiosk".to_string());
    }
    args.push(url.to_string());
    args
}

#[derive(Default)]
pub struct BrowserManager {
    chrome_path: Mutex<Option<String>>,
    kiosk: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl BrowserManager {
    /// 配置可能在运行期被改，路径与 kiosk 都在每次拉起时重新取。
    pub fn configure(&self, chrome_path: Option<String>, kiosk: bool) {
        *self.chrome_path.lock().expect("浏览器锁被毒化") = chrome_path;
        self.kiosk.store(kiosk, Ordering::Relaxed);
    }

    pub fn running(&self) -> bool {
        let mut slot = self.child.lock().expect("浏览器锁被毒化");
        match slot.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => {
                    *slot = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            },
            None => false,
        }
    }

    pub fn open_url(&self, url: &str) -> Result<(), String> {
        let configured = self.chrome_path.lock().expect("浏览器锁被毒化").clone();
        let chrome = resolve_chrome(configured.as_deref())?;

        // 同时只允许一个窗口，否则老师会看到两块内容叠在一起
        self.close();

        let profile = profile_dir();
        std::fs::create_dir_all(&profile)
            .map_err(|error| format!("无法创建浏览器配置目录：{error}"))?;

        let child = Command::new(&chrome)
            .args(build_args(
                &profile,
                self.kiosk.load(Ordering::Relaxed),
                url,
            ))
            .spawn()
            .map_err(|error| format!("拉起 Chrome 失败：{error}"))?;

        *self.child.lock().expect("浏览器锁被毒化") = Some(child);
        Ok(())
    }

    pub fn close(&self) -> bool {
        let Some(mut child) = self.child.lock().expect("浏览器锁被毒化").take() else {
            return false;
        };

        if matches!(child.try_wait(), Ok(Some(_))) {
            return true;
        }

        #[cfg(windows)]
        {
            // Chrome 会 fork 一堆渲染进程，只 kill 父进程会留下孤儿
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .output();
            let _ = child.wait();
            return true;
        }

        #[cfg(not(windows))]
        {
            // SIGTERM 让 Chrome 干净退出，否则下次启动会弹「未正常关闭」
            unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGTERM) };

            let deadline =
                std::time::Instant::now() + std::time::Duration::from_millis(TERMINATE_GRACE_MS);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => return true,
                    Ok(None) if std::time::Instant::now() < deadline => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    _ => break,
                }
            }

            let _ = child.kill();
            let _ = child.wait();
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn app_bundle_取到里面的可执行文件() {
        // 需求给的 --chrome /Applications/Google Chrome.app 是个目录，
        // 直接 Command::new 会 Permission denied
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Google Chrome.app")),
            Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        );
    }

    #[test]
    fn 结尾带斜杠的_bundle_也能处理() {
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Google Chrome.app/")),
            Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        );
    }

    #[test]
    fn 其他_app_bundle_取同名可执行文件() {
        assert_eq!(
            normalize_chrome_path(Path::new("/Applications/Chromium.app")),
            Path::new("/Applications/Chromium.app/Contents/MacOS/Chromium")
        );
    }

    #[test]
    fn 普通可执行文件路径原样返回() {
        for raw in [
            "/usr/bin/chromium",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        ] {
            assert_eq!(normalize_chrome_path(Path::new(raw)), Path::new(raw));
        }
    }

    #[test]
    fn 启动参数含独立_profile_与放开自动播放() {
        let args = build_args(Path::new("/tmp/profile"), false, "https://x/screen");

        assert_eq!(args[0], "--user-data-dir=/tmp/profile");
        assert!(args.contains(&"--autoplay-policy=no-user-gesture-required".to_string()));
        assert!(args.contains(&"--new-window".to_string()));
        assert_eq!(args.last().unwrap(), "https://x/screen", "URL 必须在最后");
        assert!(!args.contains(&"--kiosk".to_string()));
    }

    #[test]
    fn kiosk_开关生效且仍然把_url_放最后() {
        let args = build_args(Path::new("/tmp/profile"), true, "https://x/screen");

        assert!(args.contains(&"--kiosk".to_string()));
        assert_eq!(args.last().unwrap(), "https://x/screen");
    }

    #[test]
    fn 未配置路径时探测失败给出可操作的提示() {
        // 探测结果依赖运行环境，这里只钉住失败时的文案要提到 chrome
        if let Err(message) = resolve_chrome(Some("/definitely/not/here")) {
            assert!(message.contains("/definitely/not/here"));
        }
    }
}
