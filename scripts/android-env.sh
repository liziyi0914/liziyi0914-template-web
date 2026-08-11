#!/usr/bin/env bash
# 供 package.json 里的 android:* 脚本 source 使用。
# 自动探测 JDK 与最新安装的 NDK，避免把本机版本号写死在脚本里。

set -euo pipefail

SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

export ANDROID_HOME="$SDK_DIR"

# 当前 gen/android 使用 Gradle 8.14.x，官方运行时最高支持到 Java 24；
# Java 25+ 会在配置 :buildSrc 时直接抛 IllegalArgumentException: 25.0.2。
# AGP 8.11 建议 JDK 17，这里优先选 21/17。
_android_java_major() {
  local java_bin="${1%/}/bin/java"
  if [ ! -x "$java_bin" ]; then
    return 1
  fi
  # 兼容 bash/zsh：不要用未加引号的 awk -F[...]（zsh 会当成 glob）。
  "$java_bin" -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1
}

_android_pick_java_home() {
  local candidate major

  # 1) 优先系统里的 JDK 21 / 17（GraalVM / Temurin 等）
  for major in 21 17; do
    candidate="$(/usr/libexec/java_home -v "$major" 2>/dev/null || true)"
    if [ -n "$candidate" ]; then
      major="$(_android_java_major "$candidate" || true)"
      if [ -n "${major:-}" ] && [ "$major" -ge 17 ] && [ "$major" -le 21 ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  done

  # 2) 调用方已设置的 JAVA_HOME（仅当版本合适）
  if [ -n "${JAVA_HOME:-}" ]; then
    major="$(_android_java_major "$JAVA_HOME" || true)"
    if [ -n "${major:-}" ] && [ "$major" -ge 17 ] && [ "$major" -le 21 ]; then
      printf '%s\n' "$JAVA_HOME"
      return 0
    fi
  fi

  # 3) Android Studio JBR（新版常为 Java 25+，需过滤）
  for candidate in \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  do
    if [ -d "$candidate" ]; then
      major="$(_android_java_major "$candidate" || true)"
      if [ -n "${major:-}" ] && [ "$major" -ge 17 ] && [ "$major" -le 21 ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  done

  return 1
}

if ! JAVA_HOME="$(_android_pick_java_home)"; then
  echo "error: 未找到可用的 JDK 17/21。Android Studio 自带 JBR 若为 Java 25+，不能用于当前 Gradle 8.14 构建。" >&2
  echo "  可用 /usr/libexec/java_home -V 查看本机 JDK，并安装 Temurin/Zulu 21。" >&2
  exit 1
fi
export JAVA_HOME
unset -f _android_java_major _android_pick_java_home

if [ -z "${NDK_HOME:-}" ]; then
  latest_ndk="$(ls -1 "$SDK_DIR/ndk" 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -z "$latest_ndk" ]; then
    echo "error: 未在 $SDK_DIR/ndk 下找到 NDK，请先安装" >&2
    exit 1
  fi
  export NDK_HOME="$SDK_DIR/ndk/$latest_ndk"
fi

# 语音链路的密钥与热词 id，未配置时不阻断构建，只是运行期会连不上服务 / 不带热词。
# BASH_SOURCE 在 bash/source 场景下可用；被 zsh source 时退回到 $0。
_script="${BASH_SOURCE[0]:-$0}"
_scripts_dir="$(CDPATH= cd -- "$(dirname -- "$_script")" && pwd)"
unset _script
voice_env="$_scripts_dir/voice-env.sh"
if [ -f "$voice_env" ]; then
  # shellcheck source=/dev/null
  source "$voice_env"
fi
vocab_env="$_scripts_dir/vocabulary-env.sh"
if [ -f "$vocab_env" ]; then
  # shellcheck source=/dev/null
  source "$vocab_env"
fi
unset _scripts_dir voice_env vocab_env
