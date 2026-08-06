// 命令列表留空：本插件只由 Rust 侧调用，不暴露给 WebView，
// 因此不需要生成 ACL 权限文件。
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
