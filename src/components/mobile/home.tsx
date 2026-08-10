import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { DeviceFlowCard } from '@/components/device-flow-card';
import { LogPanel } from '@/components/log-panel';
import { MobilePage } from '@/components/mobile/page';
import { Button } from '@/components/ui/button';
import { VoiceDemo } from '@/components/voice-demo';

/**
 * 移动端首页。连接状态与配置都在设置页里。
 * 连接由 Rust 在应用启动时自动建立，不依赖本页挂载。
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
    >
      <DeviceFlowCard />
      <VoiceDemo />
      <LogPanel />
    </MobilePage>
  );
}
