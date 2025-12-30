import { BetaSchemaForm, ProForm } from '@ant-design/pro-components';
import { createFileRoute } from '@tanstack/react-router';
import { App } from 'antd';
import { Api } from '@/lib/api.ts';
import { columnIdFn, fillAiRefs } from '@/lib/functions.tsx';
import type { ColumnsType } from '@/lib/types.ts';

export const Route = createFileRoute('/dashboard/core/company/info')({
  component: RouteComponent,
});

const columnId = columnIdFn(['core', 'company', 'info']);

export const companyInfoColumns: Array<ColumnsType> = [
  {
    title: '企业名称',
    dataIndex: columnId('v1', 'companyName'),
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
    dataIndex: columnId('v1', 'companyType'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '法人姓名',
    dataIndex: columnId('v1', 'legalRepresentativeName'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '法人联系电话',
    dataIndex: columnId('v1', 'legalRepresentativePhone'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '社会信用代码',
    dataIndex: columnId('v1', 'socialCreditCode'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '经营许可证号',
    dataIndex: columnId('v1', 'businessPermitNumber'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '经营许可范围',
    dataIndex: columnId('v1', 'businessScope'),
    colProps: {
      span: 12,
    },
  },
  {
    title: '经营许可证有效期',
    dataIndex: columnId('v1', 'businessPermitExpiry'),
    valueType: 'validDateRange',
    colProps: {
      span: 12,
    },
  },
  {
    title: '企业地址',
    dataIndex: columnId('v1', 'companyAddress'),
    colProps: {
      span: 24,
    },
  },
  {
    title: '公司简介',
    dataIndex: columnId('v1', 'companyIntroduction'),
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
    dataIndex: columnId('v1', 'fullTimeSafetyStaffCount'),
    valueType: 'digit',
    colProps: {
      span: 12,
    },
  },
  {
    title: '特种设备管理人员人数',
    dataIndex: columnId('v1', 'specialEquipmentStaffCount'),
    valueType: 'digit',
    colProps: {
      span: 12,
    },
  },
  {
    title: '驾驶员人数',
    dataIndex: columnId('v1', 'driverCount'),
    valueType: 'digit',
    colProps: {
      span: 12,
    },
  },
  {
    title: '押运员人数',
    dataIndex: columnId('v1', 'escortCount'),
    valueType: 'digit',
    colProps: {
      span: 12,
    },
  },
  {
    title: '装卸管理员人数',
    dataIndex: columnId('v1', 'loadingUnloadingManagerCount'),
    valueType: 'digit',
    colProps: {
      span: 12,
    },
  },
  {
    title: '是否标准化达标',
    dataIndex: columnId('v1', 'isStandardized'),
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
    dataIndex: columnId('v1', 'businessLicenseFile'),
    valueType: '#assets',
    colProps: {
      span: 12,
    },
  },
  {
    title: '经营许可证',
    dataIndex: columnId('v1', 'businessPermitFile'),
    valueType: '#assets',
    colProps: {
      span: 12,
    },
  },
];

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
            [columnId('v1', 'companyName')]: resp.data.companyName,
          };
        }
        return {};
      }}
      onFinish={async (values) => {
        const v = values;
        delete v[columnId('v1', 'companyName')];
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
        columns={fillAiRefs([
          ...companyInfoColumns,
          {
            valueType: '#ai',
            colProps: {
              span: 12,
            },
            fieldProps: {
              label: '营业执照',
              assets: columnId('v1', 'businessLicenseFile'),
              columnRefs: [
                columnId('v1', 'companyType'),
                columnId('v1', 'legalRepresentativeName'),
                columnId('v1', 'socialCreditCode'),
                columnId('v1', 'companyAddress'),
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
              assets: columnId('v1', 'businessPermitFile'),
              columnRefs: [
                columnId('v1', 'businessPermitNumber'),
                columnId('v1', 'businessScope'),
                columnId('v1', 'businessPermitExpiry'),
              ],
            },
          },
        ])}
      />
    </ProForm>
  );
}
