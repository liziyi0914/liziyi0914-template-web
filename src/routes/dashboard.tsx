import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Spin, Watermark } from 'antd';
import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import DashboardFramework from '@/components/DashboardFramework.tsx';
import { Api } from '@/lib/api.ts';
import NotFound from "@/components/NotFound.tsx";

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  notFoundComponent: () => (
    <NotFound/>
  ),
});

export const LoginState = atom<{
  name: string;
  idCard: string;
  companyName: string;
}>();

function RouteComponent() {
  const navigate = useNavigate();
  const setLoginState = useSetAtom(LoginState);

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
    } else {
      setLoginState(query.data?.data);
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
          <DashboardFramework>
            <Outlet />
          </DashboardFramework>
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
