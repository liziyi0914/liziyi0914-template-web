import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ErrorStage,
  type SessionState,
  startASR,
  stopASR,
  type VoiceCommand,
} from '@/lib/voice';

export type TimelineItem =
  | {
      id: string;
      kind: 'transcript';
      text: string;
      final: boolean;
    }
  | { id: string; kind: 'wake' }
  | {
      id: string;
      kind: 'command';
      command: VoiceCommand;
      source: string;
      system: string;
      raw: string;
    }
  | { id: string; kind: 'error'; label: string; message: string };

export type VoiceStatus = 'idle' | SessionState;

const STAGE_LABELS: Record<ErrorStage, string> = {
  permission: '麦克风权限',
  audio: '录音',
  asr: '语音识别',
  llm: '命令解析',
};

/**
 * 语音会话的界面状态。
 *
 * 各类事件合并成一条时间线，这样中间结果、唤醒、命令与错误的先后关系
 * 一眼可见；调试时最需要的就是这个顺序。
 */
export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [items, setItems] = useState<TimelineItem[]>([]);

  // 句子序号每次会话从 0 重新开始，用轮次前缀避免跨会话串行
  const epochRef = useRef(0);
  const runningRef = useRef(false);

  const append = useCallback((item: TimelineItem) => {
    setItems((curr) => [...curr, item]);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const epoch = ++epochRef.current;
    setStatus('starting');
    setItems([]);

    try {
      await startASR({
        onState: (state) => {
          setStatus(state);
          if (state === 'stopped') runningRef.current = false;
        },
        onTranscript: (text, index, final) => {
          const id = `${epoch}-t${index}`;
          setItems((curr) => {
            // 中间结果几乎总是命中最后一条，从尾部找
            for (let i = curr.length - 1; i >= 0; i--) {
              if (curr[i].id !== id) continue;
              const next = curr.slice();
              next[i] = { id, kind: 'transcript', text, final };
              return next;
            }
            return [...curr, { id, kind: 'transcript', text, final }];
          });
        },
        onWake: () => {
          append({ id: `${epoch}-w${Date.now()}`, kind: 'wake' });
        },
        onCommand: (command, source, system, raw) => {
          append({
            id: `${epoch}-c${Date.now()}`,
            kind: 'command',
            command,
            source,
            system,
            raw,
          });
        },
        onError: (stage, message) => {
          append({
            id: `${epoch}-e${Date.now()}`,
            kind: 'error',
            label: STAGE_LABELS[stage],
            message,
          });
        },
      });
    } catch (error) {
      runningRef.current = false;
      setStatus('idle');
      append({
        id: `${epoch}-e${Date.now()}`,
        kind: 'error',
        label: '启动',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [append]);

  const stop = useCallback(async () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    try {
      await stopASR();
    } catch (error) {
      append({
        id: `${epochRef.current}-e${Date.now()}`,
        kind: 'error',
        label: '停止',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    setStatus('idle');
  }, [append]);

  // 离开页面时必须释放麦克风，否则录音会一直跑到进程退出
  useEffect(() => {
    return () => {
      if (runningRef.current) {
        runningRef.current = false;
        void stopASR();
      }
    };
  }, []);

  return { status, items, start, stop };
}
