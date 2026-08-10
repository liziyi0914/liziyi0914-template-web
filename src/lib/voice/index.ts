import { Channel, invoke } from '@tauri-apps/api/core';
import type { VoiceEvent, VoiceHandlers } from './types';

export type {
  ErrorStage,
  SessionState,
  VoiceEvent,
  VoiceHandlers,
} from './types';

function dispatch(event: VoiceEvent, handlers: VoiceHandlers) {
  switch (event.type) {
    case 'state':
      handlers.onState?.(event.state);
      break;
    case 'transcript':
      handlers.onTranscript?.(event.text, event.index, event.final);
      break;
    case 'wake':
      handlers.onWake?.();
      break;
    case 'command':
      handlers.onCommand?.(event.text);
      break;
    case 'error':
      handlers.onError?.(event.stage, event.message);
      break;
  }
}

/**
 * 开启语音会话。原生侧只有一条 Channel，这里把它拆成多个回调。
 *
 * 重复调用会被原生侧拒绝并抛错，而不是静默重启。
 */
export async function startASR(handlers: VoiceHandlers): Promise<void> {
  const onEvent = new Channel<VoiceEvent>();
  onEvent.onmessage = (event) => dispatch(event, handlers);
  await invoke('start_asr', { onEvent });
}

/** 停止语音会话。未在运行时是无操作，不会报错。 */
export async function stopASR(): Promise<void> {
  await invoke('stop_asr');
}

/**
 * 验证当前平台能否完成 HTTPS 握手。
 *
 * 安卓上 TLS 走的是自带根证书而非系统验证器，这个探针能把
 * 「TLS 不通」和「凭据或协议不对」区分开。
 */
export async function checkTlsReachable(): Promise<number> {
  return invoke<number>('tls_smoke_test');
}
