#!/usr/bin/env bash
# 供 package.json 里的 android:* 脚本 source 使用。
# 自动探测 JDK 与最新安装的 NDK，避免把本机版本号写死在脚本里。

set -euo pipefail

STUDIO_JBR="/Users/liziyi0914/Applications/Android Studio.app/Contents/jbr/Contents/Home"
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

export ANDROID_HOME="$SDK_DIR"

if [ -d "$STUDIO_JBR" ]; then
  export JAVA_HOME="$STUDIO_JBR"
elif [ -z "${JAVA_HOME:-}" ]; then
  export JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
fi

if [ -z "${NDK_HOME:-}" ]; then
  latest_ndk="$(ls -1 "$SDK_DIR/ndk" 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -z "$latest_ndk" ]; then
    echo "error: 未在 $SDK_DIR/ndk 下找到 NDK，请先安装" >&2
    exit 1
  fi
  export NDK_HOME="$SDK_DIR/ndk/$latest_ndk"
fi
