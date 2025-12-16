import { Icon } from '@iconify/react';
import { useNavigate } from '@tanstack/react-router';
import { NavBar, TabBar } from 'antd-mobile';
import { atom, useAtomValue } from 'jotai';
import type React from 'react';
import type { PropsWithChildren } from 'react';

export type MainFrameworkAtom = {
  tabBarVisible: boolean;
  activeTab: 'home' | 'training' | 'todo' | 'user';

  navbarVisible: boolean;
  navbarTitle: string;
  navbarBackVisible: boolean;
  navbarBackOnClick: () => void;
};

export const mainAtom = atom<MainFrameworkAtom>({
  tabBarVisible: false,
  activeTab: 'home',

  navbarVisible: false,
  navbarTitle: '',
  navbarBackVisible: false,
  navbarBackOnClick: () => {},
});

const Component: React.FC<PropsWithChildren<{}>> = (props) => {
  const navigate = useNavigate();
  const frameworkState = useAtomValue(mainAtom);

  return (
    <div className="flex justify-center bg-blue-100">
      <div className="max-w-xl w-screen h-screen flex flex-col shadow-lg bg-white">
        {frameworkState.navbarVisible && (
          <div className="border-0 border-b border-gray-200">
            <NavBar
              back={frameworkState.navbarBackVisible ? '' : null}
              onBack={() => {
                frameworkState.navbarBackOnClick?.();
              }}
            >
              {frameworkState.navbarTitle}
            </NavBar>
          </div>
        )}
        <div className="grow overflow-y-auto h-0">{props.children}</div>
        {frameworkState.tabBarVisible && (
          <div className="border-0 border-t border-gray-200">
            <TabBar safeArea activeKey={frameworkState.activeTab}>
              <TabBar.Item
                key="home"
                title="首页"
                icon={<Icon icon="material-symbols:home" />}
                onClick={() => {
                  navigate({
                    to: '/',
                  });
                }}
              />
              <TabBar.Item
                key="training"
                title="培训"
                icon={<Icon icon="ic:round-school" />}
                onClick={() => {
                  navigate({
                    to: '/training',
                  });
                }}
              />
              <TabBar.Item
                key="todo"
                title="待办"
                icon={<Icon icon="material-symbols:event-list-outline" />}
                onClick={() => {
                  navigate({
                    to: '/todo',
                  });
                }}
              />
              <TabBar.Item
                key="user"
                title="个人中心"
                icon={<Icon icon="material-symbols:person" />}
                onClick={() => {
                  navigate({
                    to: '/user',
                  });
                }}
              />
            </TabBar>
          </div>
        )}
      </div>
    </div>
  );
};

export default Component;
