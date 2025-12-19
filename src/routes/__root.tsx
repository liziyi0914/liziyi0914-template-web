import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { App, ConfigProvider, theme } from 'antd';
import NotFound from '@/components/NotFound.tsx';
import { useTheme } from '@/components/theme-provider.tsx';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => {
    const themeCfg = useTheme();

    return (
      <>
        <ConfigProvider
          theme={{
            algorithm:
              themeCfg.realTheme === 'light'
                ? theme.defaultAlgorithm
                : theme.darkAlgorithm,
          }}
        >
          <App>
            <Outlet />
          </App>
        </ConfigProvider>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-left',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              {
                name: 'Tanstack Query',
                render: <ReactQueryDevtoolsPanel />,
              },
            ]}
          />
        )}
      </>
    );
  },
  notFoundComponent: () => <NotFound />,
});
