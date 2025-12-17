import {
  type ActionType,
  ModalForm,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Modal, Popconfirm, Popover } from 'antd';
import { useRef, useState } from 'react';
import { UploadAssetsForm } from '@/components/AssetsPicker.tsx';
import OssImage from '@/components/OssImage.tsx';
import { Api } from '@/lib/api.ts';

export const Route = createFileRoute('/dashboard/core/company/assets')({
  component: RouteComponent,
});

function RouteComponent() {
  const { message } = App.useApp();
  const [showUpload, setShowUpload] = useState(false);

  const actionRef = useRef<ActionType>(undefined);

  return (
    <div>
      <Modal
        open={showUpload}
        destroyOnHidden
        title="上传资源"
        onCancel={() => {
          setShowUpload(false);
        }}
        footer={null}
      >
        <UploadAssetsForm
          onSuccess={() => {
            actionRef.current?.reload();
            setShowUpload(false);
          }}
        />
      </Modal>

      <ProTable
        actionRef={actionRef}
        request={Api.dashboard.core.company.assets.list}
        toolBarRender={() => [
          <Button
            key="add"
            icon={<Icon icon="lucide:plus" />}
            onClick={() => {
              setShowUpload(true);
            }}
          >
            上传
          </Button>,
        ]}
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
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                'Word',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                'Excel',
              'application/pdf': 'PDF',
            },
          },
          {
            title: '操作',
            valueType: 'option',
            render: (_, record) => [
              <ModalForm
                title="重命名"
                modalProps={{
                  destroyOnHidden: true,
                }}
                trigger={
                  <Button key="rename" size="small" type="link">
                    重命名
                  </Button>
                }
                initialValues={{
                  name: record.name,
                }}
                onFinish={async (values) => {
                  const resp = await Api.dashboard.core.company.assets.rename(
                    record.id,
                    values.name,
                  );
                  if (resp.code === 200) {
                    message.success('重命名成功');
                    actionRef.current?.reload();
                    return true;
                  }
                  message.error(`重命名失败: ${resp.msg}`);
                  return false;
                }}
              >
                <ProFormText
                  label="文件名"
                  name="name"
                  rules={[
                    {
                      required: true,
                      message: '请输入文件名',
                    },
                  ]}
                />
              </ModalForm>,
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
              <Popconfirm
                title={`确定删除${record.name}吗？`}
                onConfirm={() => {
                  Api.dashboard.core.company.assets
                    .delete(record.id)
                    .then(() => {
                      actionRef.current?.reload();
                      message.success('删除成功');
                    });
                }}
                okText="删除"
                okButtonProps={{
                  danger: true,
                }}
                cancelText="取消"
                key="delete"
              >
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>,
            ],
          },
        ]}
      />
    </div>
  );
}
