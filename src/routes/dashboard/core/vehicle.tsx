import {
  type ActionType,
  type Key,
  ProForm, ProFormGroup,
  ProTable,
} from '@ant-design/pro-components';
import {Icon} from '@iconify/react';
import {createFileRoute} from '@tanstack/react-router';
import {App, Button, Modal, Popconfirm} from 'antd';
import {useRef, useState} from 'react';
import GroupedEmbedSchemaForm from '@/components/GroupedEmbedSchemaForm.tsx';
import ProExport from '@/components/ProExport.tsx';
import ProImport from '@/components/ProImport.tsx';
import {Api, type ApiResult, DataApi} from '@/lib/api.ts';
import type {ColumnsType, VehicleDataVO} from '@/lib/types.ts';
import {columnIdFn} from "@/lib/functions.tsx";
import {companyInfoColumns} from "@/routes/dashboard/core/company/info.tsx";

export const Route = createFileRoute('/dashboard/core/vehicle')({
  component: RouteComponent,
});

const columnId = columnIdFn(['core', 'vehicle']);

const columns: ColumnsType[] = [
  {
    valueType: '$tabGroup',
    group: {
      id: 'basic',
      title: '基础档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'basic',
          title: '基础信息',
        },
        columns: [
          {
            title: '车牌号',
            dataIndex: columnId('v1', 'basic', 'basic', 'plateNumber'),
            valueType: 'text',
            formItemProps: {
              rules: [
                { required: true, message: '请输入车牌号' },
              ],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '驾驶员',
            dataIndex: columnId('v1', 'basic', 'basic', 'driver'),
            valueType: 'employee',
            colProps: {
              span: 12,
            },
          },
          {
            title: "状态",
            dataIndex: columnId('v1', 'basic', 'basic', "status"),
            valueType: 'select',
            valueEnum: {
              "inUse": "使用中",
              "transferred": "已过户",
              "scrapped": "已报废",
              "suspended": "已停运"
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '备注',
            dataIndex: columnId('v1', 'basic', 'basic', 'remark'),
            valueType: 'textarea',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'vehicleRegistrationCertificate',
          title: '车辆登记证书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '机动车所有人',
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', 'owner'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: "车辆类型",
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', "vehicleType"),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车辆识别代号',
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', 'vehicleCode'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '发动机号',
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', 'engineNumber'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '机动车登记编号',
            dataIndex: columnId('v1', 'basic', 'vehicleRegistrationCertificate', 'certificateNumber'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'vehicleLicense',
          title: '车辆行驶证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '行驶证号',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'licenseNumber'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
        ]
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'roadTransportPermit',
          title: '道路运输证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'roadTransportPermit', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '道路运输证号',
            dataIndex: columnId('v1', 'basic', 'roadTransportPermit', 'roadTransportPermitNumber'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
        ]
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'insurance',
          title: '保险信息',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'insurance', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '保险信息',
            dataIndex: columnId('v1', 'basic', 'insurance', 'list'),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '类型',
                dataIndex: 'type',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '保险公司',
                dataIndex: 'company',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '有效期',
                dataIndex: 'validDate',
                valueType: 'validDateRange',
                fieldProps: {
                  noLong: true,
                },
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '保额',
                dataIndex: 'amount',
                valueType: 'digit',
                fieldProps: {
                  prefix: '¥',
                  decimalSeparator: ',',
                },
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ]
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'other',
          title: '其它文件',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'other', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              allowFileTypes: ['image/*'],
            },
          },
        ]
      }
    ],
  },
];

function RouteComponent() {
  const {message} = App.useApp();
  const actionRef = useRef<ActionType>(undefined);
  const [vehicle, setVehicle] = useState<
    { id?: string; data?: Record<string, any> } | undefined
  >(undefined);
  const [selectedRows, setSelectedRows] = useState<Key[]>([]);

  return (
    <div>
      <Modal
        open={!!vehicle}
        title="编辑"
        destroyOnHidden
        footer={null}
        width="80vw"
        onCancel={() => {
          setVehicle(undefined);
        }}
      >
        <ProForm
          grid
          initialValues={vehicle?.data ?? {}}
          onFinish={async (values) => {
            console.log(values)
            const plateNumber = values[columnId('v1', 'basic', 'basic', 'plateNumber')];
            if (!plateNumber) {
              return false;
            }

            delete values[columnId('v1', 'basic', 'basic', 'plateNumber')];

            let resp: ApiResult;

            if (vehicle?.id) {
              resp = await Api.dashboard.core.vehicle.update(
                vehicle.id,
                plateNumber,
                values,
              );
            } else {
              resp = await Api.dashboard.core.vehicle.create(
                plateNumber,
                values,
              );
            }

            if (resp.code === 200) {
              message.success('保存成功');
              actionRef.current?.reload();
              // form.setFieldsValue({});
              setVehicle(undefined);
              return true;
            } else {
              message.error(`保存失败: ${resp.msg}`);
              console.error(resp);
              return false;
            }
          }}
        >
          <div className="pb-6 grow">
            <GroupedEmbedSchemaForm columns={columns}/>
          </div>
        </ProForm>
      </Modal>
      <ProTable
        actionRef={actionRef}
        request={Api.dashboard.core.vehicle.list}
        rowSelection={{
          type: 'checkbox',
          onChange: (selectedRowKeys) => {
            setSelectedRows(selectedRowKeys);
          },
          selectedRowKeys: selectedRows,
        }}
        rowKey="id"
        toolBarRender={() => [
          <Button
            key="add"
            icon={<Icon icon="lucide:plus" />}
            onClick={() => {
              setVehicle({});
            }}
          >
            添加
          </Button>,
          <ProImport
            title="车辆档案"
            columns={columns}
            onImport={async (rows) => {
              const counts = {
                success: 0,
                failure: 0,
              };
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row?.[columnId('v1', 'basic', 'basic', 'plateNumber')]) {
                  const plateNumber = row[columnId('v1', 'basic', 'basic', 'plateNumber')];

                  const data = row;
                  delete data[columnId('v1', 'basic', 'basic', 'plateNumber')];

                  const resp =
                    await Api.dashboard.core.vehicle.create(
                      plateNumber,
                      data,
                    );

                  if (resp.code === 200) {
                    counts.success++;
                  } else {
                    counts.failure++;
                  }
                }
              }
              return counts;
            }}
            afterImport={() => {
              actionRef.current?.reload();
            }}
          />,
          <ProExport
            key="export"
            columns={[
              ...companyInfoColumns,
              ...columns,
            ]}
            identifier="core.vehicle"
            keys={(selectedRows?.length ?? 0) === 0 ? [] : selectedRows}
            fetchAllIds={async () => {
              const resp = await Api.dashboard.core.vehicle.getIds();
              return resp.data ?? [];
            }}
            fetchData={async (key) => {
              const resp = await Api.dashboard.core.vehicle.get(
                `${key}`,
              );
              let data: VehicleDataVO | any | undefined = resp.data;

              if (data) {
                data = {
                  ...data,
                  ...data.data,
                };
                delete data.data;
              }

              return data;
            }}
            extraData={async () => {
              let companyInfo = await DataApi.dashboard.core.company.info();

              return {
                ...companyInfo,
              };
            }}
          />,
        ]}
        columns={[
          {
            title: 'ID',
            dataIndex: 'id',
            hidden: true,
            hideInSearch: true,
            search: false,
          },
          {
            title: '车牌号',
            dataIndex: 'plateNumber',
            valueType: 'text',
            formItemProps: {
              rules: [
                { required: true, message: '请输入车牌号' },
              ],
            },
          },
          {
            title: '驾驶员',
            dataIndex: 'driver',
            valueType: 'employee',
          },
          {
            title: '机动车所有人',
            dataIndex: 'owner',
            valueType: 'text',
          },
          {
            title: "车辆类型",
            dataIndex: "vehicleType",
            valueType: 'text',
          },
          {
            title: "状态",
            dataIndex: "status",
            valueType: 'select',
            valueEnum: {
              "inUse": "使用中",
              "transferred": "已过户",
              "scrapped": "已报废",
              "suspended": "已停运"
            },
          },
          {
            title: '操作',
            valueType: 'option',
            render: (_, record) => (
              <>
                <Button
                  type="link"
                  size="small"
                  onClick={async () => {
                    const loading = message.loading(`加载中...`, 0);

                    const resp = await Api.dashboard.core.vehicle.get(
                      record.id,
                    );

                    loading();

                    if (resp.code === 200 && resp.data) {
                      setVehicle({
                        id: record.id,
                        data: {
                          ...resp.data.data,
                          [columnId('v1', 'basic', 'basic', 'plateNumber')]: resp.data.plateNumber,
                        },
                      });
                    } else {
                      message.error(`加载失败: ${resp.msg}`);
                      console.error(resp);
                    }
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title={`确定删除${record.plateNumber}？`}
                  onConfirm={async () => {
                    const resp =
                      await Api.dashboard.core.vehicle.delete(
                        record.id,
                      );
                    if (resp.code === 200) {
                      message.success('删除成功');
                      actionRef.current?.reload();
                    } else {
                      message.error(`删除失败: ${resp.msg}`);
                      console.error(resp);
                    }
                  }}
                  okText="删除"
                  okButtonProps={{
                    danger: true,
                  }}
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
