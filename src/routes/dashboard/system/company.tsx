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
import { Api, type ApiResult } from '@/lib/api.ts';

export const Route = createFileRoute('/dashboard/system/company')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();

  const [company, setCompany] = useState<
    | {
        id: string;
        companyName: string;
        companyRegCode: string;
      }
    | true
  >();

  const actionRef = useRef<ActionType>(undefined);

  return (
    <div>
      <Modal
        open={!!company}
        title={company === true ? '添加企业' : '编辑企业'}
        onCancel={() => {
          setCompany(undefined);
        }}
        destroyOnHidden
        footer={null}
      >
        <ProForm
          initialValues={
            company && typeof company !== 'boolean' && (company as any)
          }
          onFinish={async (values) => {
            let resp: ApiResult;
            if (values.id) {
              resp = await Api.dashboard.system.company.update(values.id, {
                companyName: values.companyName,
                companyRegCode: values.companyRegCode,
              });
            } else {
              resp = await Api.dashboard.system.company.create([
                {
                  companyName: values.companyName,
                  companyRegCode: values.companyRegCode,
                },
              ]);
            }
            if (resp.code === 200) {
              message.success('保存成功');
              setCompany(undefined);
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
                dataIndex: 'companyName',
                fieldProps: {
                  disabled: (company as any)?.companyName === '系统管理员',
                },
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '名称不能为空',
                    },
                  ],
                },
              },
              {
                title: '密码',
                dataIndex: 'companyRegCode',
                tooltip: '密码为空则随机生成',
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
              setCompany(true);
            }}
          >
            添加
          </Button>,
          <Button key="import" icon={<Icon icon="bx:import" />} disabled>
            导入
          </Button>,
          <Button key="download_import_template" disabled>
            下载导入模板
          </Button>,
          <Button key="export" icon={<Icon icon="bx:export" />} disabled>
            导出
          </Button>,
        ]}
        columns={[
          {
            title: 'ID',
            dataIndex: 'id',
          },
          {
            title: '名称',
            dataIndex: 'companyName',
          },
          {
            title: '密码',
            dataIndex: 'companyRegCode',
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
                  setCompany(record);
                }}
              >
                编辑
              </Button>,
              <Popconfirm
                title={`确定要删除${record.companyName}吗？`}
                onConfirm={async () => {
                  await Api.dashboard.system.company.delete(record.id);
                  action?.reload();
                }}
                okButtonProps={{
                  danger: true,
                }}
                okText="确定"
                cancelText="取消"
                disabled={record.companyName === '系统管理员'}
              >
                <Button
                  disabled={record.companyName === '系统管理员'}
                  key="edit"
                  type="link"
                  size="small"
                  danger
                  onClick={() => {
                    action?.reload();
                  }}
                >
                  删除
                </Button>
              </Popconfirm>,
            ],
          },
        ]}
        request={Api.dashboard.system.company.list}
      />
    </div>
  );
}
