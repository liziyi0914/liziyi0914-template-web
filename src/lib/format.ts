const PLACEHOLDER = '—';

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return PLACEHOLDER;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

export function formatTime(timestamp: number | null): string {
  if (timestamp === null) return PLACEHOLDER;

  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatText(value: string | null): string {
  return value?.trim() ? value : PLACEHOLDER;
}

export function formatLatency(ms: number | null): string {
  return ms === null ? PLACEHOLDER : `${ms} ms`;
}
