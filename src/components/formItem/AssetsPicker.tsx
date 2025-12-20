import {
  ProForm,
  ProFormDependency,
  ProFormSelect,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Modal, Popover, Tabs, Upload } from 'antd';
import CryptoJS from 'crypto-js';
import { useEffect, useMemo, useState } from 'react';
import OssImage from '@/components/OssImage.tsx';
import { Api, uploadOss } from '@/lib/api.ts';
import type { OSSUploadPresignArgs } from '@/lib/types.ts';

const fileTypeMap = {
  'image/*': '图片',
  'video/*': '视频',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/pdf': 'PDF',
};

export const UploadAssetsForm: React.FC<{
  onSuccess?: (assetsId: string) => void;
  allowFileTypes?: Array<keyof typeof fileTypeMap>;
}> = (props) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File>();

  const fileType = useMemo(() => {
    const base = [
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
        value:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        label: 'Excel',
        value:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        label: 'PDF',
        value: 'application/pdf',
      },
    ];

    if (!props.allowFileTypes) {
      return base;
    }

    return base.filter((item) =>
      props.allowFileTypes?.includes(item.value as any),
    );
  }, [props.allowFileTypes]);

  return (
    <ProForm
      submitter={{
        searchConfig: {
          submitText: '上传',
        },
      }}
      onFinish={async (data) => {
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
          const suffix = file.name.split('.').reverse()?.[0];
          const resp = await Api.common.uploadAssets(
            data.name,
            data.fileType,
            hash,
            suffix,
          );
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

        const uploadResp = await uploadOss<string>(args.url, file, {
          'Content-MD5': hash,
          'x-oss-callback': args.callback,
          'x-oss-callback-var': args.callbackVar,
        });

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
        initialValue={fileType?.[0]?.value}
        options={fileType}
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
              <div className="flex justify-center text-4xl text-muted-foreground/50 pb-3">
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
  multiple?: boolean;
  value?: string;
  onChange?: (assetsId?: string) => void;
  maxCount?: number;
  allowFileTypes?: Array<keyof typeof fileTypeMap>;
}> = (props) => {
  const { message } = App.useApp();
  const [selectedRowKeys, setSelectedRowKeys] = useState(
    props.value?.split(';') ?? [],
  );

  useEffect(() => {
    props.onChange?.(selectedRowKeys?.join(';'));
  }, [selectedRowKeys]);

  return (
    <ProTable
      request={Api.dashboard.core.company.assets.list}
      rowSelection={{
        type: props.multiple ? 'checkbox' : 'radio',
        defaultSelectedRowKeys: props.value?.split(';'),
        onChange: (selectedRowKeys, rows) => {
          if (props.maxCount && props.maxCount !== -1) {
            if (selectedRowKeys.length > props.maxCount) {
              message.error(`最多选择${props.maxCount}个文件`);
              return;
            }
          }

          if (
            props.allowFileTypes &&
            rows.filter(
              (row) => !props.allowFileTypes?.includes(row.fileType as any),
            ).length > 0
          ) {
            message.error('不可选择此文件类型');
            return;
          }

          setSelectedRowKeys(selectedRowKeys as string[]);
        },
        selectedRowKeys: selectedRowKeys,
      }}
      rowKey="id"
      columns={[
        {
          title: '文件名',
          dataIndex: 'name',
        },
        {
          title: '文件类型',
          dataIndex: 'fileType',
          valueEnum: fileTypeMap,
        },
        {
          title: '操作',
          valueType: 'option',
          render: (_, record) => [
            record.fileType === 'image/*' ? (
              <Popover
                content={<OssImage src={record.id} width={200} />}
                destroyOnHidden
              >
                <Button key="preview" size="small" type="link">
                  预览
                </Button>
              </Popover>
            ) : undefined,
            <Button
              key="download"
              size="small"
              type="link"
              onClick={async () => {
                const resp = await Api.common.getAssetsLink(record.id);
                if (resp.code === 200 && resp.data) {
                  const url = resp.data;
                  const a = document.createElement('a');
                  a.target = '_blank';
                  a.href = url;
                  a.download = record.name;
                  a.click();
                  URL.revokeObjectURL(url);
                  message.success('下载成功');
                } else {
                  message.error('下载失败');
                }
              }}
            >
              下载
            </Button>,
          ],
        },
      ]}
    />
  );
};

const Component: React.FC<{
  value?: string;
  onChange?: (value?: string) => void;
  multiple?: boolean;
  maxCount?: number;
  allowFileTypes?: Array<keyof typeof fileTypeMap>;
}> = (props) => {
  const [openModal, setOpenModal] = useState(false);

  const assetsInfoList = useQuery({
    queryKey: ['assetsInfo', props.value],
    queryFn: async () => {
      if (!props.value) {
        throw new Error('未选择资源');
      }

      const awaits = await Promise.all(
        props.value.split(';').map(Api.common.getAssetsInfo),
      );

      return awaits.map((resp) => {
        if (resp.code !== 200) {
          return null;
        }
        return resp.data;
      });
    },
    refetchOnWindowFocus: false,
  });

  const [libCache, setLibCache] = useState(props.value);

  const cacheFileList = useMemo(() => {
    return assetsInfoList.data?.map((info) => {
      if (!info) {
        return <div>资源获取失败</div>;
      }
      return (
        <div>
          {info.fileType === 'image/*' && (
            <div>
              <OssImage src={info.id} width={200} />
            </div>
          )}
          <div>{info.name}</div>
        </div>
      );
    });
  }, [assetsInfoList.data]);

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
                <div>
                  <AssetsTable
                    multiple={props.multiple}
                    value={props.value}
                    maxCount={props.maxCount}
                    onChange={(assetsId) => {
                      setLibCache(assetsId);
                    }}
                    allowFileTypes={props.allowFileTypes}
                  />
                  <div>
                    <Button
                      type="primary"
                      onClick={() => {
                        setOpenModal(false);
                        props.onChange?.(libCache);
                      }}
                    >
                      选择
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: 'upload',
              label: '上传',
              children: (
                <UploadAssetsForm
                  onSuccess={(assetsId) => {
                    setOpenModal(false);
                    props.onChange?.(assetsId);
                  }}
                  allowFileTypes={props.allowFileTypes}
                />
              ),
            },
          ]}
          destroyOnHidden
        />
      </Modal>

      {props.value && (
        <div>
          <div>{cacheFileList}</div>
          <div className="flex gap-x-3">
            <Button
              onClick={() => {
                setOpenModal(true);
              }}
            >
              更换
            </Button>
            <Button
              danger
              onClick={() => {
                props.onChange?.(undefined);
              }}
            >
              删除
            </Button>
          </div>
        </div>
      )}
      {!props.value && (
        <div>
          <Button
            onClick={() => {
              setOpenModal(true);
            }}
          >
            选择资源
          </Button>
        </div>
      )}
    </>
  );
};

export const AssetsPickerView: React.FC<{
  value?: string;
}> = (props) => {
  const assetsInfoList = useQuery({
    queryKey: ['assetsInfo', props.value],
    queryFn: async () => {
      if (!props.value) {
        throw new Error('未选择资源');
      }

      const awaits = await Promise.all(
        props.value.split(';').map(Api.common.getAssetsInfo),
      );

      return awaits.map((resp) => {
        if (resp.code !== 200) {
          return null;
        }
        return resp.data;
      });
    },
    refetchOnWindowFocus: false,
  });

  const name = useMemo(() => {
    if (!assetsInfoList.data) {
      return '-';
    }
    return assetsInfoList.data
      .map((i) => i?.name)
      .filter((i) => !!i)
      .join('、');
  }, [assetsInfoList.data]);

  return <>{name}</>;
};

export default Component;
