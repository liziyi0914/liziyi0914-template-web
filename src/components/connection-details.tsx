import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Uptime } from '@/components/uptime';
import type { ConnectionInfo } from '@/lib/connection/types';
import { formatLatency, formatText, formatTime } from '@/lib/format';

export function ConnectionDetails({ info }: { info: ConnectionInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>连接详情</CardTitle>
        <CardDescription>由服务器在握手与心跳中下发</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {info.lastError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>最近一次错误</AlertTitle>
            <AlertDescription>{info.lastError}</AlertDescription>
          </Alert>
        ) : null}

        <dl className="flex flex-col gap-3 text-sm">
          <Row label="网络延迟">{formatLatency(info.latencyMs)}</Row>
          <Row label="在线时长">
            <Uptime since={info.connectedAt} />
          </Row>
          <Row label="最后心跳">{formatTime(info.lastHeartbeatAt)}</Row>
          <Row label="重连次数">{info.reconnectCount}</Row>

          <Separator />

          <Row label="会话 ID" mono>
            {formatText(info.sessionId)}
          </Row>
          <Row label="服务端版本" mono>
            {formatText(info.serverVersion)}
          </Row>

          <Separator />

          <Row label="安卓端版本" mono>
            {formatText(info.robot.appVersion)}
          </Row>
          <Row label="机器人最后在线">{formatTime(info.robot.lastSeenAt)}</Row>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'truncate font-mono' : 'truncate'}>{children}</dd>
    </div>
  );
}
