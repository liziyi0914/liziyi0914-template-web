import { TanStackDevtools } from '@tanstack/react-devtools';
import { PacerDevtoolsPanel } from '@tanstack/react-pacer-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { Toaster } from '@/components/ui/sonner';
import { IS_MOBILE_UI } from '@/lib/platform';

interface MyRouterContext {
  queryClient: QueryClient;
}

/**
 * Toaster 走 Portal 挂在 body 上，拿不到移动端外壳的 p-safe，
 * 贴底的 toast 会压到手势条与圆角，得自己把安全区让出来。
 * sonner 在窄视口切用 mobileOffset，两个都给才能覆盖平板宽度。
 */
const MOBILE_TOAST_OFFSET = {
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
  left: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
  right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
};

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster
        position={IS_MOBILE_UI ? 'bottom-center' : 'bottom-right'}
        offset={IS_MOBILE_UI ? MOBILE_TOAST_OFFSET : undefined}
        mobileOffset={IS_MOBILE_UI ? MOBILE_TOAST_OFFSET : undefined}
      />
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
            {
              name: 'Tanstack Pacer',
              render: <PacerDevtoolsPanel />,
            },
          ]}
        />
      )}
    </>
  );
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootLayout,
});
