import { createFileRoute, redirect } from '@tanstack/react-router';
import { MobileSettings } from '@/components/mobile/settings';
import { IS_MOBILE_UI } from '@/lib/platform';

/** 独立的设置页只属于移动端，PC 端的配置表单仍在主窗口里 */
export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    if (!IS_MOBILE_UI) {
      throw redirect({ to: '/' });
    }
  },
  component: MobileSettings,
});
