import { ProConfigProvider } from '@ant-design/pro-components';
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { App, ConfigProvider, theme } from 'antd';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import AiFormItem from '@/components/formItem/AiFormItem.tsx';
import AssetsPicker, {
  AssetsPickerView,
} from '@/components/formItem/AssetsPicker.tsx';
import DepartmentPicker, {
  DepartmentPickerView,
} from '@/components/formItem/DepartmentPicker.tsx';
import EmployeePicker, {
  EmployeePickerView,
} from '@/components/formItem/EmployeePicker.tsx';
import ValidDateRange, {
  ValidDateRangeView,
} from '@/components/formItem/ValidDateRange.tsx';
import NotFound from '@/components/NotFound.tsx';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => {
    const { resolvedTheme: t } = useTheme();

    useEffect(() => {
      document.documentElement.setAttribute(
        'data-prefers-color-scheme',
        t ?? 'light',
      );
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, [t]);

    return (
      <>
        <ConfigProvider
          theme={{
            algorithm:
              t === 'light' ? theme.defaultAlgorithm : theme.darkAlgorithm,
          }}
        >
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
              employee: {
                render: (text) => {
                  return <EmployeePickerView value={text} />;
                },
                renderFormItem: (_, props) => {
                  return <EmployeePicker {...props.fieldProps} />;
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
