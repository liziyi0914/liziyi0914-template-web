import './App.css';
import { ProConfigProvider } from '@ant-design/pro-components';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import AssetsPicker, { AssetsPickerView } from '@/components/AssetsPicker.tsx';
import DepartmentPicker, {
  DepartmentPickerView,
} from '@/components/DepartmentPicker.tsx';
import { ThemeProvider } from '@/components/theme-provider.tsx';
import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx';
import { routeTree } from './routeTree.gen.ts';
import AiFormItem from "@/components/AiFormItem.tsx";

const TanStackQueryProviderContext = TanStackQueryProvider.getContext();
const router = createRouter({
  routeTree,
  context: {
    ...TanStackQueryProviderContext,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const App = () => {
  return (
    <ThemeProvider>
      <ProConfigProvider
        valueTypeMap={{
          assets: {
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
          ai: {
            renderFormItem: (_, props) => {
              return <AiFormItem {...props.fieldProps} />;
            },
          },
        }}
      >
        <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
          <RouterProvider router={router} />
        </TanStackQueryProvider.Provider>
      </ProConfigProvider>
    </ThemeProvider>
  );
};

export default App;
