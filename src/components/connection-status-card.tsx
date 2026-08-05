import { Bot, DoorOpen, PlugZap, RefreshCw } from 'lucide-react';
import { ConnectionStateBadge } from '@/components/connection-state-badge';
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
import type { ConnectionInfo } from '@/lib/connection/types';
import { formatText } from '@/lib/format';

const BUSY_STATES = new Set(['connecting', 'reconnecting']);

const DESKTOP_UNCONFIGURED_HINT = '尚未配置服务器，请先在右侧填写连接参数';

interface ConnectionStatusCardProps {
  info: ConnectionInfo;
  serverUrl: string | null;
  /** 未配置时的引导文案，移动端的设置入口不在右侧而在应用栏 */
  unconfiguredHint?: string;
  onReconnect: () => void;
  onSimulateFailure: () => void;
}

export function ConnectionStatusCard({
  info,
  serverUrl,
  unconfiguredHint = DESKTOP_UNCONFIGURED_HINT,
  onReconnect,
  onSimulateFailure,
}: ConnectionStatusCardProps) {
  const busy = BUSY_STATES.has(info.state);
  const robotLabel =
    info.state === 'connected' ? (info.robot.online ? '在线' : '离线') : '未知';

  return (
    <Card>
      <CardHeader>
        <CardTitle>连接状态</CardTitle>
        <CardDescription>
          {serverUrl ? serverUrl : unconfiguredHint}
        </CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          {import.meta.env.DEV && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSimulateFailure}
              disabled={info.state === 'idle'}
            >
              <PlugZap data-icon="inline-start" />
              模拟断线
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onReconnect}
            disabled={info.state === 'idle' || busy}
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

        <StatBlock label="课室 ID" icon={<DoorOpen className="size-3.5" />}>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-lg leading-none font-medium">
              {formatText(info.classroomId)}
            </span>
            {info.classroomName ? (
              <span className="truncate text-xs text-muted-foreground">
                {info.classroomName}
              </span>
            ) : null}
          </div>
        </StatBlock>

        <StatBlock label="机器人状态" icon={<Bot className="size-3.5" />}>
          <div className="flex flex-col items-start gap-1">
            <Badge
              variant={
                info.state !== 'connected'
                  ? 'outline'
                  : info.robot.online
                    ? 'default'
                    : 'secondary'
              }
            >
              {robotLabel}
            </Badge>
            <span className="truncate text-xs text-muted-foreground">
              {formatText(info.robot.deviceName)}
            </span>
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
