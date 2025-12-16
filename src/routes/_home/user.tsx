import { createFileRoute } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { mainAtom } from '@/components/MainFramework.tsx';

export const Route = createFileRoute('/_home/user')({
  component: RouteComponent,
});

function RouteComponent() {
  const setMainFramework = useSetAtom(mainAtom);

  useEffect(() => {
    setMainFramework((prev) => ({
      ...prev,
      ...{
        tabBarVisible: true,
        activeTab: 'user',
        navbarVisible: false,
      },
    }));
  }, []);

  return <div>Hello "/_home/user"!</div>;
}
