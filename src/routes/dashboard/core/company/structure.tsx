import { createFileRoute } from '@tanstack/react-router'
import {App, Button, Divider, Popconfirm, Result, Spin, Tree, type TreeDataNode} from "antd";
import {BetaSchemaForm, ModalForm, ProForm, type ProFormColumnsType} from "@ant-design/pro-components";
import {Icon} from "@iconify/react";
import {useQuery} from "@tanstack/react-query";
import {Api} from "@/lib/api.ts";
import {useEffect, useMemo, useState} from "react";
import {convertDepartmentsToTreeData} from "@/lib/functions.tsx";

export const Route = createFileRoute('/dashboard/core/company/structure')({
  component: RouteComponent,
})

// @ts-ignore
const editDepartmentSchema: (id?: string) => Array<ProFormColumnsType> = (id?: string) => [
  {
    title: 'ID',
    dataIndex: 'id',
    fieldProps: {
      disabled: true,
    },
  },
  {
    title: '部门名称',
    dataIndex: 'name',
    formItemProps: {
      required: true,
      rules: [
        {
          required: true,
          message: '部门名称不能为空',
        },
      ],
    },
  },
  {
    title: '上级部门',
    dataIndex: 'parent',
    valueType: 'department',
    fieldProps: {
      placeholder: '请选择部门',
      allowTypes: ['department'],
      bannedValues: id ? [id] : [],
    },
  },
  {
    title: '部门职责',
    dataIndex: 'responsibilities',
    valueType: 'textarea',
    fieldProps: {
      rows: 4,
    },
  },
];

const editPositionSchema: Array<ProFormColumnsType> = [
  {
    title: 'ID',
    dataIndex: 'id',
    fieldProps: {
      disabled: true,
    },
  },
  {
    title: '岗位名称',
    dataIndex: 'name',
    formItemProps: {
      required: true,
      rules: [
        {
          required: true,
          message: '岗位名称不能为空',
        },
      ],
    },
  },
  {
    title: '岗位简介',
    dataIndex: 'description',
    valueType: 'textarea',
    fieldProps: {
      rows: 4,
    },
  },
];

function RouteComponent() {
  const {message} = App.useApp();
  const departments = useQuery({
    queryKey: ['dashboard.core.company.structure'],
    queryFn: async () => {
      let resp = await Api.dashboard.core.company.structure.list();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(`获取部门列表失败: ${resp.data}`);
    }
  });

  const tree = useMemo<TreeDataNode[]>(()=>{
    if (!departments.isSuccess || !departments.data) {
      return [];
    }

    let list = departments.data.departments;

    return convertDepartmentsToTreeData(list);
  }, [departments]);

  const [selectedKey, setSelectedKey] = useState<string>();
  // const [, setInitialValues] = useState<any>();

  const [form] = ProForm.useForm();

  const initialValues = useMemo(() => {
    if (selectedKey && departments.isSuccess && departments.data) {
      let [type, id] = selectedKey.split('.');
      if (type === 'department') {
        let department = departments.data.departments.filter(i => i.id === id)?.[0];
        if (department) {
          return {
            id: department.id,
            name: department.name,
            parent: department.parent,
            responsibilities: department.responsibilities,
          };
        }
      } else if (type === 'position') {
        let department = departments.data.departments
          .filter(i => (i.positions?.filter(j => j.id === id).length ?? 0) > 0)
          ?.[0];
        if (department) {
          let position = department.positions?.filter(i => i.id === id)?.[0];
          if (position) {
            return {
              id: position.id,
              name: position.name,
              description: position.description,
            };
          }
        }
      }
    }
  }, [selectedKey, departments]);

  useEffect(() => {
    form.resetFields();
  }, [selectedKey]);

  return (
    <div>
      {departments.isLoading && (
        <Spin spinning tip="加载中...">
          <div className="h-24" />
        </Spin>
      )}
      {departments.isError && (
        <div>
          <Result
            status="error"
            title="获取部门列表失败"
            subTitle={departments.error.message}
          />
        </div>
      )}
      {departments.isSuccess && (
        <div>
          <div className="flex">
            <div className="w-72">
              <div className="pb-3 flex gap-x-2">
                <Button>生成架构图</Button>
                <div className="grow"></div>
                <ModalForm
                  title="添加部门"
                  modalProps={{
                    destroyOnHidden: true,
                  }}
                  trigger={(
                    <Button
                      icon={<Icon icon="lucide:plus" />}
                    >添加部门</Button>
                  )}
                  onFinish={async (values) => {
                    let resp = await Api.dashboard.core.company.structure.createDepartment(values as any);
                    if (resp.code === 200) {
                      message.success('添加部门成功');
                      departments.refetch();
                      return true;
                    }
                    message.error(`添加部门失败: ${resp.msg}`);
                    return false;
                  }}
                >
                  <BetaSchemaForm
                    layoutType="Embed"
                    columns={editDepartmentSchema()}
                  />
                </ModalForm>
              </div>
              <Tree
                treeData={tree}
                blockNode
                defaultExpandAll
                multiple={false}
                onSelect={(keys) => {
                  setSelectedKey(keys[0] as string);
                }}
                showIcon
              />
              {tree.length === 0 && (
                <div
                  className="text-center text-muted-foreground"
                >暂无部门</div>
              )}
            </div>
            <div>
              <Divider orientation="vertical" className="h-full!" />
            </div>
            <div className="grow">
              {!selectedKey && (
                <div
                  className="text-center text-muted-foreground"
                >请选择部门或岗位</div>
              )}
              {selectedKey && (
                <ProForm
                  form={form}
                  initialValues={initialValues}
                  onFinish={async (values) => {
                    let [type, id] = selectedKey.split('.');
                    if (type === 'department') {
                      let resp = await Api.dashboard.core.company.structure.updateDepartment(id, values as any);
                      if (resp.code === 200) {
                        message.success('保存成功');
                        departments.refetch();
                        return true;
                      }
                      message.error(`保存失败: ${resp.msg}`);
                      return false;
                    } else if (type === 'position') {
                      let resp = await Api.dashboard.core.company.structure.updatePosition(id, values as any);
                      if (resp.code === 200) {
                        message.success('保存成功');
                        departments.refetch();
                        return true;
                      }
                      message.error(`保存失败: ${resp.msg}`);
                      return false;
                    }
                  }}
                  submitter={{
                    searchConfig: {
                      submitText: '保存',
                    },
                    render: (_, doms) => {
                      return [
                        selectedKey?.startsWith('department.') ? (
                          <ModalForm
                            key="createPosition"
                            title="添加岗位"
                            modalProps={{
                              destroyOnHidden: true,
                            }}
                            trigger={(
                              <Button
                                key="createPosition"
                                icon={<Icon icon="lucide:plus" />}
                              >
                                添加岗位
                              </Button>
                            )}
                            onFinish={async (values) => {
                              let resp = await Api.dashboard.core.company.structure.createPosition(selectedKey?.replace('department.', ''), values as any);
                              if (resp.code === 200) {
                                message.success('添加岗位成功');
                                departments.refetch();
                                return true;
                              }
                              message.error(`添加岗位失败: ${resp.msg}`);
                              return false;
                            }}
                          >
                            <BetaSchemaForm
                              layoutType="Embed"
                              columns={editPositionSchema}
                            />
                          </ModalForm>
                        ) : undefined,
                        ...doms,
                        <Popconfirm
                          title={'确定要删除吗？'}
                          onConfirm={async () => {
                            let [type, id] = selectedKey.split('.');
                            if (type === 'department') {
                              let resp = await Api.dashboard.core.company.structure.deleteDepartment(id);
                              if (resp.code === 200) {
                                message.success('删除部门成功');
                                departments.refetch();
                                setSelectedKey(undefined);
                              } else {
                                message.error(`删除部门失败: ${resp.msg}`);
                              }
                            } else if (type === 'position') {
                              let resp = await Api.dashboard.core.company.structure.deletePosition(id);
                              if (resp.code === 200) {
                                message.success('删除岗位成功');
                                departments.refetch();
                                setSelectedKey(undefined);
                              } else {
                                message.error(`删除岗位失败: ${resp.msg}`);
                              }
                            }
                          }}
                          okText="删除"
                          okButtonProps={{
                            danger: true,
                          }}
                        >
                          <Button
                            key="delete"
                            danger
                          >
                            删除
                          </Button>
                        </Popconfirm>,
                      ];
                    },
                  }}
                >
                  <BetaSchemaForm
                    layoutType="Embed"
                    columns={selectedKey?.startsWith('department.') ? editDepartmentSchema(selectedKey.replace('department.', '')) : editPositionSchema}
                  />
                </ProForm>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
