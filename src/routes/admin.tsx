import { ProLayout } from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { Avatar, Dropdown } from 'antd';
import { useMemo, useState } from 'react';

export interface MenuItem {
  name: string;
  path: string;
  icon: string;
}

export const Route = createFileRoute('/admin')({
  component: RouteComponent,
});

function RouteComponent() {
  const location = useLocation();
  const navigate = useNavigate();

  const [menu, setMenu] = useState<Array<MenuItem>>([]);

  const routes = useMemo(() => {
    return menu.map((i) => {
      if (i.icon) {
        return {
          ...i,
          icon: <Icon icon={i.icon as any} />,
        };
      } else {
        return i;
      }
    });
  }, [location, menu]);

  return (
    <ProLayout
      avatarProps={{
        src: <Avatar icon={<Icon icon="icon-park-outline:user" />} />,
        title: 'Steve',
        render: (_, dom) => {
          return (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    label: '退出登录',
                    danger: true,
                    onClick: async () => {},
                  },
                ],
              }}
            >
              {dom}
            </Dropdown>
          );
        },
      }}
      title="管理后台"
      logo={<Icon icon="fluent-color:shield-48" />}
      location={{
        pathname:
          location.pathname.split('/').length === 2
            ? `${location.pathname}/`
            : location.pathname,
      }}
      route={{
        path: '/',
        routes: routes,
      }}
      onMenuHeaderClick={() => {
        navigate({
          to: '/admin',
        });
      }}
      menuItemRender={(item, dom) => (
        <a
          onClick={() => {
            navigate({
              to: item.path,
            });
          }}
        >
          {dom}
        </a>
      )}
    >
      <Outlet />
    </ProLayout>
  );
}
