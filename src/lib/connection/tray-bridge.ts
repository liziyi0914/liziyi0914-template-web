import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import {
  CONNECTION_STATE_LABEL,
  type ConnectionInfo,
  type ConnectionState,
} from './types';

export const TRAY_STATE_EVENT = 'connection://changed';
export const TRAY_RECONNECT_EVENT = 'tray://reconnect';

/**
 * 发给 Rust 的托盘投影。文案在前端拼好，Rust 侧只负责渲染与按 state 选图标。
 */
export interface TraySummary {
  state: ConnectionState;
  statusLine: string;
  robotLine: string;
  tooltip: string;
}

export function toTraySummary(info: ConnectionInfo): TraySummary {
  const stateLabel = CONNECTION_STATE_LABEL[info.state];
  const statusLine = info.classroomId
    ? `${stateLabel} · 课室 ${info.classroomId}`
    : stateLabel;
  const robotLine =
    info.state === 'connected'
      ? `机器人：${info.robot.online ? '在线' : '离线'}`
      : '机器人：未知';

  return {
    state: info.state,
    statusLine,
    robotLine,
    tooltip: `GDUFE Classroom\n${statusLine}\n${robotLine}`,
  };
}

export function publishTrayState(info: ConnectionInfo): void {
  if (!isTauri()) return;
  void emit(TRAY_STATE_EVENT, toTraySummary(info));
}

export function onTrayReconnect(handler: () => void): () => void {
  if (!isTauri()) return () => {};

  const unlisten = listen(TRAY_RECONNECT_EVENT, handler);
  return () => {
    void unlisten.then((fn) => fn());
  };
}
