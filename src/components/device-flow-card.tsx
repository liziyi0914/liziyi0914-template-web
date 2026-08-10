import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDeviceFlow } from '@/hooks/use-device-flow';

/**
 * 机器人待授权卡片。只在 Rust 侧处于 authorizing 时出现。
 *
 * 二维码在前端画：Rust 只给出完整地址字符串，为了一张图给它引入图像依赖不值得。
 */
export function DeviceFlowCard() {
  const flow = useDeviceFlow();
  const [qr, setQr] = useState<string | null>(null);
  const target = flow?.verificationUriComplete ?? null;

  useEffect(() => {
    if (!target) {
      setQr(null);
      return;
    }

    let disposed = false;
    // 白底二维码：深色主题下透明背景会让扫码识别不出来
    void QRCode.toDataURL(target, {
      margin: 1,
      width: 240,
      color: { light: '#ffffff' },
    })
      .then((url) => {
        if (!disposed) setQr(url);
      })
      .catch((error: unknown) => {
        console.error('生成二维码失败', error);
        if (!disposed) setQr(null);
      });

    return () => {
      disposed = true;
    };
  }, [target]);

  if (!flow) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>等待授权</CardTitle>
        <CardDescription>
          请老师扫码，或在网页上输入下面的授权码
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <p className="font-mono text-3xl tracking-[0.35em] tabular-nums">
          {flow.userCode}
        </p>
        {qr ? (
          <img
            src={qr}
            alt={`授权码 ${flow.userCode} 的二维码`}
            className="size-40 rounded-lg border bg-white p-2"
          />
        ) : (
          <div className="size-40 animate-pulse rounded-lg border bg-muted" />
        )}
        <p className="break-all text-center text-xs text-muted-foreground">
          {flow.verificationUriComplete}
        </p>
      </CardContent>
    </Card>
  );
}
