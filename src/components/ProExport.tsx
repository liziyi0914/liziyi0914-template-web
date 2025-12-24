import type { Key } from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { App, Button, Modal } from 'antd';
import type React from 'react';
import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { Api } from '@/lib/api.ts';
import { column2json, genColumnsKVMap } from '@/lib/columnConverter.ts';
import { runTemplate } from '@/lib/functions.tsx';
import type { ColumnsType, TemplateInfoVO } from '@/lib/types.ts';
import { day } from '@/lib/utils.ts';

export const templateIdentifierMap = {
  'core.employee.document': '人员档案',
  'core.vehicle': '车辆档案',
};
export type TemplateIdentifier = keyof typeof templateIdentifierMap;

const Component: React.FC<{
  identifier: TemplateIdentifier;
  keys: Array<Key>;
  fetchAllIds: () => Promise<Array<Key>>;
  fetchData: (key: Key) => Promise<any | undefined | null>;
  columns: Array<ColumnsType>;
  extraData: () => Promise<any | undefined | null>;
}> = (props) => {
  const { message, modal } = App.useApp();
  const [templates, setTemplates] = useState<Array<TemplateInfoVO>>();

  const run = useCallback(
    async (templateId: string) => {
      const m = modal.info({
        title: '导出',
        content: <div>获取数据中……</div>,
        footer: false,
        closable: false,
        maskClosable: false,
      });

      const extra = await props.extraData();

      try {
        const rows = [];
        let keys = props.keys;

        if (keys.length === 0) {
          keys = await props.fetchAllIds();
        }

        for (let i = 0; i < keys.length; i++) {
          m.update({
            content: (
              <div>
                获取数据中……（{i}/{keys.length}）
              </div>
            ),
          });

          let row = await props.fetchData(keys[i]);
          if (row) {
            row = {
              ...extra,
              ...row,
            };
            rows.push(await column2json(props.columns, row));
          }
        }

        m.update({
          content: <div>正在处理数据中……</div>,
        });

        // console.log(rows)

        await runTemplate(templateId, rows);

        m.destroy();

        message.success('导出成功');
      } catch (e) {
        m.destroy();
        console.error(e);
        message.error('导出失败');
      }
    },
    [
      props.identifier,
      props.keys,
      props.fetchData,
      props.fetchAllIds,
      props.columns,
    ],
  );

  return (
    <>
      <Modal
        title="选择模板"
        open={!!templates}
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setTemplates(undefined);
        }}
      >
        <div className="flex flex-col gap-y-3">
          {templates?.map((template) => (
            <Button
              key={template.id}
              onClick={async () => {
                setTemplates(undefined);
                await run(template.id);
              }}
            >
              {template.name}
            </Button>
          ))}
        </div>
      </Modal>
      <Button
        icon={<Icon icon="bx:export" />}
        onClick={async (e) => {
          if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
            const book = XLSX.utils.book_new();
            const sheet = XLSX.utils.sheet_new();

            XLSX.utils.sheet_add_json(sheet, genColumnsKVMap(props.columns));

            XLSX.utils.book_append_sheet(book, sheet, 'info');

            const now = day().format('YYYYMMDDHHmmss');

            XLSX.writeFile(book, `导出参数${now}.xlsx`);

            return;
          }

          const loading = message.loading('获取模板列表...', 0);

          const resp = await Api.common.getTemplates(props.identifier);

          loading();

          if (resp.code === 200 && resp.data) {
            if (resp.data.length === 0) {
              message.error('没有可用的模板');
            } else if (resp.data.length === 1) {
              await run(resp.data[0].id);
            } else {
              setTemplates(resp.data);
            }
          } else {
            console.error(resp);
            message.error('获取模板列表失败');
          }
        }}
      >
        导出{props.keys.length > 0 ? `${props.keys.length}项` : ''}
      </Button>
    </>
  );
};

export default Component;
