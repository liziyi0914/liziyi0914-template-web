import {
  BetaSchemaForm,
  ModalForm,
  ProForm,
  type ProFormColumnsType,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  App,
  Button,
  Divider,
  Modal,
  Popconfirm,
  Result,
  Spin,
  Tree,
  type TreeDataNode,
} from 'antd';
import html2canvas from 'html2canvas-pro';
import React, {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Api } from '@/lib/api.ts';
import { convertDepartmentsToTreeData } from '@/lib/functions.tsx';
import {useAtomValue} from "jotai";
import {LoginState} from "@/routes/dashboard.tsx";

export const Route = createFileRoute('/dashboard/core/company/structure')({
  component: RouteComponent,
});

// @ts-expect-error
const editDepartmentSchema: (id?: string) => Array<ProFormColumnsType> = (
  id?: string,
) => [
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

type GraphNodeType = {
  id?: string;
  name: string;
  items?: Array<GraphNodeType>;
  hiddenLeft?: boolean;
  hiddenRight?: boolean;
  hiddenAll?: boolean;
};

const GraphNode: React.FC<PropsWithChildren<GraphNodeType>> = (props) => {
  const [expand, setExpand] = useState(true);

  const before = useMemo(() => {
    if (props.hiddenAll) {
      return '';
    }
    if (props.hiddenLeft) {
      return 'before:border-r before:border-gray-500 before:absolute before:left-0 before:-top-4 before:w-1/2 before:h-4';
    }
    return 'before:border-t before:border-r before:border-gray-500 before:absolute before:left-0 before:-top-4 before:w-1/2 before:h-4';
  }, [props]);

  const after = useMemo(() => {
    if (props.hiddenAll) {
      return '';
    }
    if (props.hiddenRight) {
      return 'after:border-l after:border-gray-500 after:absolute after:right-0 after:-top-4 after:w-1/2 after:h-4';
    }
    return 'after:border-t after:border-l after:border-gray-500 after:absolute after:right-0 after:-top-4 after:w-1/2 after:h-4';
  }, [props]);

  const bg = useMemo(() => {
    if (!props.id) {
      return 'bg-violet-600';
    }

    if (props.id.startsWith('department.')) {
      return 'bg-green-600';
    } else if (props.id.startsWith('position.')) {
      return 'bg-blue-600';
    } else if (props.id.startsWith('employee.')) {
      return 'bg-yellow-600';
    }

    return 'bg-gray-600';
  }, [props]);

  const bgHover = useMemo(() => {
    if (!props.id) {
      return 'hover:bg-violet-600/90';
    }

    if (props.id.startsWith('department.')) {
      return 'hover:bg-green-600/90';
    } else if (props.id.startsWith('position.')) {
      return 'hover:bg-blue-600/90';
    } else if (props.id.startsWith('employee.')) {
      return 'hover:bg-yellow-600/90';
    }

    return 'hover:bg-gray-600/90';
  }, [props]);

  return (
    <div className="inline-block relative px-1.5">
      <div className="flex justify-center">
        <div
          className={`inline-block ${bg} text-white px-4 py-2 shadow-md rounded-md ${(props.items?.length ?? 0) > 0 ? `cursor-pointer ${bgHover}` : ''} select-none`}
          onClick={() => {
            setExpand(!expand);
          }}
        >
          {props.name}
        </div>
      </div>

      {(props.items?.length ?? 0) > 0 && !expand && (
        <div className="absolute left-1/2 pt-1 -translate-x-1/2 text-lg text-gray-400">
          <Icon icon="prime:plus-circle" />
        </div>
      )}

      {(props.items?.length ?? 0) > 0 && expand && (
        <div className="absolute left-1/2 -translate-x-1/2 border h-4 border-gray-500"></div>
      )}

      <div className={`pt-8 flex ${before} ${after}`}>
        {expand && (
          <>
            {props.items?.map((item, index) => (
              <GraphNode
                key={index}
                id={item.id}
                name={item.name}
                items={item.items}
                hiddenLeft={index === 0}
                hiddenRight={index === props.items!.length - 1}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

const StructureGraph: React.FC<{
  companyName: string;
  tree: TreeDataNode[];
}> = (props) => {
  const divRef = useRef<HTMLDivElement>(null);

  const mapTree = async (tree: TreeDataNode[]) => {
    let list: GraphNodeType[] = [];

    for (let item of tree) {
      let children = item.children
        ? await mapTree(item.children)
        : [];

      if (`${item.key}`.startsWith('position.')) {
        let resp = await Api.dashboard.core.company.structure.listPositionEmployees(`${item.key}`.substring('position.'.length));
        if (resp.code === 200 && resp.data) {
          children = [
            ...children,
            ...resp.data.map((item) => {
              return {
                id: `employee.${item.id}`,
                name: item.name ?? item.phone,
              };
            }),
          ];
        }
      }

      list.push({
        id: item.key as string,
        name: item.title as string,
        items: children,
      });
    }

    return list;
  };

  const tree = useQuery({
    queryKey: ['dashboard.core.company.structure.tree'],
    queryFn: async () => {
      return await mapTree(props.tree);
    },
    refetchOnWindowFocus: false,
  });

  return (
    <div>
      {tree.isLoading && (
        <Spin spinning tip="加载中">
          <div className="h-32" />
        </Spin>
      )}
      {tree.isSuccess && tree.data && (
        <>
          <div>
            <div className="flex gap-x-3">
              <Button
                onClick={() => {
                  if (divRef.current) {
                    html2canvas(divRef.current, {
                      useCORS: true,
                      scale: 10,
                    }).then((canvas) => {
                      const image = canvas.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.download = 'structure.png';
                      link.href = image;
                      link.click();
                      link.remove();
                    });
                  }
                }}
              >
                导出图片
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto text-center">
              <div className="inline-block text-start p-3" ref={divRef}>
                <GraphNode
                  name={props.companyName}
                  hiddenAll={true}
                  items={tree.data}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function RouteComponent() {
  const { message } = App.useApp();
  const loginState = useAtomValue(LoginState);
  const departments = useQuery({
    queryKey: ['dashboard.core.company.structure'],
    queryFn: async () => {
      const resp = await Api.dashboard.core.company.structure.list();
      if (resp.code === 200 && resp.data) {
        return resp.data;
      }
      throw new Error(`获取部门列表失败: ${resp.data}`);
    },
  });

  const [form] = ProForm.useForm();

  const tree = useMemo<TreeDataNode[]>(() => {
    if (!departments.isSuccess || !departments.data) {
      return [];
    }

    const list = departments.data.departments;

    return convertDepartmentsToTreeData(list);
  }, [departments]);

  const [selectedKey, setSelectedKey] = useState<string>();
  const [openStructureModal, setOpenStructureModal] = useState(false);

  const initialValues = useMemo(() => {
    if (selectedKey && departments.isSuccess && departments.data) {
      const [type, id] = selectedKey.split('.');
      if (type === 'department') {
        const department = departments.data.departments.filter(
          (i) => i.id === id,
        )?.[0];
        if (department) {
          return {
            id: department.id,
            name: department.name,
            parent: department.parent,
            responsibilities: department.responsibilities,
          };
        }
      } else if (type === 'position') {
        const department = departments.data.departments.filter(
          (i) => (i.positions?.filter((j) => j.id === id).length ?? 0) > 0,
        )?.[0];
        if (department) {
          const position = department.positions?.filter(
            (i) => i.id === id,
          )?.[0];
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
          <Modal
            open={openStructureModal}
            title="架构图"
            destroyOnHidden
            width="80vw"
            footer={null}
            onCancel={() => {
              setOpenStructureModal(false);
            }}
          >
            <StructureGraph companyName={loginState?.companyName ?? ''} tree={tree} />
          </Modal>

          <div className="flex">
            <div className="w-72">
              <div className="pb-3 flex gap-x-2">
                <Button
                  onClick={() => {
                    setOpenStructureModal(true);
                  }}
                >
                  架构图
                </Button>
                <div className="grow"></div>
                <ModalForm
                  title="添加部门"
                  modalProps={{
                    destroyOnHidden: true,
                  }}
                  trigger={
                    <Button icon={<Icon icon="lucide:plus" />}>添加部门</Button>
                  }
                  onFinish={async (values) => {
                    const resp =
                      await Api.dashboard.core.company.structure.createDepartment(
                        values as any,
                      );
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
                <div className="text-center text-muted-foreground">
                  暂无部门
                </div>
              )}
            </div>
            <div>
              <Divider orientation="vertical" className="h-full!" />
            </div>
            <div className="grow">
              {!selectedKey && (
                <div className="text-center text-muted-foreground">
                  请选择部门或岗位
                </div>
              )}
              {selectedKey && (
                <ProForm
                  form={form}
                  initialValues={initialValues}
                  onFinish={async (values) => {
                    const [type, id] = selectedKey.split('.');
                    if (type === 'department') {
                      const resp =
                        await Api.dashboard.core.company.structure.updateDepartment(
                          id,
                          values as any,
                        );
                      if (resp.code === 200) {
                        message.success('保存成功');
                        departments.refetch();
                        return true;
                      }
                      message.error(`保存失败: ${resp.msg}`);
                      return false;
                    } else if (type === 'position') {
                      const resp =
                        await Api.dashboard.core.company.structure.updatePosition(
                          id,
                          values as any,
                        );
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
                            trigger={
                              <Button
                                key="createPosition"
                                icon={<Icon icon="lucide:plus" />}
                              >
                                添加岗位
                              </Button>
                            }
                            onFinish={async (values) => {
                              const resp =
                                await Api.dashboard.core.company.structure.createPosition(
                                  selectedKey?.replace('department.', ''),
                                  values as any,
                                );
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
                            const [type, id] = selectedKey.split('.');
                            if (type === 'department') {
                              const resp =
                                await Api.dashboard.core.company.structure.deleteDepartment(
                                  id,
                                );
                              if (resp.code === 200) {
                                message.success('删除部门成功');
                                departments.refetch();
                                setSelectedKey(undefined);
                              } else {
                                message.error(`删除部门失败: ${resp.msg}`);
                              }
                            } else if (type === 'position') {
                              const resp =
                                await Api.dashboard.core.company.structure.deletePosition(
                                  id,
                                );
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
                          <Button key="delete" danger>
                            删除
                          </Button>
                        </Popconfirm>,
                      ];
                    },
                  }}
                >
                  <BetaSchemaForm
                    layoutType="Embed"
                    columns={
                      selectedKey?.startsWith('department.')
                        ? editDepartmentSchema(
                            selectedKey.replace('department.', ''),
                          )
                        : editPositionSchema
                    }
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
