import {App, Button, Modal, Popover, Tabs, Upload} from "antd";
import {Icon} from "@iconify/react";
import {ProForm, ProFormDependency, ProFormSelect, ProFormText, ProTable} from "@ant-design/pro-components";
import {useState} from "react";
import CryptoJS from 'crypto-js';
import {Api, uploadOss} from "@/lib/api.ts";
import type {OSSUploadPresignArgs} from "@/lib/types.ts";
import OssImage from "@/components/OssImage.tsx";
import {useQuery} from "@tanstack/react-query";

export const UploadAssetsForm: React.FC<{
  onSuccess?: (assetsId: string) => void;
}> = (props) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File>();

  return (
    <ProForm
      submitter={{
        searchConfig: {
          submitText: '上传',
        },
      }}
      onFinish={async (data)=>{
        if (!file) {
          message.error('请选择文件');
          return false;
        }

        const fileBytes = await file.arrayBuffer();
        const hash = CryptoJS.enc.Base64.stringify(
          CryptoJS.MD5(CryptoJS.lib.WordArray.create(fileBytes)),
        );

        let args: OSSUploadPresignArgs;
        {
          let suffix = file.name.split('.').reverse()?.[0];
          let resp = await Api.common.uploadAssets(data.name, data.fileType, hash, suffix);
          if (resp.code !== 200) {
            message.error(`上传失败: ${resp.msg}`);
            return false;
          }
          if (!resp.data) {
            message.error('上传失败');
            return false;
          }
          args = resp.data;
        }

        const uploadResp = await uploadOss<string>(
          args.url,
          file,
          {
            'Content-MD5': hash,
            'x-oss-callback': args.callback,
            'x-oss-callback-var': args.callbackVar,
          },
        );

        if (uploadResp.code !== 200) {
          message.error(uploadResp.msg || '上传失败，请稍后重试');
          return;
        }
        if (!uploadResp.data) {
          message.error(uploadResp.msg || '上传失败，请稍后重试');
          return;
        }

        message.success('上传成功');
        props.onSuccess?.(uploadResp.data);
        return true;
      }}
    >
      <ProFormText
        name="name"
        label="文件名"
        rules={[
          {
            required: true,
            message: '请输入文件名',
          },
        ]}
      />
      <ProFormSelect
        name="fileType"
        label="文件类型"
        initialValue="image/*"
        options={[
          {
            label: '图片',
            value: 'image/*',
          },
          {
            label: '视频',
            value: 'video/*',
          },
          {
            label: 'Word',
            value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          {
            label: 'Excel',
            value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          {
            label: 'PDF',
            value: 'application/pdf',
          },
        ]}
        rules={[
          {
            required: true,
            message: '请选择文件类型',
          },
        ]}
      />
      <ProFormDependency name={['fileType']}>
        {({ fileType }) => (
          <ProForm.Item>
            <Upload.Dragger
              accept={fileType}
              multiple={false}
              maxCount={1}
              beforeUpload={(file) => {
                setFile(file);
                return false;
              }}
              onRemove={() => {
                setFile(undefined);
              }}
            >
              <div className="flex justify-center text-4xl text-black/50">
                <Icon icon="lucide:upload" />
              </div>
              <div className="font-semibold">点击或将文件拖拽至此处上传</div>
            </Upload.Dragger>
          </ProForm.Item>
        )}
      </ProFormDependency>
    </ProForm>
  );
};

const AssetsTable: React.FC<{
  onChoose?: (assetsId: string) => void;
}> = (props) => {
  return (
    <ProTable
      request={Api.dashboard.core.company.assets.list}
      columns={[
        {
          title: '文件名',
          dataIndex: 'name',
        },
        {
          title: '文件类型',
          dataIndex: 'fileType',
          valueEnum: {
            'image/*': '图片',
            'video/*': '视频',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
            'application/pdf': 'PDF',
          },
        },
        {
          title: '操作',
          valueType: 'option',
          render: (_, record) => [
            record.fileType==='image/*' ? (
              <Popover
                content={(
                  <OssImage
                    src={record.id}
                    width={200}
                  />
                )}
                destroyOnHidden
              >
                <Button
                  key="preview"
                  size="small"
                  type="link"
                >预览</Button>
              </Popover>
            ) : undefined,
            <Button
              key="download"
              size="small"
              type="link"
            >下载</Button>,
            <Button
              key="choose"
              size="small"
              type="link"
              onClick={() => {
                props.onChoose?.(record.id);
              }}
            >选择</Button>,
          ]
        }
      ]}
    />
  );
}

const Component: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
}> = (props) => {
  const [openModal, setOpenModal] = useState(false);

  const assetsInfo = useQuery({
    queryKey: ['assetsInfo', props.value],
    queryFn: async () => {
      if (!props.value) {
        throw new Error('未选择资源');
      }
      const resp = await Api.common.getAssetsInfo(props.value);
      if (resp.code !== 200) {
        throw new Error(resp.msg || '获取资源信息失败');
      }
      return resp.data;
    },
  });

  return (
    <>
      <Modal
        open={openModal}
        destroyOnHidden
        title="选择资源"
        footer={null}
        onCancel={() => {
          setOpenModal(false);
        }}
      >
        <Tabs
          items={[
            {
              key: 'library',
              label: '资源库',
              children: (
                <AssetsTable
                  onChoose={(assetsId) => {
                    setOpenModal(false);
                    console.log(props)
                    console.log('choose', assetsId)
                    props.onChange?.(assetsId);
                  }}
                />
              ),
            },
            {
              key: 'upload',
              label: '上传',
              children: (
                <UploadAssetsForm
                  onSuccess={(assetsId) => {
                    setOpenModal(false);
                    console.log(props)
                    console.log('choose', assetsId)
                    props.onChange?.(assetsId);
                  }}
                />
              ),
            },
          ]}
          destroyOnHidden
        />
      </Modal>


      {props.value && (
        <div>
          {assetsInfo.data?.fileType==='image/*' && (
            <div>
              <OssImage
                src={props.value}
                width={200}
              />
            </div>
          )}
          <div>{assetsInfo.data?.name}</div>
          <Button
            onClick={() => {
              setOpenModal(true);
            }}
          >更换</Button>
        </div>
      )}
      {!props.value && (
        <div>
          <Button
            onClick={() => {
              setOpenModal(true);
            }}
          >选择资源</Button>
        </div>
      )}
    </>
  );
};

export default Component;
