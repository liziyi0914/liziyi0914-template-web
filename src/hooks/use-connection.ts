import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import {
  type ConnectionInfo,
  connect,
  disconnect,
  getConnectionInfo,
  INITIAL_CONNECTION_INFO,
  onConnectionChange,
} from '@/lib/platform-api';

const connectionAtom = atom<ConnectionInfo>(INITIAL_CONNECTION_INFO);

/**
 * 连接由 Rust 在启动时自动建立，前端只负责订阅与展示。
 * 首屏先 invoke 一次拿当前值，否则要等下一次状态变化才有内容。
 */
export function useConnection() {
  const [info, setInfo] = useAtom(connectionAtom);

  useEffect(() => {
    void getConnectionInfo().then(setInfo);
    return onConnectionChange(setInfo);
  }, [setInfo]);

  return { info, reconnect: connect, disconnect };
}
