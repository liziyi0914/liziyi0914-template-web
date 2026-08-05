import { useEffect, useSyncExternalStore } from 'react';
import { useServerConfig } from '@/hooks/use-server-config';
import { getConnectionClient } from '@/lib/connection/mock-client';
import {
  onTrayReconnect,
  publishTrayState,
} from '@/lib/connection/tray-bridge';
import { isConfigComplete, type ServerConfig } from '@/lib/connection/types';

const client = getConnectionClient();

const subscribe = (listener: () => void) => client.subscribe(listener);
const getSnapshot = () => client.getSnapshot();

/** 自动重连只在应用启动时发生一次，之后由用户显式触发 */
let didAutoConnect = false;

/**
 * 连接的应用级生命周期，只在根路由调用一次。
 *
 * 放在根路由而不是某个页面里，是因为移动端首页不展示任何连接信息，
 * 启动时若停留在首页也必须把连接建起来。
 */
export function useConnectionBootstrap() {
  const { config, loaded } = useServerConfig();

  useEffect(() => {
    if (!loaded || didAutoConnect) return;
    didAutoConnect = true;

    if (isConfigComplete(config)) {
      client.connect(config);
    }
  }, [loaded, config]);

  // 直接订阅 client 而非经由 React 状态，托盘同步不必让整棵树随心跳重渲染
  useEffect(() => {
    publishTrayState(client.getSnapshot());
    return client.subscribe(publishTrayState);
  }, []);

  useEffect(() => onTrayReconnect(() => client.reconnect()), []);
}

/**
 * client 是模块级单例，操作入口与组件生命周期无关，因此不必包成 hook。
 * 只需要发起连接、不关心状态的调用方可以直接用它，避免多一份心跳订阅。
 */
export const connectionActions = {
  connect: (config: ServerConfig) => client.connect(config),
  reconnect: () => client.reconnect(),
  disconnect: () => client.disconnect(),
  // 刻意不透传参数：调用方常把它直接接在 onClick 上，转发会把事件对象当成错误文案
  simulateFailure: () => client.simulateFailure(),
};

/** 读取连接状态与操作入口，供需要展示连接信息的页面使用 */
export function useConnection() {
  const info = useSyncExternalStore(subscribe, getSnapshot);

  return { info, ...connectionActions };
}
