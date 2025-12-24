import {
  type ActionType,
  type Key,
  ProForm,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Modal, Popconfirm } from 'antd';
import { useRef, useState } from 'react';
import GroupedEmbedSchemaForm from '@/components/GroupedEmbedSchemaForm.tsx';
import ProExport from '@/components/ProExport.tsx';
import ProImport from '@/components/ProImport.tsx';
import {Api, type ApiResult, DataApi} from '@/lib/api.ts';
import type { ColumnsType, EmployeeDataVO } from '@/lib/types.ts';
import {columnIdFn} from "@/lib/functions.tsx";
import {companyInfoColumns} from "@/routes/dashboard/core/company/info.tsx";

export const Route = createFileRoute('/dashboard/core/employee/document')({
  component: RouteComponent,
});

const columnId = columnIdFn(['core', 'employee', 'document']);

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
            title: '证件照（大头照/小一寸/大一寸）',
            dataIndex: columnId('v1', 'basic', 'basic', 'photoFile'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
          {
            title: '手机号',
            dataIndex: columnId('v1', 'basic', 'basic', 'phone'),
            formItemProps: {
              required: true,
              rules: [
                {
                  required: true,
                  message: '手机号不能为空',
                },
              ],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '姓名',
            dataIndex: columnId('v1', 'basic', 'basic', 'name'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '性别',
            dataIndex: columnId('v1', 'basic', 'basic', 'gender'),
            valueType: 'select',
            valueEnum: {
              '0': '男',
              '1': '女',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '角色',
            dataIndex: columnId('v1', 'basic', 'basic', 'careerRole'),
            valueType: 'select',
            valueEnum: {
              safetyOfficer: '安全员',
              monitoringOfficer: '监控员',
              vehicleAdministrator: '车辆管理人员',
              driver: '驾驶员',
              principalInCharge: '主要负责人',
              vehicleStaffAdministrator: '车辆人员管理员',
              generalStaff: '普通员工',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '岗位',
            dataIndex: columnId('v1', 'basic', 'basic', 'departmentPosition'),
            valueType: 'department',
            fieldProps: {
              allowTypes: ['position'],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '家庭地址',
            dataIndex: columnId('v1', 'basic', 'basic', 'homeAddress'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '邮箱',
            dataIndex: columnId('v1', 'basic', 'basic', 'email'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '紧急联系人',
            dataIndex: columnId('v1', 'basic', 'basic', 'emergencyContact'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '紧急联系人电话',
            dataIndex: columnId('v1', 'basic', 'basic', 'emergencyContactPhone'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '政治面貌',
            dataIndex: columnId('v1', 'basic', 'basic', 'politicalStatus'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '婚否',
            dataIndex: columnId('v1', 'basic', 'basic', 'maritalStatus'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '学历',
            dataIndex: columnId('v1', 'basic', 'basic', 'educationLevel'),
            valueType: 'select',
            valueEnum: {
              primarySchool: '小学',
              juniorHighSchool: '初中',
              seniorHighSchool: '高中',
              juniorCollege: '专科',
              undergraduate: '本科',
              graduate: '研究生',
              secondaryVocationalSchool: '中专',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '毕业学校',
            dataIndex: columnId('v1', 'basic', 'basic', 'graduationSchool'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '专业',
            dataIndex: columnId('v1', 'basic', 'basic', 'major'),
            colProps: {
              span: 12,
            },
          },
          {
            title: '入职日期',
            dataIndex: columnId('v1', 'basic', 'basic', 'joinDate'),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '在职',
            dataIndex: columnId('v1', 'basic', 'basic', 'isEmployed'),
            valueType: 'select',
            valueEnum: {
              true: '是',
              false: '否',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '家庭成员',
            dataIndex: columnId('v1', 'basic', 'basic', 'familyMembers'),
            valueType: 'textarea',
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
          id: 'idCard',
          title: '身份证',
        },
        columns: [
          {
            title: '身份证',
            dataIndex: columnId('v1', 'basic', 'idCard', 'file'),
            valueType: '#assets',
            fieldProps: {
              multiple: true,
              maxCount: 2,
              allowFileTypes: ['image/*'],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '身份证号',
            dataIndex: columnId('v1', 'basic', 'idCard', 'idCard'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '有效期限',
            dataIndex: columnId('v1', 'basic', 'idCard', 'validDate'),
            valueType: 'validDateRange',
            colProps: {
              span: 12,
            },
          },
          {
            valueType: '#ai',
            fieldProps: {
              assets: columnId('v1', 'basic', 'idCard', 'file'),
              columns: [
                {
                  title: '姓名',
                  dataIndex: columnId('v1', 'basic', 'basic', 'name'),
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '身份证号',
                  dataIndex: columnId('v1', 'basic', 'idCard', 'idCard'),
                  valueType: 'text',
                },
                {
                  title: '性别',
                  dataIndex: columnId('v1', 'basic', 'basic', 'gender'),
                  valueType: 'select',
                  valueEnum: {
                    '0': '男',
                    '1': '女',
                  },
                },
                {
                  title: '有效期限',
                  dataIndex: columnId('v1', 'basic', 'idCard', 'validDate'),
                  valueType: 'validDateRange',
                },
              ],
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'laborContract',
          title: '劳动合同',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'laborContract', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'safetyCommitmentLetter',
          title: '安全承诺书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'safetyCommitmentLetter', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'responsibilityStatement',
          title: '责任书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'responsibilityStatement', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'physicalExaminationCertificate',
          title: '体检证明',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'physicalExaminationCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'trainingRecord',
          title: '培训教育记录',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'trainingRecord', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'otherDocuments',
          title: '其它文件',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'otherDocuments', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
    ],
  },
  {
    valueType: '$tabGroup',
    group: {
      id: 'safety',
      title: '安全管理人员档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'safetyManagementQualificationCertificate',
          title: '安全管理资格证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'safety', 'safetyManagementQualificationCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'registeredSafetyEngineerCertificate',
          title: '注册安全工程师证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'safety', 'registeredSafetyEngineerCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
    ],
  },
  {
    valueType: '$tabGroup',
    group: {
      id: 'driver',
      title: '驾驶人员档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'drivingLicense',
          title: '驾驶证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'driver', 'drivingLicense', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'professionalQualificationCertificate',
          title: '从业资格证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'driver', 'professionalQualificationCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'occupationalHazardsNotificationLetter',
          title: '职业危害告知书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'driver', 'occupationalHazardsNotificationLetter', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
    ],
  },
  {
    valueType: '$tabGroup',
    group: {
      id: 'monitoring',
      title: '监控人员档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'trainingCertificate',
          title: '培训证明',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'monitoring', 'trainingCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'assessmentRecord',
          title: '考核记录',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'monitoring', 'assessmentRecord', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
    ],
  },
  {
    valueType: '$tabGroup',
    group: {
      id: 'chief',
      title: '主要负责人员档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'safetyManagementQualificationCertificate',
          title: '安全管理资格证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'chief', 'safetyManagementQualificationCertificate', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'authorizationLetter',
          title: '委托书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'chief', 'authorizationLetter', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
        ],
      },
    ],
  },
];

function RouteComponent() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(undefined);
  const [employee, setEmployee] = useState<
    { id?: string; data?: Record<string, any> } | undefined
  >(undefined);
  const [selectedRows, setSelectedRows] = useState<Key[]>([]);

  return (
    <div>
      <Modal
        open={!!employee}
        title="编辑"
        destroyOnHidden
        footer={null}
        width="80vw"
        onCancel={() => {
          setEmployee(undefined);
        }}
      >
        <ProForm
          grid
          initialValues={employee?.data ?? {}}
          onFinish={async (values) => {
            const phone = values[columnId('v1', 'basic', 'basic', 'phone')];
            if (!phone) {
              return false;
            }

            delete values[columnId('v1', 'basic', 'basic', 'phone')];

            let resp: ApiResult;

            if (employee?.id) {
              resp = await Api.dashboard.core.employee.document.update(
                employee.id,
                phone,
                values,
              );
            } else {
              resp = await Api.dashboard.core.employee.document.create(
                phone,
                values,
              );
            }

            if (resp.code === 200) {
              message.success('保存成功');
              actionRef.current?.reload();
              // form.setFieldsValue({});
              setEmployee(undefined);
              return true;
            } else {
              message.error(`保存失败: ${resp.msg}`);
              console.error(resp);
              return false;
            }
          }}
        >
          <div className="pb-6 grow">
            <GroupedEmbedSchemaForm columns={columns} />
          </div>
        </ProForm>
      </Modal>
      <ProTable
        actionRef={actionRef}
        request={Api.dashboard.core.employee.document.list}
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
              setEmployee({});
            }}
          >
            添加
          </Button>,
          <ProImport
            title="人员档案"
            columns={columns}
            onImport={async (rows) => {
              const counts = {
                success: 0,
                failure: 0,
              };
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row?.[columnId('v1', 'basic', 'basic', 'phone')]) {
                  const phone = row[columnId('v1', 'basic', 'basic', 'phone')];

                  const data = row;
                  delete data[columnId('v1', 'basic', 'basic', 'phone')];

                  const resp =
                    await Api.dashboard.core.employee.document.create(
                      phone,
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
            identifier="core.employee.document"
            keys={(selectedRows?.length ?? 0) === 0 ? [] : selectedRows}
            fetchAllIds={async () => {
              const resp = await Api.dashboard.core.employee.document.getIds();
              return resp.data ?? [];
            }}
            fetchData={async (key) => {
              const resp = await Api.dashboard.core.employee.document.get(
                `${key}`,
              );
              let data: EmployeeDataVO | any | undefined = resp.data;

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
            title: '手机号',
            dataIndex: 'phone',
          },
          {
            title: '姓名',
            dataIndex: 'name',
          },
          {
            title: '身份证',
            dataIndex: 'idCard',
          },
          {
            title: '性别',
            dataIndex: 'gender',
            valueType: 'select',
            valueEnum: {
              '0': '男',
              '1': '女',
            },
          },
          {
            title: '角色',
            dataIndex: 'careerRole',
            valueType: 'select',
            valueEnum: {
              safetyOfficer: '安全员',
              monitoringOfficer: '监控员',
              vehicleAdministrator: '车辆管理人员',
              driver: '驾驶员',
              principalInCharge: '主要负责人',
              vehicleStaffAdministrator: '车辆人员管理员',
              generalStaff: '普通员工',
            },
          },
          {
            title: '岗位',
            dataIndex: 'departmentPosition',
            valueType: 'department',
            fieldProps: {
              allowTypes: ['position'],
            },
          },
          {
            title: '在职',
            dataIndex: 'isEmployed',
            valueType: 'select',
            valueEnum: {
              false: '否',
              true: '是',
            },
          },
          {
            title: '账号关联',
            dataIndex: 'isRegistered',
            valueType: 'select',
            valueEnum: {
              false: '否',
              true: '是',
            },
            render: (dom, record) => (
              <>
                {dom}

                <Button
                  type="link"
                  size="small"
                  onClick={async () => {
                    const resp =
                      await Api.dashboard.core.employee.document.refreshBinding(
                        record.id,
                      );
                    if (resp.code === 200) {
                      message.success(`刷新成功`);
                      actionRef.current?.reload();
                    } else {
                      message.error(`刷新成功: ${resp.msg}`);
                      console.error(resp);
                    }
                  }}
                >
                  刷新绑定
                </Button>
              </>
            ),
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

                    const resp = await Api.dashboard.core.employee.document.get(
                      record.id,
                    );

                    loading();

                    if (resp.code === 200 && resp.data) {
                      setEmployee({
                        id: record.id,
                        data: {
                          ...resp.data.data,
                          [columnId('v1', 'basic', 'basic', 'phone')]: resp.data.phone,
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
                  title={`确定删除${record.phone}？`}
                  onConfirm={async () => {
                    const resp =
                      await Api.dashboard.core.employee.document.delete(
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
