import './App.css';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx';
import { routeTree } from './routeTree.gen.ts';

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
    <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
      <RouterProvider router={router} />
    </TanStackQueryProvider.Provider>
  );
};

export default App;
