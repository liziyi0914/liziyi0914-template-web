import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { IS_ANDROID } from '@/lib/platform';
import {
  type ConnectionInfo,
  type DeviceFlowInfo,
  EMPTY_ROBOT_CONFIG,
  EMPTY_SCREEN_APP_CONFIG,
  INITIAL_CONNECTION_INFO,
  type LogEntry,
  type RoleConfig,
} from './types';

// 用 `export *` 而不是 `export type *`：types.ts 里还有 EMPTY_* 常量和
// validateConfig 这些运行时值，只转发类型会让调用方拿不到它们
export * from './types';

/** 浏览器里调 UI 时没有原生侧，全部降级成空值 */
const emptyConfig = (): RoleConfig =>
  IS_ANDROID ? { ...EMPTY_ROBOT_CONFIG } : { ...EMPTY_SCREEN_APP_CONFIG };

export async function getConfig(): Promise<RoleConfig> {
  if (!isTauri()) return emptyConfig();
  return await invoke<RoleConfig>('platform_config_get');
}

/** 保存后原生侧会立即以新参数重新连接 */
export async function setConfig(config: RoleConfig): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_config_set', { config });
}

export async function connect(): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_connect');
}

export async function disconnect(): Promise<void> {
  if (!isTauri()) return;
  await invoke('platform_disconnect');
}

export async function getConnectionInfo(): Promise<ConnectionInfo> {
  if (!isTauri()) return INITIAL_CONNECTION_INFO;
  return await invoke<ConnectionInfo>('platform_connection_info');
}

export async function getRecentLogs(): Promise<LogEntry[]> {
  if (!isTauri()) return [];
  return await invoke<LogEntry[]>('platform_recent_logs');
}

/**
 * 机器人待授权信息。没在等授权时为 null。
 *
 * 桌面端没有注册这个 command，调用会抛错，因此非安卓直接返回 null。
 */
export async function getDeviceFlowState(): Promise<DeviceFlowInfo | null> {
  if (!isTauri() || !IS_ANDROID) return null;
  return await invoke<DeviceFlowInfo | null>('robot_device_flow_state');
}

type Unsubscribe = () => void;

function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Unsubscribe {
  if (!isTauri()) return () => {};

  let disposed = false;
  let stop: Unsubscribe | null = null;

  void listen<T>(event, ({ payload }) => handler(payload)).then((unlisten) => {
    if (disposed) {
      unlisten();
      return;
    }
    stop = unlisten;
  });

  return () => {
    disposed = true;
    stop?.();
  };
}

export function onConnectionChange(
  handler: (info: ConnectionInfo) => void,
): Unsubscribe {
  return subscribe<ConnectionInfo>('platform://connection', handler);
}

export function onLog(handler: (entry: LogEntry) => void): Unsubscribe {
  return subscribe<LogEntry>('platform://log', handler);
}
