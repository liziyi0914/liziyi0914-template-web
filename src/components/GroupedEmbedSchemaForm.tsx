import { BetaSchemaForm } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import type { TabPlacement } from 'antd/lib/tabs';
import * as _ from 'lodash';
import type React from 'react';
import { useMemo } from 'react';
import type { ColumnsType } from '@/lib/types.ts';

const flattenColumns = (columns: ColumnsType[]): ColumnsType[] => {
  return _.uniqBy(
    columns.flatMap((column) => {
      if (column.valueType === '$tabGroup') {
        return [...flattenColumns(column.columns ?? [])];
      }
      return column;
    }),
    (column) => column.dataIndex,
  );
};

const TabsSchemaForm: React.FC<{
  columns: ColumnsType[];
  tabPlacement: TabPlacement;
}> = (props) => {
  return (
    <Tabs
      destroyOnHidden
      tabPlacement={props.tabPlacement}
      items={props.columns.map((column) => {
        return {
          label: column.group?.title ?? '-',
          key: column.group?.id ?? `${column.dataIndex}`,
          children: (
            <div>
              <div className="flex flex-wrap">
                <BetaSchemaForm
                  layoutType="Embed"
                  columns={
                    column.columns?.filter(
                      (column) => column.valueType !== '$tabGroup',
                    ) ?? []
                  }
                />
              </div>
              <TabsSchemaForm
                columns={
                  column.columns?.filter(
                    (column) => column.valueType === '$tabGroup',
                  ) ?? []
                }
                tabPlacement={props.tabPlacement === 'top' ? 'start' : 'top'}
              />
            </div>
          ),
        };
      })}
    />
  );
};

const Component: React.FC<{
  columns: ColumnsType[];
}> = (props) => {
  const flattenedColumns = useMemo(
    () => flattenColumns(props.columns),
    [props.columns],
  );

  return (
    <div>
      <div className="hidden">
        <BetaSchemaForm layoutType="Embed" columns={flattenedColumns} />
      </div>
      <div>
        <TabsSchemaForm columns={props.columns} tabPlacement="top" />
      </div>
    </div>
  );
};

export default Component;
