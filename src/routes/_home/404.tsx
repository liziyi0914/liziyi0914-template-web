import { createFileRoute } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { mainAtom } from '@/components/MainFramework.tsx';
import NotFound from '@/components/NotFound.tsx';

export const Route = createFileRoute('/_home/404')({
  component: RouteComponent,
});

function RouteComponent() {
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

  return <NotFound />;
}
