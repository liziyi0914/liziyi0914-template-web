/**
 * PC 端（Windows / macOS / Linux）与移动端（Android / iOS）使用两套 UI。
 *
 * 平台在应用生命周期内不会变化，因此只在模块加载时判定一次并导出常量，
 * 组件里直接读取即可，不需要 hook、订阅或重渲染。
 */
export type UiPlatform = 'desktop' | 'mobile';

const MOBILE_BUILD_TARGETS = new Set(['android', 'ios']);

/** 浏览器里调试移动端 UI：`?ui=mobile`，写入 sessionStorage 以便后续导航保持 */
const UI_OVERRIDE_KEY = 'ui-platform-override';

function readOverride(): UiPlatform | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('ui');
    if (fromQuery === 'mobile' || fromQuery === 'desktop') {
      window.sessionStorage.setItem(UI_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }

    const stored = window.sessionStorage.getItem(UI_OVERRIDE_KEY);
    return stored === 'mobile' || stored === 'desktop' ? stored : null;
  } catch {
    return null;
  }
}

function detect(): UiPlatform {
  // Tauri 构建：目标平台在构建期就已确定，最可靠
  if (MOBILE_BUILD_TARGETS.has(__TAURI_PLATFORM__)) return 'mobile';
  if (__TAURI_PLATFORM__) return 'desktop';

  // 非 Tauri 环境（浏览器调试）才需要运行时推断
  if (import.meta.env.DEV) {
    const override = readOverride();
    if (override) return override;
  }

  const ua = navigator.userAgent;
  if (/android|iphone|ipod|ipad/i.test(ua)) return 'mobile';
  // iPadOS 13+ 默认伪装成 macOS，靠触摸点数量区分
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'mobile';

  return 'desktop';
}

export const UI_PLATFORM: UiPlatform = detect();

export const IS_MOBILE_UI = UI_PLATFORM === 'mobile';

/**
 * 是否跑在真正的安卓构建上。
 *
 * 与 `IS_MOBILE_UI` 不同：后者可以被 `?ui=mobile` 覆盖用于浏览器调试，
 * 而麦克风、原生插件这类能力只看真实构建目标。
 */
export const IS_ANDROID = __TAURI_PLATFORM__ === 'android';
