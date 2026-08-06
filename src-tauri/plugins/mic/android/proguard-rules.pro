# Rust 侧通过 Class.forName 加载插件类，@Command 方法也是反射调用的，
# 混淆会让 release 包在注册插件时直接抛 ClassNotFoundException。
-keep class cn.edu.gdufe.classroom.mic.** { *; }
