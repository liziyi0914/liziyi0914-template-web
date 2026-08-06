/**
 * 语音链路的事件契约。改这里必须同步改 src-tauri/src/voice/events.rs，
 * 那边有单测钉住了序列化结果。
 */

export type SessionState = 'starting' | 'listening' | 'stopped';

export type ErrorStage = 'permission' | 'audio' | 'asr' | 'llm';

export interface VoiceCommand {
  /** 命令意图，无法识别时为 'unknown' */
  intent: string;
  params: Record<string, unknown>;
  /** 给用户的简短口播回复 */
  reply: string;
}

export type VoiceEvent =
  | { type: 'state'; state: SessionState }
  /** index 是句子序号，据此原地更新同一句的中间结果 */
  | { type: 'transcript'; text: string; index: number; final: boolean }
  | { type: 'wake' }
  | {
      type: 'command';
      command: VoiceCommand;
      /** 触发这条命令的 ASR 原句 */
      source: string;
      /** 模型返回的原始字符串，解析失败时用于排查 */
      raw: string;
    }
  | { type: 'error'; stage: ErrorStage; message: string };

export interface VoiceHandlers {
  onState?: (state: SessionState) => void;
  onTranscript?: (text: string, index: number, final: boolean) => void;
  onWake?: () => void;
  onCommand?: (command: VoiceCommand, source: string, raw: string) => void;
  onError?: (stage: ErrorStage, message: string) => void;
}
