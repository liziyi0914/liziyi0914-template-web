import {
  BetaSchemaForm,
  ModalForm,
  ProForm,
  type ProFormColumnsType,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { Alert, App, Button, Modal } from 'antd';
import { useCallback, useState } from 'react';
import { AssetsPickerView } from '@/components/formItem/AssetsPicker.tsx';
import { Api } from '@/lib/api.ts';

const Component: React.FC<{
  label?: string;
  assets?: string;
  columns?: ProFormColumnsType[];
}> = (props) => {
  const { message } = App.useApp();
  const form = ProForm.useFormInstance();

  const [lockModal, setLockModal] = useState(false);
  const [confirm, setConfirm] = useState<Record<string, any>>();

  const fetchAi = useCallback(
    async (prompts: string) => {
      if (!props.assets) {
        message.error('资源字段配置错误');
        return;
      }
      if (!props.columns) {
        message.error('数据列字段配置错误');
        return;
      }

      const assets = form.getFieldValue(props.assets);
      if (!assets) {
        message.error('请先选择资源');
        return;
      }

      const resp = await Api.common.requestAiInForm(
        prompts,
        assets,
        props.columns,
      );

      if (resp.code === 200 && resp.data) {
        const data = resp.data;

        const result: Record<string, any> = {};
        const display: Record<string, string> = {};
        for (const column of props.columns) {
          const k = `${column.dataIndex}`;
          if (!data[k]) {
            continue;
          }

          const value = data[k];
          display[k] = value;

          const col = props.columns?.filter((i) => i.dataIndex === k)?.[0];
          if (col?.valueEnum) {
            let converted = (col.valueEnum as Record<string, any>)?.[value];
            converted = converted?.label ?? converted;
            if (!converted) {
              continue;
            } else {
              display[k] = converted;
            }
          }

          result[k] = data[k];
        }

        setConfirm(result);

        return true;
      } else {
        message.error(`AI识别失败: ${resp.msg}`);
        console.error(resp);
        return false;
      }
    },
    [form],
  );

  console.log(form);

  return (
    <>
      <Modal
        open={!!confirm}
        title="确定填入以下内容："
        footer={null}
        destroyOnHidden
        onCancel={() => {
          setConfirm(undefined);
        }}
      >
        <div className="pb-3">
          <AssetsPickerView
            value={form.getFieldValue(props.assets)}
            canPreview={true}
          />
        </div>
        <BetaSchemaForm
          initialValues={confirm}
          columns={props.columns ?? []}
          onFinish={async (values) => {
            form.setFieldsValue(values);
            setConfirm(undefined);
            return true;
          }}
        />
      </Modal>
      <ModalForm
        title={props.label ?? 'AI填写'}
        onFinish={async (values) => {
          setLockModal(true);
          const resp = await fetchAi(values?.prompts ?? '');
          setLockModal(false);
          return resp;
        }}
        trigger={
          <Button icon={<Icon icon="octicon:sparkles-fill-24" />}>
            {props.label ?? 'AI填写'}
          </Button>
        }
        submitter={{
          searchConfig: {},
          resetButtonProps: {
            className: 'hidden',
          },
          render: (props) => {
            return [
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                loading={lockModal}
                onClick={() => {
                  props.submit();
                }}
              >
                提交
              </Button>,
            ];
          },
        }}
        modalProps={{
          destroyOnHidden: true,
          closable: !lockModal,
          maskClosable: !lockModal,
        }}
      >
        <Alert title="PDF文件截取前三页进行识别" type="info" showIcon />
        <div className="py-3">
          <AssetsPickerView
            value={form.getFieldValue(props.assets)}
            canPreview={true}
          />
        </div>
        <ProFormTextArea
          disabled={lockModal}
          name="prompts"
          label="提示词"
          placeholder="请输入"
        />
      </ModalForm>
    </>
  );
};

export default Component;
