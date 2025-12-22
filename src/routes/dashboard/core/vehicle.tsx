import {
  type ActionType,
  type Key,
  ProForm,
  ProTable,
} from '@ant-design/pro-components';
import {Icon} from '@iconify/react';
import {createFileRoute} from '@tanstack/react-router';
import {App, Button, Modal, Popconfirm} from 'antd';
import {useRef, useState} from 'react';
import GroupedEmbedSchemaForm from '@/components/GroupedEmbedSchemaForm.tsx';
import ProExport from '@/components/ProExport.tsx';
import ProImport from '@/components/ProImport.tsx';
import {Api, type ApiResult} from '@/lib/api.ts';
import type {ColumnsType, EmployeeDataVO} from '@/lib/types.ts';

export const Route = createFileRoute('/dashboard/core/vehicle')({
  component: RouteComponent,
});

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
            dataIndex: 'photoFile',
            valueType: '#assets',
            colProps: {
              span: 12,
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
            colProps: {
              span: 12,
            },
          },
          {
            title: '姓名',
            dataIndex: 'name',
            colProps: {
              span: 12,
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
            colProps: {
              span: 12,
            },
          },
          {
            title: '岗位',
            dataIndex: 'departmentPosition',
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
            dataIndex: 'homeAddress',
            colProps: {
              span: 12,
            },
          },
          {
            title: '邮箱',
            dataIndex: 'email',
            colProps: {
              span: 12,
            },
          },
          {
            title: '紧急联系人',
            dataIndex: 'emergencyContact',
            colProps: {
              span: 12,
            },
          },
          {
            title: '紧急联系人电话',
            dataIndex: 'emergencyContactPhone',
            colProps: {
              span: 12,
            },
          },
          {
            title: '政治面貌',
            dataIndex: 'politicalStatus',
            colProps: {
              span: 12,
            },
          },
          {
            title: '婚否',
            dataIndex: 'maritalStatus',
            colProps: {
              span: 12,
            },
          },
          {
            title: '学历',
            dataIndex: 'educationLevel',
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
            dataIndex: 'graduationSchool',
            colProps: {
              span: 12,
            },
          },
          {
            title: '专业',
            dataIndex: 'major',
            colProps: {
              span: 12,
            },
          },
          {
            title: '入职日期',
            dataIndex: 'joinDate',
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '在职',
            dataIndex: 'isEmployed',
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
            dataIndex: 'familyMembers',
            valueType: 'textarea',
            colProps: {
              span: 12,
            },
          },
          {
            title: '备注',
            dataIndex: 'remark',
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
            dataIndex: 'idCardFile',
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
            dataIndex: 'idCard',
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '性别',
            dataIndex: 'gender',
            valueType: 'select',
            valueEnum: {
              0: '男',
              1: '女',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '有效期限',
            dataIndex: 'idCardValidDate',
            valueType: 'validDateRange',
            colProps: {
              span: 12,
            },
          },
          {
            valueType: '#ai',
            fieldProps: {
              assets: 'idCardFile',
              columns: [
                {
                  title: '姓名',
                  dataIndex: 'name',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '身份证号',
                  dataIndex: 'idCard',
                  valueType: 'text',
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
                  title: '有效期限',
                  dataIndex: 'idCardValidDate',
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
            dataIndex: 'laborContractFile',
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
            dataIndex: 'safetyCommitmentLetterFile',
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
            dataIndex: 'responsibilityStatementFile',
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
            dataIndex: 'physicalExaminationCertificateFile',
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
            dataIndex: 'trainingRecordFile',
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
            dataIndex: 'otherDocumentsFile',
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
            dataIndex: 'safetyManagementQualificationCertificateFile',
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
            dataIndex: 'registeredSafetyEngineerCertificateFile',
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
            dataIndex: 'drivingLicenseFile',
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
            dataIndex: 'professionalQualificationCertificateFile',
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
            dataIndex: 'occupationalHazardsNotificationLetterFile',
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
            dataIndex: 'trainingCertificateFile',
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
            dataIndex: 'assessmentRecordFile',
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
            dataIndex: 'safetyManagementQualificationCertificateFile',
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
            dataIndex: 'authorizationLetterFile',
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
  const {message} = App.useApp();
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
            const phone = values.phone;
            if (!phone) {
              return false;
            }

            delete values.phone;

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
            <GroupedEmbedSchemaForm columns={columns}/>
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
            icon={<Icon icon="lucide:plus"/>}
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
                if (row?.['phone']) {
                  const phone = row.phone;

                  const data = row;
                  delete data.phone;

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
            columns={columns}
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
            title: "档案编号",
            dataIndex: "archiveId"
          },
          {
            title: "所属部门",
            dataIndex: "departmentPosition",
            valueType: 'department',
            fieldProps: {
              allowTypes: ['position']
            },
          },
          {
            title: "车牌号码",
            dataIndex: "licensePlate"
          },
          {
            title: "车主姓名",
            dataIndex: "ownerName"
          },
          {
            title: "驾驶员",
            dataIndex: "driverName"
          },
          {
            title: "驾驶员电话",
            dataIndex: "driverPhone"
          },
          {
            title: "车辆类型",
            dataIndex: "vehicleType",
            valueType: 'select',
            valueEnum: {
              "smallCar": "小型汽车",
              "trailer": "挂车",
              "heavyDumpTruck": "重型自卸货车",
              "flatbedTruck": "栏板车",
              "tractorTruck": "牵引车",
              "tankTruck": "罐式车",
              "passengerBus": "客运班车",
              "largeOrdinaryBus": "大型普通客车",
              "mediumOrdinaryBus": "中型普通客车",
              "smallOrdinaryBus": "小型普通客车",
              "transitBus": "公交车",
              "other": "其他类别",
            },
          },
          {
            title: "车辆技术等级",
            dataIndex: "technicalLevel",
            valueType: 'select',
            valueEnum: {
              L1: "一级",
              L2: "二级",
              L3: "三级",
              NONE: "未评定"
            }
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
            }
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
                          phone: resp.data.phone,
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
