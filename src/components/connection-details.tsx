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
import { formatText } from '@/lib/format';
import type { ConnectionInfo } from '@/lib/platform-api';

export function ConnectionDetails({ info }: { info: ConnectionInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>连接详情</CardTitle>
        <CardDescription>由服务器在登录快照与事件中下发</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {info.lastError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>
              {info.kicked ? '已在别处连接' : '最近一次错误'}
            </AlertTitle>
            <AlertDescription>
              {info.lastError}
              {/* 顶号后 Rust 侧不再自动重连，得说清楚要人工介入 */}
              {info.kicked ? '。确认另一处已关闭后，点「重新连接」。' : ''}
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="flex flex-col gap-3 text-sm">
          <Row label="在线时长">
            <Uptime since={info.connectedAt} />
          </Row>
          <Row label="重连次数">{info.reconnectCount}</Row>

          <Separator />

          <Row label="课堂 ID" mono>
            {formatText(info.lessonId)}
          </Row>
          <Row label="课程">{formatText(info.courseName)}</Row>
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
