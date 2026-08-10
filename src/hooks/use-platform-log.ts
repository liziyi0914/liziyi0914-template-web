import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import type { LogEntry } from '@/lib/platform-api';
import { getRecentLogs, onLog } from '@/lib/platform-api';

/** 与 Rust 侧的环形缓冲容量保持一致 */
const CAPACITY = 200;

const logsAtom = atom<LogEntry[]>([]);

export function usePlatformLog() {
  const [entries, setEntries] = useAtom(logsAtom);

  useEffect(() => {
    // 先补齐订阅之前已经产生的日志，再接增量
    void getRecentLogs().then(setEntries);

    return onLog((entry) => {
      setEntries((current) => {
        const next = [...current, entry];
        return next.length > CAPACITY ? next.slice(-CAPACITY) : next;
      });
    });
  }, [setEntries]);

  return entries;
}
