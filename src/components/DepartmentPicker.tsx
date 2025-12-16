import { useQuery } from '@tanstack/react-query';
import { TreeSelect } from 'antd';
import React, {useMemo} from 'react';
import { Api } from '@/lib/api.ts';
import { convertDepartmentsToTreeData } from '@/lib/functions.tsx';

const Component: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  allowTypes?: Array<'department' | 'position'>;
  bannedValues?: Array<string>;
  placeholder?: string;
}> = (props) => {
  const data = useQuery({
    queryKey: ['form.departments'],
    queryFn: async () => {
      const resp = await Api.common.getDepartments();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(resp.msg || '获取公司结构失败');
    },
    refetchOnWindowFocus: false,
  });

  return (
    <TreeSelect
      value={props.value}
      onChange={props.onChange}
      placeholder={props.placeholder}
      treeData={convertDepartmentsToTreeData(
        data.data ?? [],
        null,
        props.allowTypes,
        props.bannedValues,
      )}
      allowClear
      treeDefaultExpandAll
    />
  );
};

export const DepartmentPickerView: React.FC<{
  value?: string;
}> = (props) => {
  const data = useQuery({
    queryKey: ['form.departments'],
    queryFn: async () => {
      const resp = await Api.common.getDepartments();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(resp.msg || '获取公司结构失败');
    },
    refetchOnWindowFocus: false,
  });

  const display = useMemo(() => {
    if(!props.value) {
      return '-';
    }

    if (!data.isSuccess || !data.data) {
      return '-';
    }

    for (let item of data.data) {
      if (item.id === props.value) {
        return item.name;
      }
      for (let pos of item.positions ?? []) {
        if (pos.id === props.value) {
          return `${item.name} - ${pos.name}`;
        }
      }
    }

    return '-';
  }, [data, props.value]);

  return (
    <>{display}</>
  );
};

export default Component;
