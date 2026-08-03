import { memo, useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format';

/**
 * 当前时间必须进 state：它是渲染结果的真实依赖，直接调 Date.now()
 * 会被 React Compiler 视为常量而缓存住。
 *
 * 独立成组件，让每秒一次的重渲染局限在这一行文本，不波及整棵树。
 */
export const Uptime = memo(function Uptime({
  since,
}: {
  since: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === null) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);

  return <>{since === null ? '—' : formatDuration(now - since)}</>;
});
