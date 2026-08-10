import { useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePlatformLog } from '@/hooks/use-platform-log';
import { formatTime } from '@/lib/format';
import type { LogEntry, LogLevel, LogSource } from '@/lib/platform-api';
import { cn } from '@/lib/utils';

const LEVEL_CLASS: Record<LogLevel, string> = {
  info: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
};

const SOURCE_LABEL: Record<LogSource, string> = {
  connection: '连接',
  command: '指令',
  agent: '助手',
  browser: '浏览器',
};

/** 只有停在底部时才自动跟随，否则会打断正在往回翻的人 */
const FOLLOW_THRESHOLD_PX = 48;

export function LogPanel({ className }: { className?: string }) {
  const entries = usePlatformLog();
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 需要在 entries 变化时重新计算滚动位置，但只依赖 DOM ref
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom <= FOLLOW_THRESHOLD_PX) {
      node.scrollTop = node.scrollHeight;
    }
  }, [entries]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>运行日志</CardTitle>
        <CardDescription>连接变化、收发指令与助手回复</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="h-80 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm"
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground">暂无日志</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <LogLine entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTime(entry.at)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          [{SOURCE_LABEL[entry.source]}]
        </span>
        <span className={cn('break-all', LEVEL_CLASS[entry.level])}>
          {entry.message}
        </span>
      </div>
      {entry.detail ? (
        <details className="pl-14">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            详情
          </summary>
          <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap">
            {entry.detail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
