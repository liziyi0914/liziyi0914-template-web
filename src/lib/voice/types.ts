/**
 * 语音链路的事件契约。改这里必须同步改 src-tauri/src/voice/events.rs，
 * 那边有单测钉住了序列化结果。
 */

export type SessionState = 'starting' | 'listening' | 'stopped';

export type ErrorStage = 'permission' | 'audio' | 'asr';

export type VoiceEvent =
  | { type: 'state'; state: SessionState }
  /** index 是句子序号，据此原地更新同一句的中间结果 */
  | { type: 'transcript'; text: string; index: number; final: boolean }
  | { type: 'wake' }
  /** 唤醒后的命令句原文。怎么解释它由 Rust 侧的机器人 Agent 决定 */
  | { type: 'command'; text: string }
  | { type: 'error'; stage: ErrorStage; message: string };

export interface VoiceHandlers {
  onState?: (state: SessionState) => void;
  onTranscript?: (text: string, index: number, final: boolean) => void;
  onWake?: () => void;
  onCommand?: (text: string) => void;
  onError?: (stage: ErrorStage, message: string) => void;
}
