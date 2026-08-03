import { isTauri } from '@tauri-apps/api/core';
import { LazyStore } from '@tauri-apps/plugin-store';
import { EMPTY_SERVER_CONFIG, type ServerConfig } from '@/lib/connection/types';

const STORE_FILE = 'settings.json';
const CONFIG_KEY = 'server-config:v1';

const tauriStore = isTauri()
  ? new LazyStore(STORE_FILE, { autoSave: false })
  : null;

function normalize(raw: unknown): ServerConfig {
  if (!raw || typeof raw !== 'object') return EMPTY_SERVER_CONFIG;

  const value = raw as Partial<ServerConfig>;
  const port = Number(value.port);

  return {
    host: typeof value.host === 'string' ? value.host : '',
    port: Number.isInteger(port) ? port : EMPTY_SERVER_CONFIG.port,
    secure: value.secure === true,
    clientId: typeof value.clientId === 'string' ? value.clientId : '',
    clientSecret:
      typeof value.clientSecret === 'string' ? value.clientSecret : '',
  };
}

/** 读取失败一律回落到空配置，不阻塞窗口渲染 */
export async function loadServerConfig(): Promise<ServerConfig> {
  try {
    if (tauriStore) {
      return normalize(await tauriStore.get(CONFIG_KEY));
    }
    const raw = localStorage.getItem(CONFIG_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_SERVER_CONFIG;
  }
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  if (tauriStore) {
    await tauriStore.set(CONFIG_KEY, config);
    await tauriStore.save();
    return;
  }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 隐私模式或配额不足时静默失败，配置仅存活于本次会话
  }
}
