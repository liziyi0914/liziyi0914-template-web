import { useCallback, useEffect, useSyncExternalStore } from 'react';
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

export function useConnection() {
  const { config, loaded } = useServerConfig();
  const info = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!loaded || didAutoConnect) return;
    didAutoConnect = true;

    if (isConfigComplete(config)) {
      client.connect(config);
    }
  }, [loaded, config]);

  useEffect(() => {
    publishTrayState(info);
  }, [info]);

  useEffect(() => onTrayReconnect(() => client.reconnect()), []);

  const connect = useCallback((next: ServerConfig) => {
    client.connect(next);
  }, []);

  const reconnect = useCallback(() => {
    client.reconnect();
  }, []);

  const disconnect = useCallback(() => {
    client.disconnect();
  }, []);

  const simulateFailure = useCallback(() => {
    client.simulateFailure();
  }, []);

  return { info, connect, reconnect, disconnect, simulateFailure };
}
