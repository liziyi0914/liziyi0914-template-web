import '@/App.css';
import '@/Global.less';
import '@/assets/NotoColorEmoji.css';
import '@ant-design/v5-patch-for-react-19';
import { routeTree } from '@/routeTree.gen';
import { AppFonts } from '@/utils/constants.ts';
import { initIcons } from '@/utils/icons.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { useLocalStorageState } from 'ahooks';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import React, { Suspense, useEffect } from 'react';

initIcons();

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

const queryClient = new QueryClient();

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const ReactQueryDevtools = import.meta.env.PROD
  ? () => null // Render nothing in production
  : React.lazy(() =>
      import('@tanstack/react-query-devtools').then((res) => ({
        default: res.ReactQueryDevtools,
      })),
    );

const App = () => {
  const [isDark] = useLocalStorageState('theme.dark', {
    defaultValue: false,
    listenStorageChange: true,
  });

  useEffect(() => {
    if (document.getElementsByTagName('html')?.[0]) {
      document.getElementsByTagName('html')[0].className = isDark
        ? 'night'
        : 'light';
    }
  }, [isDark]);

  useEffect(() => {
    if (document.getElementsByTagName('html')?.[0]) {
      document.getElementsByTagName('html')[0].style.fontFamily = AppFonts;
    }
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          fontFamily: AppFonts,
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <Suspense>
            <ReactQueryDevtools />
          </Suspense>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
