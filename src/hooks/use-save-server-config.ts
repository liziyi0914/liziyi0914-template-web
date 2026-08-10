import { toast } from 'sonner';
import { useServerConfig } from '@/hooks/use-server-config';
import { type RoleConfig, serverUrl } from '@/lib/platform-api';

/**
 * 落盘配置。重连由 Rust 在保存后自动发起，前端不再自己触发。
 *
 * @param onSaved 保存成功后的收尾动作，移动端用它退回首页
 */
export function useSaveServerConfig(onSaved?: () => void | Promise<void>) {
  const { save } = useServerConfig();

  return async (next: RoleConfig) => {
    await save(next);
    toast.success('配置已保存', { description: `正在连接 ${serverUrl(next)}` });
    await onSaved?.();
  };
}
