import { CircleAlert, Mic, Square } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type TimelineItem,
  useVoiceSession,
  type VoiceStatus,
} from '@/hooks/use-voice-session';
import { IS_ANDROID } from '@/lib/platform';
import type { VoiceCommand } from '@/lib/voice';

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: '未启动',
  starting: '连接中',
  listening: '聆听中',
  stopped: '已停止',
};

const unsupported = (
  <Alert variant="destructive">
    <CircleAlert />
    <AlertTitle>当前平台不支持</AlertTitle>
    <AlertDescription>
      语音命令依赖安卓原生麦克风，请在安卓设备上运行。
    </AlertDescription>
  </Alert>
);

const emptyHint = (
  <p className="py-8 text-center text-sm text-muted-foreground">
    点击「开始」后说「你好小财」唤醒，接着说出你的指令。
  </p>
);

export function VoiceDemo() {
  const { status, items, start, stop } = useVoiceSession();
  const running = status !== 'idle' && status !== 'stopped';

  return (
    <Card>
      <CardHeader>
        <CardTitle>语音命令</CardTitle>
        <CardDescription>唤醒词「你好小财」</CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Badge variant={running ? 'default' : 'secondary'}>
              {STATUS_TEXT[status]}
            </Badge>
            <Button
              variant={running ? 'outline' : 'default'}
              disabled={!IS_ANDROID}
              onClick={() => void (running ? stop() : start())}
            >
              {running ? (
                <Square data-icon="inline-start" />
              ) : (
                <Mic data-icon="inline-start" />
              )}
              {running ? '停止' : '开始'}
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {IS_ANDROID ? null : unsupported}
        <Timeline items={items} />
      </CardContent>
    </Card>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // 只有用户停留在底部时才自动跟随，否则会把正在往回翻的人拽走
  useEffect(() => {
    const node = ref.current;
    if (items.length === 0 || !node || !pinnedRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [items]);

  return (
    <div
      ref={ref}
      onScroll={(event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        pinnedRef.current = scrollHeight - scrollTop - clientHeight < 24;
      }}
      className="h-64 overflow-y-auto overscroll-contain rounded-lg border bg-muted/30 p-3 landscape:h-80"
    >
      {items.length === 0 ? (
        emptyHint
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

const TimelineRow = memo(function TimelineRow({
  item,
}: {
  item: TimelineItem;
}) {
  switch (item.kind) {
    case 'transcript':
      return (
        <p
          className={
            item.final ? 'text-sm' : 'text-sm text-muted-foreground italic'
          }
        >
          {item.text}
        </p>
      );

    case 'wake':
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline">已唤醒</Badge>
        </div>
      );

    case 'command':
      return (
        <CommandRow
          command={item.command}
          source={item.source}
          raw={item.raw}
        />
      );

    case 'error':
      return (
        <p className="text-sm text-destructive">
          {item.label}：{item.message}
        </p>
      );
  }
});

function CommandRow({
  command,
  source,
  raw,
}: {
  command: VoiceCommand;
  source: string;
  raw: string;
}) {
  const unknown = command.intent === 'unknown';

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <Badge variant={unknown ? 'destructive' : 'default'}>
          {command.intent}
        </Badge>
        <span className="truncate text-xs text-muted-foreground">{source}</span>
      </div>

      {command.reply ? <p className="mt-1 text-sm">{command.reply}</p> : null}

      {Object.keys(command.params).length > 0 ? (
        <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(command.params)}
        </pre>
      ) : null}

      {/* 解析失败时原始输出是唯一线索 */}
      {unknown && raw ? (
        <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
          {raw}
        </pre>
      ) : null}
    </div>
  );
}
