import {
  type ActionType,
  BetaSchemaForm,
  ProForm,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Modal } from 'antd';
import { useRef, useState } from 'react';
import { Api, type ApiResult } from '@/lib/api.ts';
import type { UserInfoVO } from '@/lib/types.ts';
import ProImport from "@/components/ProImport.tsx";

export const Route = createFileRoute('/dashboard/system/user')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();

  const [user, setUser] = useState<UserInfoVO | true>();

  const actionRef = useRef<ActionType>(undefined);

  return (
    <div>
      <Modal
        open={!!user}
        title={user === true ? '添加用户' : '编辑用户'}
        onCancel={() => {
          setUser(undefined);
        }}
        destroyOnHidden
        footer={null}
      >
        <ProForm
          initialValues={user && typeof user !== 'boolean' && (user as any)}
          onFinish={async (values) => {
            let resp: ApiResult;
            if (values.id) {
              resp = await Api.dashboard.system.user.update(values.id, {
                name: values.name,
                phone: values.phone,
                idCard: values.idCard,
                isBanned: values.isBanned,
                companies: values.companies,
              });
            } else {
              resp = await Api.dashboard.system.user.create([
                {
                  name: values.name,
                  phone: values.phone,
                  idCard: values.idCard,
                  isBanned: values.isBanned,
                  companies: values.companies,
                },
              ]);
            }
            if (resp.code === 200) {
              message.success('保存成功');
              setUser(undefined);
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
                title: '姓名',
                dataIndex: 'name',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '姓名不能为空',
                    },
                  ],
                },
              },
              {
                title: '手机号',
                dataIndex: 'phone',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '手机号不能为空',
                    },
                  ],
                },
              },
              {
                title: '身份证',
                dataIndex: 'idCard',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '身份证不能为空',
                    },
                  ],
                },
              },
              {
                title: '封禁',
                dataIndex: 'isBanned',
                valueType: 'switch',
              },
              {
                title: '公司',
                dataIndex: 'companies',
                valueType: 'select',
                fieldProps: {
                  mode: 'multiple',
                },
                request: async () => {
                  const resp = await Api.common.getCompanies();
                  if (resp.code === 200) {
                    return (
                      resp.data?.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })) ?? []
                    );
                  }
                  return [];
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
              setUser(true);
            }}
          >
            添加
          </Button>,
          <ProImport
            title="用户"
            columns={[
              {
                title: '姓名',
                dataIndex: 'name',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '姓名不能为空',
                    },
                  ],
                },
              },
              {
                title: '手机号',
                dataIndex: 'phone',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '手机号不能为空',
                    },
                  ],
                },
              },
              {
                title: '身份证',
                dataIndex: 'idCard',
                formItemProps: {
                  required: true,
                  rules: [
                    {
                      required: true,
                      message: '身份证不能为空',
                    },
                  ],
                },
              },
              {
                title: '企业',
                dataIndex: 'company',
              },
            ]}
            onImport={async (list) => {
              let li = list.filter(i => i?.name && i?.phone && i?.idCard);

              if (li.length === 0) {
                return {
                  success: 0,
                  failure: list.length,
                };
              }

              let resp = await Api.dashboard.system.user.create(li.map(i => ({
                name: i.name,
                phone: i.phone,
                idCard: i.idCard,
                isBanned: false,
                companies: i?.['company'] ? [i['company']] : [],
              })));

              if (resp.code === 200 && resp.data) {
                return {
                  success: resp.data,
                  failure: list.length - resp.data,
                };
              } else {
                return {
                  success: 0,
                  failure: list.length,
                };
              }
            }}
            afterImport={() => {
              actionRef.current?.reload();
            }}
          />,
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
            title: '姓名',
            dataIndex: 'name',
          },
          {
            title: '手机号',
            dataIndex: 'phone',
          },
          {
            title: '身份证',
            dataIndex: 'idCard',
          },
          {
            title: '封禁',
            dataIndex: 'isBanned',
            valueEnum: {
              true: {
                text: '封禁',
                status: 'error',
              },
              false: {
                text: '正常',
                status: 'success',
              },
            },
          },
          {
            title: '操作',
            valueType: 'option',
            render: (_, record) => [
              <Button
                key="edit"
                type="link"
                size="small"
                onClick={() => {
                  setUser(record as any);
                }}
              >
                编辑
              </Button>,
            ],
          },
        ]}
        request={async (params) => {
          const resp = await Api.dashboard.system.user.list(params);
          return {
            ...resp,
            data:
              resp.data?.map((item) => ({
                ...item,
                companies: item.companies?.map((item) => item.id),
              })) ?? [],
          };
        }}
      />
    </div>
  );
}
