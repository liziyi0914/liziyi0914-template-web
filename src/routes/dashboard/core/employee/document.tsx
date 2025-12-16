import {type ActionType, BetaSchemaForm, ProForm, ProTable} from '@ant-design/pro-components';
import { createFileRoute } from '@tanstack/react-router';
import {App, Button, Modal, Popconfirm, Tabs} from 'antd';
import {useRef, useState} from "react";
import {Api, type ApiResult} from "@/lib/api.ts";
import {Icon} from "@iconify/react";

export const Route = createFileRoute('/dashboard/core/employee/document')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(undefined);
  const [employee, setEmployee] = useState<{ id?: string; data?: Record<string, any>; } | undefined>(undefined);

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
            let phone = values.phone;
            if (!phone) {
              return false;
            }

            delete values.phone;

            let resp: ApiResult;

            if (employee?.id) {
              resp = await Api.dashboard.core.employee.document.update(employee.id, phone, values);
            } else {
              resp = await Api.dashboard.core.employee.document.create(phone, values);
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
            <div className="hidden">
              <BetaSchemaForm
                layoutType="Embed"
                columns={[
                  {
                    title: '证件照（大头照/小一寸/大一寸）',
                    dataIndex: 'photo',
                    valueType: 'assets',
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
                      "primarySchool": "小学",
                      "juniorHighSchool": "初中",
                      "seniorHighSchool": "高中",
                      "juniorCollege": "专科",
                      "undergraduate": "本科",
                      "graduate": "研究生",
                      "secondaryVocationalSchool": "中专"
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
                  {
                    title: '国徽面',
                    dataIndex: 'idCardFront',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '人像面',
                    dataIndex: 'idCardBack',
                    valueType: 'assets',
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
                    title: '文件',
                    dataIndex: 'laborContract',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'safetyCommitmentLetter',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'responsibilityStatement',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'physicalExaminationCertificate',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'trainingRecord',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'otherDocuments',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'safetyManagementQualificationCertificate',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'registeredSafetyEngineerCertificate',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'drivingLicense',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'professionalQualificationCertificate',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'occupationalHazardsNotificationLetter',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'trainingCertificate',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'assessmentRecord',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  },
                  {
                    title: '文件',
                    dataIndex: 'authorizationLetter',
                    valueType: 'assets',
                    colProps: {
                      span: 12,
                    },
                  }
                ]}
              />
            </div>
            <Tabs
              items={[
                {
                  key: 'basic',
                  label: '基础档案',
                  children: (
                    <Tabs
                      destroyOnHidden
                      tabPlacement="start"
                      items={[
                        {
                          key: 'basic',
                          label: '基础信息',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '证件照（大头照/小一寸/大一寸）',
                                    dataIndex: 'photo',
                                    valueType: 'assets',
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
                                      "primarySchool": "小学",
                                      "juniorHighSchool": "初中",
                                      "seniorHighSchool": "高中",
                                      "juniorCollege": "专科",
                                      "undergraduate": "本科",
                                      "graduate": "研究生",
                                      "secondaryVocationalSchool": "中专"
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
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'idCard',
                          label: '身份证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '国徽面',
                                    dataIndex: 'idCardFront',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                  {
                                    title: '人像面',
                                    dataIndex: 'idCardBack',
                                    valueType: 'assets',
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
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'laborContract',
                          label: '劳动合同',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'laborContract',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'safetyCommitmentLetter',
                          label: '安全承诺书',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'safetyCommitmentLetter',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'responsibilityStatement',
                          label: '责任书',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'responsibilityStatement',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'physicalExaminationCertificate',
                          label: '体检证明',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'physicalExaminationCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'trainingRecord',
                          label: '培训教育记录',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'trainingRecord',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'otherDocuments',
                          label: '其它文件',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'otherDocuments',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'safety',
                  label: '安全管理人员档案',
                  children: (
                    <Tabs
                      destroyOnHidden
                      tabPlacement="start"
                      items={[
                        {
                          key: 'safetyManagementQualificationCertificate',
                          label: '安全管理资格证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'safetyManagementQualificationCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'registeredSafetyEngineerCertificate',
                          label: '注册安全工程师证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'registeredSafetyEngineerCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'driver',
                  label: '驾驶人员档案',
                  children: (
                    <Tabs
                      destroyOnHidden
                      tabPlacement="start"
                      items={[
                        {
                          key: 'drivingLicense',
                          label: '驾驶证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'drivingLicense',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'professionalQualificationCertificate',
                          label: '从业资格证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'professionalQualificationCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'occupationalHazardsNotificationLetter',
                          label: '职业危害告知书',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'occupationalHazardsNotificationLetter',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'monitoring',
                  label: '监控人员档案',
                  children: (
                    <Tabs
                      destroyOnHidden
                      tabPlacement="start"
                      items={[
                        {
                          key: 'trainingCertificate',
                          label: '培训证明',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'trainingCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'assessmentRecord',
                          label: '考核记录',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'assessmentRecord',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'chief',
                  label: '主要负责人员档案',
                  children: (
                    <Tabs
                      destroyOnHidden
                      tabPlacement="start"
                      items={[
                        {
                          key: 'safetyManagementQualificationCertificate',
                          label: '安全管理资格证',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'safetyManagementQualificationCertificate',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                        {
                          key: 'authorizationLetter',
                          label: '委托书',
                          children: (
                            <div className="flex flex-wrap">
                              <BetaSchemaForm
                                layoutType="Embed"
                                columns={[
                                  {
                                    title: '文件',
                                    dataIndex: 'authorizationLetter',
                                    valueType: 'assets',
                                    colProps: {
                                      span: 12,
                                    },
                                  },
                                ]}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        </ProForm>
      </Modal>
      <ProTable
        actionRef={actionRef}
        request={Api.dashboard.core.employee.document.list}
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
              0: '男',
              1: '女',
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
                    let resp = await Api.dashboard.core.employee.document.refreshBinding(record.id);
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
            )
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

                    let resp = await Api.dashboard.core.employee.document.get(record.id);

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
                    let resp = await Api.dashboard.core.employee.document.delete(record.id);
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
                  <Button
                    type="link"
                    size="small"
                    danger
                  >删除</Button>
                </Popconfirm>
              </>
            )
          },
        ]}
      />
    </div>
  );
}
