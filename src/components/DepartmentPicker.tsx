import { useQuery } from '@tanstack/react-query';
import { TreeSelect } from 'antd';
import type React from 'react';
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

export default Component;
