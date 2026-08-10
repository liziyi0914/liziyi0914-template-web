import { useEffect, useState } from 'react';
import { useConnection } from '@/hooks/use-connection';
import { type DeviceFlowInfo, getDeviceFlowState } from '@/lib/platform-api';

/** Rust 侧没为待授权信息开事件，只在等授权时轮询，其余时间一次请求都不发 */
const POLL_INTERVAL_MS = 2_000;

export function useDeviceFlow(): DeviceFlowInfo | null {
  const { info } = useConnection();
  const [flow, setFlow] = useState<DeviceFlowInfo | null>(null);
  const authorizing = info.state === 'authorizing';

  useEffect(() => {
    if (!authorizing) {
      setFlow(null);
      return;
    }

    let disposed = false;
    const read = () => {
      void getDeviceFlowState().then((next) => {
        if (!disposed) setFlow(next);
      });
    };

    read();
    const timer = setInterval(read, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [authorizing]);

  return flow;
}
