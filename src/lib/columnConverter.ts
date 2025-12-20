import * as _ from 'lodash';
import { Api } from '@/lib/api.ts';
import type { ColumnsType, DepartmentInfoVO } from '@/lib/types.ts';
import { day } from '@/lib/utils.ts';

function flattenColumns(
  columns: Array<ColumnsType>,
  data: any,
): Array<ColumnsType> {
  const result: Array<ColumnsType> = [];

  columns.forEach((column) => {
    if (column.columns) {
      result.push(
        ...flattenColumns(
          typeof column.columns === 'function'
            ? column.columns(data)
            : column.columns,
          data,
        ),
      );
    } else {
      result.push(column);
    }
  });

  return result;
}

export function genColumnsKVMap(columns: Array<ColumnsType>) {
  const flattedColumns = flattenColumns(columns, {});

  return flattedColumns
    .filter(
      (column) =>
        !!column.dataIndex && !`${column.valueType}`.startsWith?.('#'),
    )
    .map((column) => {
      const dataIndex = column.dataIndex as _.PropertyPath;

      let id = '';
      if (Array.isArray(dataIndex)) {
        id = dataIndex.join('.');
      } else {
        id = dataIndex as string;
      }

      return {
        id: id,
        name: column.title,
      };
    });
}

export async function column2json(
  columns: Array<ColumnsType>,
  data: Record<string, any>,
) {
  const flattedColumns = flattenColumns(columns, data);

  const result: Record<string, any> = {};

  let departments: DepartmentInfoVO[] = [];
  if (columns.filter((i) => i.valueType === 'department').length > 0) {
    const resp = await Api.common.getDepartments();
    if (resp.code === 200 && resp.data) {
      departments = resp.data;
    }
  }

  flattedColumns
    .filter((column) => !!column.dataIndex)
    .forEach((column) => {
      const dataIndex = column.dataIndex as _.PropertyPath;

      let value = _.get(data, dataIndex, undefined);

      if (value === null || value === undefined) {
        return;
      }

      switch (column.valueType) {
        case 'validDateRange': {
          const parts = Array.isArray(value) ? value : [];

          if (parts.length === 0) {
            value = '';
          } else if (parts.length === 1) {
            const d1s = `${parts[0]}`.trim();
            const d1 = day(d1s);

            value = d1.isValid() ? d1.format('YYYY-MM-DD') : '';
          } else if (parts.length === 2) {
            let d1s = `${parts[0]}`.trim();
            const d1 = day(d1s);
            d1s = d1.isValid() ? d1.format('YYYY-MM-DD') : '';

            let d2s = `${parts[1]}`.trim();
            if (d2s === '#LONG' || d2s === '长期') {
              value = `${d1s} ~ 长期`;
            } else {
              const d2 = day(d2s);
              if (d2.isValid()) {
                d2s = d2.format('YYYY-MM-DD');
                value = `${d1s} ~ ${d2s}`;
              } else {
                value = d1s;
              }
            }
          } else {
            value = '';
          }

          break;
        }
        case 'date': {
          const t = day(`${value}`);
          if (t.isValid()) {
            value = t.format('YYYY-MM-DD');
          } else {
            value = undefined;
          }
          break;
        }
        case 'dateTime': {
          const t = day(`${value}`);
          if (t.isValid()) {
            value = t.format('YYYY-MM-DD HH:mm:ss');
          } else {
            value = undefined;
          }
          break;
        }
        case 'select': {
          const valueEnum =
            typeof column.valueEnum === 'function'
              ? column.valueEnum(data)
              : column.valueEnum;

          if (valueEnum) {
            // @ts-expect-error
            const enumV = valueEnum?.[`${value}`];
            value = enumV?.['text'] ?? enumV;
          } else {
            value = undefined;
          }
          break;
        }
        case 'department': {
          let v;
          for (const department of departments) {
            if (department.id === `${value}`) {
              v = department.name;
              break;
            }

            for (const position of department.positions ?? []) {
              if (position.id === `${value}`) {
                v = `${department.name} - ${position.name}`;
                break;
              }
            }
            if (v) {
              break;
            }
          }

          value = v;

          break;
        }
        default: {
          value = `${value}`;
        }
      }

      _.set(result, dataIndex, value);
    });

  return result;
}

export async function json2column(
  columns: Array<ColumnsType>,
  data: Record<string, any>,
) {
  const flattedColumns = flattenColumns(columns, data);

  const result: Record<string, any> = {};

  let departments: DepartmentInfoVO[] = [];
  if (columns.filter((i) => i.valueType === 'department').length > 0) {
    const resp = await Api.common.getDepartments();
    if (resp.code === 200 && resp.data) {
      departments = resp.data;
    }
  }

  flattedColumns
    .filter((column) => !!column.dataIndex)
    .forEach((column) => {
      const dataIndex = column.dataIndex as _.PropertyPath;

      let value = _.get(data, dataIndex, undefined);

      if (value === null || value === undefined) {
        return;
      }

      switch (column.valueType) {
        case 'validDateRange': {
          const parts = `${value}`.split('~').map((i) => i.trim());
          const d: string[] = [];

          if (parts.length >= 1) {
            try {
              const t = day(parts[0]);
              if (t.isValid()) {
                d.push(t.format('YYYY-MM-DD'));
              }
            } catch (e) {}
          }

          if (parts.length >= 2) {
            if (parts[1] === '#LONG' || parts[1] === '长期') {
              d.push('#LONG');
            } else {
              try {
                const t = day(parts[1]);
                if (t.isValid()) {
                  d.push(t.format('YYYY-MM-DD'));
                }
              } catch (e) {}
            }
          }

          value = d;

          break;
        }
        case 'date': {
          try {
            const t = day(value);
            if (t.isValid()) {
              value = t.format('YYYY-MM-DD');
            }
          } catch (e) {}

          break;
        }
        case 'dateTime': {
          try {
            const t = day(value);
            if (t.isValid()) {
              value = t.format('YYYY-MM-DD HH:mm:ss');
            }
          } catch (e) {}

          break;
        }
        case 'select': {
          const valueEnum =
            typeof column.valueEnum === 'function'
              ? column.valueEnum(data)
              : column.valueEnum;
          if (valueEnum) {
            let v;
            for (const entry of Object.entries(valueEnum)) {
              const enumK = entry[0];
              const enumV = entry[1];
              if (typeof enumV === 'string') {
                if (enumV === value) {
                  v = enumK;
                }
              } else if (enumV?.text === value) {
                v = enumK;
              }
            }
            value = v;
          }

          break;
        }
        case 'department': {
          const parts = `${value}`.split('-').map((i) => i.trim());

          let department: DepartmentInfoVO | undefined;
          let position:
            | (DepartmentInfoVO['positions'] extends Array<infer T> | undefined
                ? T
                : undefined)
            | undefined;

          if (parts.length >= 1) {
            department = departments.filter((i) => i.name === parts[0])?.[0];
          } else {
            return result;
          }

          if (parts.length >= 2 && department) {
            position = department.positions?.filter(
              (i) => i.name === parts[1],
            )?.[0];
            value = `${position?.id}`;
          } else {
            value = `${department?.id}`;
          }

          break;
        }
        default: {
          value = `${value}`;
          break;
        }
      }

      _.set(result, dataIndex, value);
    });

  return result;
}
