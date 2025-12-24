import { useQuery } from '@tanstack/react-query';
import {Select} from 'antd';
import type React from 'react';
import { useMemo } from 'react';
import { Api } from '@/lib/api.ts';

const Component: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}> = (props) => {
  const data = useQuery({
    queryKey: ['form.employees'],
    queryFn: async () => {
      const resp = await Api.common.getEmployees();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(resp.msg || '获取人员信息失败');
    },
    refetchOnWindowFocus: false,
  });

  return (
    <Select
      value={props.value}
      onChange={props.onChange}
      placeholder={props.placeholder}
      allowClear
      options={data.data?.map((item) => ({
        value: item.id,
        label: item.name ? `${item.name} (${item.phone})` : item.phone,
      })) ?? []}
    />
  );
};

export const EmployeePickerView: React.FC<{
  value?: string;
}> = (props) => {
  const data = useQuery({
    queryKey: ['form.employees'],
    queryFn: async () => {
      const resp = await Api.common.getEmployees();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(resp.msg || '获取人员信息失败');
    },
    refetchOnWindowFocus: false,
  });

  const display = useMemo(() => {
    if (!props.value) {
      return '-';
    }

    if (!data.isSuccess || !data.data) {
      return '-';
    }

    for (const item of data.data) {
      if (item.id === props.value) {
        return item.name ? `${item.name} (${item.phone})` : item.phone;
      }
    }

    return '-';
  }, [data, props.value]);

  return <>{display}</>;
};

export default Component;
