import {App, Button} from "antd";
import {Icon} from "@iconify/react";
import {
  ModalForm,
  ProDescriptions,
  ProForm,
  type ProFormColumnsType,
  ProFormTextArea
} from "@ant-design/pro-components";
import {useCallback, useState} from "react";
import {Api} from "@/lib/api.ts";

const Component: React.FC<{
  label?: string;
  assets?: string;
  columns?: ProFormColumnsType[];
}> = (props) => {
  const { message, modal } = App.useApp();
  const form = ProForm.useFormInstance();

  const [lockModal, setLockModal] = useState(false);

  const fetchAi = useCallback(async (prompts: string)=>{
    if (!props.assets) {
      message.error('资源字段配置错误');
      return;
    }
    if (!props.columns) {
      message.error('数据列字段配置错误');
      return;
    }

    let assets = form.getFieldValue(props.assets);
    if (!assets) {
      message.error('请先选择资源');
      return;
    }

    let resp = await Api.common.requestAiInForm(prompts, assets, props.columns);

    if (resp.code === 200 && resp.data) {
      let data = resp.data;

      let result: Record<string, any> = {};
      let display: Record<string, string> = {};
      for (let column of props.columns) {
        let k = `${column.dataIndex}`;
        if (!data[k]) {
          continue;
        }

        let value = data[k];
        display[k] = value;

        let col = props.columns?.filter(i => i.dataIndex === k)?.[0];
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

      modal.confirm({
        title: '确定填入以下内容：',
        content: (
          <ProDescriptions
            dataSource={result}
            column={1}
            columns={props.columns as any ?? []}
          >
          </ProDescriptions>
        ),
        onOk: async () => {
          form.setFieldsValue(result);
        },
      });

      return true;
    } else {
      message.error(`AI识别失败: ${resp.msg}`);
      console.error(resp);
      return false;
    }
  }, [form]);

  return (
    <ModalForm
      title={props.label ?? 'AI填写'}
      onFinish={async (values) => {
        setLockModal(true);
        let resp = await fetchAi(values?.prompts ?? '');
        setLockModal(false);
        return resp;
      }}
      trigger={(
        <Button
          icon={<Icon icon="octicon:sparkles-fill-24" />}
        >{props.label ?? 'AI填写'}</Button>
      )}
      submitter={{
        searchConfig: {
        },
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
              onClick={()=>{
                props.submit();
              }}
            >提交</Button>,
          ];
        }
      }}
      modalProps={{
        destroyOnHidden: true,
        closable: !lockModal,
        maskClosable: !lockModal,
      }}
    >
      <ProFormTextArea
        disabled={lockModal}
        name="prompts"
        label="提示词"
        placeholder="请输入"
      />
    </ModalForm>
  );
};

export default Component;
