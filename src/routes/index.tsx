import { createFileRoute } from '@tanstack/react-router';
import { DesktopHome } from '@/components/desktop/home';
import { MobileHome } from '@/components/mobile/home';
import { IS_MOBILE_UI } from '@/lib/platform';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return IS_MOBILE_UI ? <MobileHome /> : <DesktopHome />;
}
