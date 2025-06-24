import { NotFoundPage } from '@/components/CommonPages';
import { Icon } from '@iconify/react';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useLocalStorageState } from 'ahooks';
import { FloatButton, Result, Skeleton, theme } from 'antd';
import React, { Suspense } from 'react';

const { useToken } = theme;

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => <NotFoundPage redirectTo="/" />,
  pendingComponent: () => <Skeleton loading={true} />,
  errorComponent: (props) => (
    <Result
      status="error"
      title="页面出现了一些故障"
      subTitle={props.error.message}
    />
  ),
});

const Page: React.FC = () => {
  const { token } = useToken();

  return (
    <>
      <div
        className="w-full h-screen"
        style={{ background: token.colorBgLayout }}
      >
        <Outlet />
      </div>
    </>
  );
};

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null // Render nothing in production
  : React.lazy(() =>
      import('@tanstack/router-devtools').then((res) => ({
        default: res.TanStackRouterDevtools,
      })),
    );

function RootComponent() {
  const [isDark, setIsDark] = useLocalStorageState('theme.dark', {
    defaultValue: false,
    listenStorageChange: true,
  });

  return (
    <>
      <FloatButton.Group>
        <FloatButton
          tooltip="黑暗模式"
          icon={
            isDark ? (
              <Icon icon="icon-park-outline:moon" />
            ) : (
              <Icon icon="icon-park-outline:sun-one" />
            )
          }
          onClick={() => {
            setIsDark(!isDark);
          }}
        />
      </FloatButton.Group>
      <Page />
      <Suspense>
        <TanStackRouterDevtools position="bottom-right" />
      </Suspense>
    </>
  );
}
