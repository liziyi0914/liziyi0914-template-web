import { toast } from 'sonner';
import { connectionActions } from '@/hooks/use-connection';
import { useServerConfig } from '@/hooks/use-server-config';
import { type ServerConfig, serverUrl } from '@/lib/connection/types';

/**
 * 落盘服务器配置并立即以新参数重连，PC 端与移动端共用同一套语义。
 *
 * @param onSaved 保存成功后的收尾动作，移动端用它退回首页
 */
export function useSaveServerConfig(onSaved?: () => void | Promise<void>) {
  const { save } = useServerConfig();

  return async (next: ServerConfig) => {
    await save(next);
    connectionActions.connect(next);
    toast.success('配置已保存', { description: `正在连接 ${serverUrl(next)}` });
    await onSaved?.();
  };
}
