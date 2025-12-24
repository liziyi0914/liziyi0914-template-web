import { ProConfigProvider } from '@ant-design/pro-components';
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { App, ConfigProvider, theme } from 'antd';
import {useEffect, useMemo} from 'react';
import AiFormItem from '@/components/formItem/AiFormItem.tsx';
import AssetsPicker, {
  AssetsPickerView,
} from '@/components/formItem/AssetsPicker.tsx';
import DepartmentPicker, {
  DepartmentPickerView,
} from '@/components/formItem/DepartmentPicker.tsx';
import ValidDateRange, {
  ValidDateRangeView,
} from '@/components/formItem/ValidDateRange.tsx';
import NotFound from '@/components/NotFound.tsx';
import { ThemeProvider, useTheme } from '@/components/theme-provider.tsx';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => {
    const themeCfg = useTheme();
    const currentTheme = useMemo(() => {
      return themeCfg.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : themeCfg.theme;
    }, [themeCfg.theme]);

    useEffect(() => {
      document.documentElement.setAttribute(
        'data-prefers-color-scheme',
        currentTheme ? 'dark' : 'light'
      )
    }, [currentTheme]);

    return (
      <>
        <ConfigProvider
          theme={{
            algorithm:
              currentTheme === 'light'
                ? theme.defaultAlgorithm
                : theme.darkAlgorithm,
          }}
        >
          <ThemeProvider>
            <ProConfigProvider
              valueTypeMap={{
                '#assets': {
                  render: (text) => {
                    return <AssetsPickerView value={text} />;
                  },
                  renderFormItem: (_, props) => {
                    return <AssetsPicker {...props.fieldProps} />;
                  },
                },
                department: {
                  render: (text) => {
                    return <DepartmentPickerView value={text} />;
                  },
                  renderFormItem: (_, props) => {
                    return <DepartmentPicker {...props.fieldProps} />;
                  },
                },
                validDateRange: {
                  render: (text) => {
                    return <ValidDateRangeView value={text} />;
                  },
                  renderFormItem: (_, props) => {
                    return <ValidDateRange {...props.fieldProps} />;
                  },
                },
                '#ai': {
                  renderFormItem: (_, props) => {
                    return <AiFormItem {...props.fieldProps} />;
                  },
                },
              }}
            >
              <App>
                <Outlet />
              </App>
            </ProConfigProvider>
          </ThemeProvider>
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
