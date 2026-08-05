import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { MobilePage } from '@/components/mobile/page';
import { Button } from '@/components/ui/button';

/**
 * 移动端首页。连接状态与配置都在设置页里，这里留空等课室交互界面接入。
 * 连接的建立由根路由的 useConnectionBootstrap 负责，不依赖本页挂载。
 */
export function MobileHome() {
  return (
    <MobilePage
      actions={
        <Button asChild variant="outline" size="icon" aria-label="设置">
          <Link to="/settings">
            <Settings />
          </Link>
        </Button>
      }
    />
  );
}
