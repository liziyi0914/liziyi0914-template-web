import { PageContainer, ProLayout } from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Button, Card, Dropdown, Modal } from 'antd';
import { Toast } from 'antd-mobile';
import * as jose from 'jose';
import { useAtomValue } from 'jotai';
import { useTheme } from 'next-themes';
import React, { type PropsWithChildren, useMemo, useState } from 'react';
import { Api } from '@/lib/api.ts';
import { LoginState } from '@/routes/dashboard.tsx';

const Component: React.FC<PropsWithChildren<{}>> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const loginState = useAtomValue(LoginState);
  const { theme, setTheme } = useTheme();

  const [companies, setCompanies] = useState<string[]>();

  const menu = useMemo(() => {
    return [
      {
        path: '/dashboard/home',
        name: '首页',
        icon: <Icon icon="icon-park-outline:home" />,
      },
      ...(loginState?.companyName === '系统管理员'
        ? [
            {
              path: '/dashboard/system',
              name: '系统管理',
              icon: <Icon icon="icon-park-outline:setting-two" />,
              routes: [
                {
                  path: 'company',
                  name: '企业',
                },
                {
                  path: 'user',
                  name: '用户',
                },
                {
                  path: 'template',
                  name: '模板',
                },
              ],
            },
          ]
        : []),
      {
        path: '/dashboard/core',
        name: '企业信息',
        icon: <Icon icon="icon-park-outline:building-one" />,
        routes: [
          {
            path: 'company',
            name: '企业管理',
            routes: [
              {
                path: 'info',
                name: '基本信息',
              },
              {
                path: 'structure',
                name: '组织架构',
              },
              {
                path: 'assets',
                name: '资源库',
              },
            ],
          },
          {
            path: 'vehicle',
            name: '车辆管理',
          },
          {
            path: 'employee',
            name: '人员管理',
            routes: [
              {
                path: 'document',
                name: '人员档案',
              },
              {
                path: 'mind',
                name: '心理测评',
              },
            ],
          },
          {
            path: 'finance',
            name: '安全生产费用',
          },
        ],
      },
    ];
  }, [loginState]);

  return (
    <div className="h-screen">
      <Modal
        open={!!companies}
        title="切换企业"
        destroyOnHidden
        footer={false}
        onCancel={() => {
          setCompanies(undefined);
        }}
      >
        <div className="flex flex-col gap-y-3">
          {companies?.map((company) => (
            <Button
              key={company}
              block
              size="large"
              onClick={async () => {
                const toast = Toast.show({
                  content: '登录中...',
                  icon: 'loading',
                  duration: 0,
                });

                const resp = await Api.auth.login(
                  undefined,
                  undefined,
                  company,
                );

                toast.close();

                if (resp.code === 200) {
                  Toast.show({
                    content: '登录成功',
                  });
                  setCompanies(undefined);
                  navigate({
                    to: '/dashboard/home',
                    reloadDocument: true,
                  });
                } else {
                  Toast.show({
                    content: '登录失败',
                  });
                  setCompanies(undefined);
                }
              }}
            >
              {`${jose.decodeJwt(company)?.['companyName'] ?? '-'}`}
            </Button>
          ))}
        </div>
      </Modal>
      <ProLayout
        title="交通运输企业安全生产管理系统"
        location={{
          pathname: location.href,
        }}
        route={{
          path: '/dashboard',
          routes: menu,
        }}
        menu={
          {
            // collapsedShowGroupTitle: true,
          }
        }
        layout="mix"
        fixSiderbar={true}
        actionsRender={() => {
          return [
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'system',
                    icon: <Icon icon="icon-park-outline:dark-mode" />,
                    label: '跟随系统',
                    onClick: () => {
                      setTheme('system');
                    },
                  },
                  {
                    key: 'light',
                    icon: (
                      <Icon icon="material-symbols:light-mode-outline-rounded" />
                    ),
                    label: '白天模式',
                    onClick: () => {
                      setTheme('light');
                    },
                  },
                  {
                    key: 'dark',
                    icon: (
                      <Icon icon="material-symbols:dark-mode-outline-rounded" />
                    ),
                    label: '黑夜模式',
                    onClick: () => {
                      setTheme('dark');
                    },
                  },
                ],
              }}
            >
              <Button
                type="text"
                icon={
                  <Icon
                    icon={
                      theme === 'system'
                        ? 'icon-park-outline:dark-mode'
                        : theme === 'light'
                          ? 'material-symbols:light-mode-outline-rounded'
                          : 'material-symbols:dark-mode-outline-rounded'
                    }
                  />
                }
              />
            </Dropdown>,
          ];
        }}
        avatarProps={{
          src: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
          size: 'small',
          title: (
            <div className="text-sm">
              <div>{loginState?.name}</div>
              <div>{loginState?.companyName}</div>
            </div>
          ),
          render: (_props, dom) => {
            return (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'gotoHome',
                      icon: <Icon icon="ant-design:home-outlined" />,
                      label: '返回主站',
                      onClick: () => {
                        navigate({
                          to: '/',
                        });
                      },
                    },
                    {
                      key: 'changeCompany',
                      icon: <Icon icon="basil:exchange-outline" />,
                      label: '切换企业',
                      onClick: () => {
                        Api.auth.login().then((resp) => {
                          if (resp.code === 200) {
                            if ((resp.data?.length ?? 0) > 0) {
                              setCompanies(resp.data ?? undefined);
                            } else {
                              Toast.show({
                                content: '没有其它可用的企业',
                              });
                            }
                          }
                        });
                      },
                    },
                    {
                      type: 'divider',
                    },
                    {
                      key: 'logout',
                      icon: <Icon icon="ic:outline-log-out" />,
                      label: '退出登录',
                      danger: true,
                      onClick: async () => {
                        await Api.auth.logout();
                        navigate({
                          to: '/login',
                        });
                      },
                    },
                  ],
                }}
              >
                {dom}
              </Dropdown>
            );
          },
        }}
        menuItemRender={(item, dom) => {
          return <Link to={item.path}>{dom}</Link>;
        }}
      >
        <div className="grow h-0 overflow-y-auto">
          <PageContainer>
            <Card>{props.children}</Card>
          </PageContainer>
        </div>
      </ProLayout>
    </div>
  );
};

export default Component;
