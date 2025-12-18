import {App, Button, Upload} from "antd";
import {Icon} from "@iconify/react";
import type {ColumnsType} from "@/lib/types.ts";
import {useCallback} from "react";
import * as XLSX from 'xlsx';
import {day} from "@/lib/utils.ts";
import * as _ from 'lodash';

const columns2headInfo = (columns: ColumnsType[]) => {
  let headers: Array<Array<string | undefined>> = [[]];
  let mappings: Array<ColumnsType> = [];

  columns.forEach((column) => {
    switch (column.valueType) {
      case '$tabGroup': {
        let label = column.group?.title ?? '-';
        let inner = columns2headInfo(column.columns ?? []);
        let children = inner.headers;

        let w = Math.max(1, inner.headers[0].length);

        if (children[0].length === 0) {
          return;
        }

        children.forEach((child, i) => {
          if (headers.length <= i + 1) {
            let base: Array<string | undefined> = '1'.repeat(headers[0].length).split('').map(() => undefined);
            base = base.concat(child);
            headers = headers.concat([base]);
          } else {
            headers[i + 1] = headers[i + 1].concat(child);
          }
        });

        headers[0].push(label);
        headers[0] = headers[0].concat('1'.repeat(w - 1).split('').map(() => undefined));

        mappings = mappings.concat(inner.mappings);

        break;
      }
      case '#ai': {
        break;
      }
      case '#assets': {
        break;
      }
      default: {
        mappings.push(column);
        headers[0].push(`${column.title}`);

        break;
      }
    }
  });

  return {
    headers,
    mappings,
  };
};

function mergeCells(rows: Array<Array<string | null | undefined>>): Array<{ s: { c: number; r: number; }, e: { c: number; r: number; } }> {
  if (rows.length === 0 || rows[0].length === 0) {
    return [];
  }

  const totalRows = rows.length;
  const totalCols = rows[0].length;
  // 创建 visited 矩阵，标记已处理的单元格
  const visited: boolean[][] = Array.from({ length: totalRows }, () => new Array(totalCols).fill(false));
  const mergeAreas: Array<{ s: { c: number; r: number; }, e: { c: number; r: number; } }> = [];

  for (let i = 0; i < totalRows; i++) {
    for (let j = 0; j < totalCols; j++) {
      // 跳过已访问或空单元格
      if (visited[i][j] || rows[i][j] == null) {
        continue;
      }

      // 操作1: 尝试向右下合并（至少2x2的矩形）
      if (i + 1 < totalRows && j + 1 < totalCols) {
        if (!visited[i][j + 1] && !visited[i + 1][j] && !visited[i + 1][j + 1]) {
          if (rows[i][j + 1] == null && rows[i + 1][j] == null && rows[i + 1][j + 1] == null) {
            // 合并2x2区域
            mergeAreas.push({ s: { c: j, r: i }, e: { c: j + 1, r: i + 1 } });
            // 标记整个2x2区域为已访问
            visited[i][j] = true;
            visited[i][j + 1] = true;
            visited[i + 1][j] = true;
            visited[i + 1][j + 1] = true;
            continue; // 结束当前格处理
          }
        }
      }

      // 操作2: 尝试向右合并（同一行）
      let rightCount = 0;
      let col = j + 1;
      while (col < totalCols && !visited[i][col] && rows[i][col] == null) {
        rightCount++;
        col++;
      }
      if (rightCount >= 1) { // 至少合并2列（当前列+至少1个空列）
        mergeAreas.push({ s: { c: j, r: i }, e: { c: j + rightCount, r: i } });
        // 标记合并的单元格
        for (let c = j; c <= j + rightCount; c++) {
          visited[i][c] = true;
        }
        continue; // 结束当前格处理
      }

      // 操作3: 尝试向下合并（同一列）
      let downCount = 0;
      let row = i + 1;
      while (row < totalRows && !visited[row][j] && rows[row][j] == null) {
        downCount++;
        row++;
      }
      if (downCount >= 1) { // 至少合并2行（当前行+至少1个空行）
        mergeAreas.push({ s: { c: j, r: i }, e: { c: j, r: i + downCount } });
        // 标记合并的单元格
        for (let r = i; r <= i + downCount; r++) {
          visited[r][j] = true;
        }
        continue; // 结束当前格处理
      }

      // 无合并，仅标记当前非空单元格
      visited[i][j] = true;
    }
  }

  return mergeAreas;
}

const columns2sheet = (ws: XLSX.WorkSheet, columns: ColumnsType[]) => {
  let result = columns2headInfo(columns);

  XLSX.utils.sheet_add_aoa(ws, result.headers);

  ws['!merges'] ??= [];

  ws['!merges'] = ws['!merges'].concat(mergeCells(result.headers));

  XLSX.utils.decode_range('');
};

const formatData = (columns: ColumnsType[], data: Record<string, any>) => {
  return _.reduce(data, (result, value, key) => {
    let column = columns.filter(c => c.dataIndex === key)?.[0];

    if (!column) {
      return result;
    }

    switch (column.valueType) {
      case 'validDateRange': {
        let parts = `${value}`.split('~').map(i => i.trim());
        let d: string[] = [];

        if (parts.length >= 1) {
          try {
            let t = day(parts[0]);
            if (t.isValid()) {
              d.push(t.format('YYYY-MM-DD'));
            }
          } catch (e) {
          }
        }

        if (parts.length >= 2) {
          if (parts[1] === '#LONG' || parts[1] === '长期') {
            d.push('#LONG');
          } else {
            try {
              let t = day(parts[1]);
              if (t.isValid()) {
                d.push(t.format('YYYY-MM-DD'));
              }
            } catch (e) {
            }
          }
        }

        return _.assign(result, {
          [key]: d,
        });
      }
      case 'select': {
        let valueEnum = typeof column.valueEnum === 'function' ? column.valueEnum(data) : column.valueEnum;
        if (valueEnum) {
          for (let entry of Object.entries(valueEnum)) {
            let enumK = entry[0];
            let enumV = entry[1];
            if (typeof enumV === 'string') {
              if (enumV === value) {
                return _.assign(result, {
                  [key]: enumK,
                });
              }
            } else if (enumV?.text === value) {
              return _.assign(result, {
                [key]: enumK,
              });
            }
          }
        }

        return result;
      }
      default: {
        return _.assign(result, {
          [key]: `${value}`,
        });
      }
    }
  }, {});
};

function Component<T = Record<string, any>>(props: {
  title?: string;
  columns: ColumnsType[];
  onImport: (data: Array<T>) => Promise<{ success: number; failure: number; }>;
  afterImport?: () => void;
}) {
  const { message, modal } = App.useApp();

  const downloadImportTemplate = useCallback(() => {
    let book = XLSX.utils.book_new();
    let sheet = XLSX.utils.sheet_new();

    columns2sheet(sheet, props.columns);

    XLSX.utils.book_append_sheet(book, sheet, 'import');

    let now = day().format('YYYYMMDDHHmmss');

    XLSX.writeFile(book, `${props.title ? `${props.title} - ` : ''}导入模板${now}.xlsx`);
  }, [props.title, props.columns]);

  const importTemplate = useCallback(async (file: File) => {
    let loading = message.loading('导入中', 0);

    try {
      let buffer = await file.arrayBuffer();
      let book = XLSX.read(buffer);

      if (book.SheetNames.length === 0) {
        loading();

        message.error('没有找到Sheet');
        return;
      }

      let sheet = book.Sheets[book.SheetNames[0]];

      let head = columns2headInfo(props.columns);

      let start = head.headers.length;

      let json = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
      });

      if (json.length < head.headers.length) {
        loading();

        message.error('导入失败: 数据为空');
        return;
      }

      let dataList: Array<Record<string, any>> = [];

      for (let i = start; i < json.length; i++) {
        let row = json[i];
        let data: Record<string, any> = {};
        for (let j = 0; j < row.length; j++) {
          data[`${head.mappings[j].dataIndex ?? '?'}`] = row[j];
        }
        dataList.push(formatData(head.mappings, data));
      }

      let counts = await props.onImport(dataList as any);

      modal.info({
        content: `成功导入 ${counts.success} 条数据, 失败 ${counts.failure} 条数据`,
        onOk: () => {
          props.afterImport?.();
        },
        onCancel: () => {
          props.afterImport?.();
        },
        maskClosable: true,
      });
    } catch (e) {
      loading();

      console.log(e);
      message.error('导入失败');
      return;
    }

    loading();
  }, [props.columns]);

  return [
    <Upload
      showUploadList={false}
      accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      beforeUpload={async (file) => {
        await importTemplate(file);
        return false;
      }}
    >
      <Button
        key="import"
        icon={<Icon icon="bx:import" />}
      >
        导入
      </Button>
    </Upload>,
    <Button
      key="download_import_template"
      onClick={()=>{
        downloadImportTemplate();
      }}
    >
      下载导入模板
    </Button>,
  ];
}

export default Component;
