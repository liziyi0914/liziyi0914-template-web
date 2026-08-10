import { BookOpen, DoorOpen, RefreshCw } from 'lucide-react';
import { ConnectionStateBadge } from '@/components/connection-state-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatText } from '@/lib/format';
import type { ConnectionInfo } from '@/lib/platform-api';

const BUSY_STATES = new Set(['connecting', 'reconnecting']);

const DESKTOP_UNCONFIGURED_HINT = '尚未配置服务器，请先在右侧填写连接参数';

interface ConnectionStatusCardProps {
  info: ConnectionInfo;
  serverUrl: string | null;
  /** 未配置时的引导文案，移动端的设置入口不在右侧而在应用栏 */
  unconfiguredHint?: string;
  onReconnect: () => void;
}

export function ConnectionStatusCard({
  info,
  serverUrl,
  unconfiguredHint = DESKTOP_UNCONFIGURED_HINT,
  onReconnect,
}: ConnectionStatusCardProps) {
  const busy = BUSY_STATES.has(info.state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>连接状态</CardTitle>
        <CardDescription>{serverUrl ?? unconfiguredHint}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={onReconnect}
            disabled={busy}
          >
            <RefreshCw data-icon="inline-start" />
            重新连接
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <StatBlock label="当前状态">
          <ConnectionStateBadge state={info.state} />
        </StatBlock>

        <StatBlock label="教室 ID" icon={<DoorOpen className="size-3.5" />}>
          <span className="font-mono text-lg leading-none font-medium">
            {formatText(info.classroomId)}
          </span>
        </StatBlock>

        <StatBlock label="当前课堂" icon={<BookOpen className="size-3.5" />}>
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-medium">
              {formatText(info.lessonTitle)}
            </span>
            {info.courseName ? (
              <span className="truncate text-xs text-muted-foreground">
                {info.courseName}
              </span>
            ) : null}
          </div>
        </StatBlock>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}
