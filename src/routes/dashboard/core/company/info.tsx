import { BetaSchemaForm, ProForm } from '@ant-design/pro-components';
import { createFileRoute } from '@tanstack/react-router';
import { App } from 'antd';
import { Api } from '@/lib/api.ts';

export const Route = createFileRoute('/dashboard/core/company/info')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();
  const [form] = ProForm.useForm();

  return (
    <ProForm
      grid
      form={form}
      request={async () => {
        const resp = await Api.dashboard.core.company.info.get();
        if (resp.code === 200 && resp.data) {
          return {
            ...resp.data.data,
            companyName: resp.data.companyName,
          };
        }
        return {};
      }}
      onFinish={async (values) => {
        const v = values;
        delete v.companyName;
        const resp = await Api.dashboard.core.company.info.update({
          data: v,
        });
        if (resp.code === 200) {
          message.success('保存成功');
        } else {
          message.error(`保存失败: ${resp.msg}`);
          console.error(resp);
        }
      }}
    >
      <BetaSchemaForm
        layoutType="Embed"
        // rowProps={{
        //   gutter: [16, 16],
        // }}
        // colProps={{
        //   span: 12,
        // }}
        columns={[
          {
            title: '企业名称',
            dataIndex: 'companyName',
            fieldProps: {
              disabled: true,
            },
            formItemProps: {
              required: true,
              rules: [
                {
                  required: true,
                  message: '请输入企业名称！',
                },
              ],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '企业类型',
            dataIndex: 'companyType',
            colProps: {
              span: 12,
            },
          },
          {
            title: '法人姓名',
            dataIndex: 'legalRepresentativeName',
            colProps: {
              span: 12,
            },
          },
          {
            title: '法人联系电话',
            dataIndex: 'legalRepresentativePhone',
            colProps: {
              span: 12,
            },
          },
          {
            title: '社会信用代码',
            dataIndex: 'socialCreditCode',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营许可证号',
            dataIndex: 'businessPermitNumber',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营许可范围',
            dataIndex: 'businessScope',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营许可证有效期',
            dataIndex: 'businessPermitExpiry',
            valueType: 'validDateRange',
            colProps: {
              span: 12,
            },
          },
          {
            title: '企业地址',
            dataIndex: 'companyAddress',
            colProps: {
              span: 24,
            },
          },
          {
            title: '公司简介',
            dataIndex: 'companyIntroduction',
            valueType: 'textarea',
            colProps: {
              span: 24,
            },
            fieldProps: {
              rows: 4,
            },
          },
          {
            title: '专职安全管理人员人数',
            dataIndex: 'fullTimeSafetyStaffCount',
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '特种设备管理人员人数',
            dataIndex: 'specialEquipmentStaffCount',
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '驾驶员人数',
            dataIndex: 'driverCount',
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '押运员人数',
            dataIndex: 'escortCount',
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '装卸管理员人数',
            dataIndex: 'loadingUnloadingManagerCount',
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '是否标准化达标',
            dataIndex: 'isStandardized',
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
            title: '营业执照',
            dataIndex: 'businessLicenseFile',
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营许可证',
            dataIndex: 'businessPermitFile',
            valueType: '#assets',
            colProps: {
              span: 12,
            },
          },
          {
            valueType: '#ai',
            colProps: {
              span: 12,
            },
            fieldProps: {
              label: '营业执照',
              assets: 'businessLicenseFile',
              columns: [
                {
                  title: '企业类型',
                  dataIndex: 'companyType',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '法人姓名',
                  dataIndex: 'legalRepresentativeName',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '社会信用代码',
                  dataIndex: 'socialCreditCode',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '企业地址',
                  dataIndex: 'companyAddress',
                  colProps: {
                    span: 24,
                  },
                },
              ],
            },
          },
          {
            valueType: '#ai',
            colProps: {
              span: 12,
            },
            fieldProps: {
              label: '经营许可证',
              assets: 'businessPermitFile',
              columns: [
                {
                  title: '经营许可证号',
                  dataIndex: 'businessPermitNumber',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '经营许可范围',
                  dataIndex: 'businessScope',
                  colProps: {
                    span: 12,
                  },
                },
                {
                  title: '经营许可证有效期',
                  dataIndex: 'businessPermitExpiry',
                  valueType: 'validDateRange',
                  colProps: {
                    span: 12,
                  },
                },
              ],
            },
          },
        ]}
      />
    </ProForm>
  );
}
