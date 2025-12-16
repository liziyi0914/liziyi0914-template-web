import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Spin, Watermark } from 'antd';
import { useEffect } from 'react';
import MainFramework from '@/components/MainFramework.tsx';
import NotFound from '@/components/NotFound.tsx';
import { Api } from '@/lib/api.ts';

export const Route = createFileRoute('/_home')({
  component: RouteComponent,
  notFoundComponent: () => <NotFound />,
});

function RouteComponent() {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['auth.check'],
    queryFn: Api.auth.check,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.isError || (query.isSuccess && query.data?.code !== 200)) {
      navigate({
        to: '/login',
      });
    }
  }, [query]);

  return (
    <>
      {query.isSuccess && query.data?.code === 200 && (
        <Watermark
          content={[
            query.data?.data?.name ?? '',
            query.data?.data?.idCard ?? '',
          ]}
        >
          <MainFramework>
            <Outlet />
          </MainFramework>
        </Watermark>
      )}
      {query.isLoading && (
        <Spin spinning tip="登录中">
          <div className="h-[50vh]" />
        </Spin>
      )}
    </>
  );
}
