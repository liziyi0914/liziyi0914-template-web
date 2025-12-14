import React, {type PropsWithChildren, useState} from "react";
import {Button, Dropdown, Modal} from "antd";
import {PageContainer, ProLayout} from "@ant-design/pro-components";
import {Icon} from "@iconify/react";
import {Link, useLocation, useNavigate} from "@tanstack/react-router";
import {useAtomValue} from "jotai";
import {LoginState} from "@/routes/dashboard.tsx";
import {Api} from "@/lib/api.ts";
import {Toast} from "antd-mobile";
import * as jose from "jose";

// const Component: React.FC<PropsWithChildren<{
// }>> = (props) => {
//   return (
//     <div className="h-screen overflow-hidden">
//       <div className="h-16 bg-[#005398] flex items-center px-3">
//         <div className="grow text-white text-xl select-none">
//           交通运输企业安全生产管理系统
//         </div>
//         <div>
//         </div>
//       </div>
//       <div className="h-full flex">
//         <div className="w-[256px] bg-[#001529] overflow-y-auto">
//           <Menu
//             theme='dark'
//             // onClick={onClick}
//             style={{ width: 256 }}
//             defaultOpenKeys={['sub1']}
//             // selectedKeys={[current]}
//             mode="inline"
//             items={items}
//           />
//         </div>
//         <div className="grow w-0 overflow-auto">
//           {props.children}
//           <div>
//             <div>123</div>
//             {'a'.repeat(100).split('').map((item, index) => {
//               return (
//                 <div key={index}>{item}</div>
//               );
//             })}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

const Component: React.FC<PropsWithChildren<{
}>> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const loginState = useAtomValue(LoginState);

  const [companies, setCompanies] = useState<string[]>();

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
                let toast = Toast.show({
                  content: '登录中...',
                  icon: 'loading',
                  duration: 0,
                })

                let resp = await Api.auth.login(undefined, undefined, company);

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
              {`${jose.decodeJwt(company)?.['companyName']??'-'}`}
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
          routes: [
            {
              path: '/dashboard/home',
              name: '首页',
              icon: <Icon icon="icon-park-outline:home" />,
            },
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
              ],
            },
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
          ],
        }}
        menu={{
          // collapsedShowGroupTitle: true,
        }}
        layout="mix"
        fixSiderbar={true}
        actionsRender={() => {
          return [
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
                        })
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
          return (
            <Link to={item.path}>
              {dom}
            </Link>
          );
        }}
      >
        <PageContainer>
          {props.children}
        </PageContainer>
      </ProLayout>
    </div>
  );
}

export default Component;
