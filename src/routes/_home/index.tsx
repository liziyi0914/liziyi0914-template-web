import { Icon } from '@iconify/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { mainAtom } from '@/components/MainFramework.tsx';

interface FunctionCardProps {
  icon: string;
  title: string;
  onClick?: () => void;
}

function AppCard({ icon, title, onClick }: FunctionCardProps) {
  return (
    <div
      className="py-4 flex flex-col items-center gap-y-2 select-none cursor-pointer"
      onClick={onClick}
    >
      <Icon icon={icon} className="text-4xl text-blue-600" />
      <div className="text-sm font-medium">{title}</div>
    </div>
  );
}

export const Route = createFileRoute('/_home/')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const setMainFramework = useSetAtom(mainAtom);

  useEffect(() => {
    setMainFramework((prev) => ({
      ...prev,
      ...{
        tabBarVisible: true,
        activeTab: 'home',
        navbarVisible: false,
      },
    }));
  }, []);

  return (
    <div>
      <div className="p-6">
        <div className="pb-3">应用与功能</div>
        <div className="grid grid-cols-4">
          <AppCard icon="ph:signature" title="文件签署" />
          <AppCard
            icon="lucide:settings"
            title="管理后台"
            onClick={() => {
              navigate({
                to: '/dashboard/home',
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
