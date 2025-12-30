import {
  type ActionType,
  BetaSchemaForm,
  ProForm,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Modal, Popconfirm } from 'antd';
import { useRef, useState } from 'react';
import { templateIdentifierMap } from '@/components/ProExport.tsx';
import { Api, type ApiResult } from '@/lib/api.ts';
import type { TemplateInfoVO } from '@/lib/types.ts';

export const Route = createFileRoute('/dashboard/system/template')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();

  const [template, setTemplate] = useState<TemplateInfoVO | true>();

  const actionRef = useRef<ActionType>(undefined);

  return (
    <div>
      <Modal
        open={!!template}
        title={template === true ? '添加模板' : '编辑模板'}
        onCancel={() => {
          setTemplate(undefined);
        }}
        destroyOnHidden
        footer={null}
      >
        <ProForm
          initialValues={
            template && typeof template !== 'boolean' && (template as any)
          }
          onFinish={async (values) => {
            let resp: ApiResult;
            if (values.id) {
              resp = await Api.dashboard.system.template.update(values.id, {
                name: values.name,
                type: values.type,
                identifier: values.identifier,
                assets: values.assets,
                print: values.print,
              });
            } else {
              resp = await Api.dashboard.system.template.create([
                {
                  name: values.name,
                  type: values.type,
                  identifier: values.identifier,
                  assets: values.assets,
                  print: values.print,
                },
              ]);
            }
            if (resp.code === 200) {
              message.success('保存成功');
              setTemplate(undefined);
              actionRef.current?.reload();
            } else {
              message.error(`保存失败: ${resp.msg}`);
              console.error(resp);
            }
          }}
        >
          <BetaSchemaForm
            layoutType="Embed"
            columns={[
              {
                title: 'ID',
                dataIndex: 'id',
                fieldProps: {
                  disabled: true,
                },
              },
              {
                title: '名称',
                dataIndex: 'name',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      message: '请输入名称',
                      required: true,
                    },
                  ],
                },
              },
              {
                title: '标识符',
                dataIndex: 'identifier',
                valueEnum: templateIdentifierMap,
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      message: '请选择标识符',
                      required: true,
                    },
                  ],
                },
              },
              {
                title: '类型',
                dataIndex: 'type',
                valueType: 'select',
                valueEnum: {
                  'excel.row': 'Excel行',
                  'excel.file': 'Excel文件',
                  'word.file': 'Word文件',
                },
                initialValue: 'excel.row',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      message: '请选择类型',
                      required: true,
                    },
                  ],
                },
              },
              {
                title: '输出PDF',
                dataIndex: 'print',
                valueType: 'switch',
              },
              {
                valueType: 'dependency',
                fieldProps: {
                  name: ['type'],
                },
                columns: (record) => {
                  return [
                    {
                      title: '资源',
                      dataIndex: 'assets',
                      valueType: '#assets',
                      formItemProps: {
                        required: true,
                        rules: [
                          {
                            message: '请选择资源',
                            required: true,
                          },
                        ],
                      },
                      fieldProps: {
                        allowFileTypes: record?.['type']
                          ? record?.['type']?.startsWith('excel.')
                            ? [
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                              ]
                            : record?.['type']?.startsWith('word.')
                              ? [
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                ]
                              : []
                          : [],
                      },
                    },
                  ];
                },
              },
            ]}
          />
        </ProForm>
      </Modal>
      <ProTable
        actionRef={actionRef}
        toolBarRender={() => [
          <Button
            key="add"
            icon={<Icon icon="lucide:plus" />}
            onClick={() => {
              setTemplate(true);
            }}
          >
            添加
          </Button>,
        ]}
        columns={[
          {
            title: 'ID',
            dataIndex: 'id',
          },
          {
            title: '名称',
            dataIndex: 'name',
          },
          {
            title: '标识符',
            dataIndex: 'identifier',
            valueEnum: templateIdentifierMap,
          },
          {
            title: '类型',
            dataIndex: 'type',
            valueType: 'select',
            valueEnum: {
              'excel.row': 'Excel行',
              'excel.file': 'Excel文件',
              'word.file': 'Word文件',
            },
          },
          {
            title: '资源',
            dataIndex: 'assets',
            valueType: '#assets',
            search: false,
          },
          {
            title: '操作',
            valueType: 'option',
            render: (_, record, __, action) => [
              <Button
                key="edit"
                type="link"
                size="small"
                onClick={() => {
                  setTemplate(record as any);
                }}
              >
                编辑
              </Button>,
              <Popconfirm
                title={`确定要删除${record.name}吗？`}
                onConfirm={async () => {
                  await Api.dashboard.system.template.delete(record.id);
                  action?.reload();
                }}
                okButtonProps={{
                  danger: true,
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button key="delete" type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>,
            ],
          },
        ]}
        request={async (params) => {
          return await Api.dashboard.system.template.list(params);
        }}
      />
    </div>
  );
}
