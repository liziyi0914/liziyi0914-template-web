import { atom, useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { loadServerConfig, saveServerConfig } from '@/lib/config/store';
import { EMPTY_SERVER_CONFIG, type ServerConfig } from '@/lib/connection/types';

const serverConfigAtom = atom<ServerConfig>(EMPTY_SERVER_CONFIG);
const configLoadedAtom = atom(false);

/** 配置只在应用生命周期内读取一次，组件重挂载不应重复读盘 */
let didLoad = false;

export function useServerConfig() {
  const [config, setConfig] = useAtom(serverConfigAtom);
  const [loaded, setLoaded] = useAtom(configLoadedAtom);

  useEffect(() => {
    if (didLoad) return;
    didLoad = true;

    void loadServerConfig().then((stored) => {
      setConfig(stored);
      setLoaded(true);
    });
  }, [setConfig, setLoaded]);

  const save = useCallback(
    async (next: ServerConfig) => {
      setConfig(next);
      await saveServerConfig(next);
    },
    [setConfig],
  );

  return { config, loaded, save };
}
