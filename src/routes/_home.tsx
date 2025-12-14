import {createFileRoute, Outlet, useNavigate} from '@tanstack/react-router'
import {useEffect} from "react";
import {Api} from "@/lib/api.ts";
import {useQuery} from "@tanstack/react-query";
import {Spin, Watermark} from "antd";
import MainFramework from "@/components/MainFramework.tsx";

export const Route = createFileRoute('/_home')({
  component: RouteComponent,
})

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
            <Outlet/>
          </MainFramework>
        </Watermark>
      )}
      {query.isLoading && (
        <Spin spinning tip="登录中">
          <div className="h-[50vh]"/>
        </Spin>
      )}
    </>
  );
}
