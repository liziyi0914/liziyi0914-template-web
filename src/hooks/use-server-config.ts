import { atom, useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { IS_ANDROID } from '@/lib/platform';
import {
  EMPTY_ROBOT_CONFIG,
  EMPTY_SCREEN_APP_CONFIG,
  getConfig,
  type RoleConfig,
  setConfig,
} from '@/lib/platform-api';

const initial: RoleConfig = IS_ANDROID
  ? EMPTY_ROBOT_CONFIG
  : EMPTY_SCREEN_APP_CONFIG;

const configAtom = atom<RoleConfig>(initial);
const loadedAtom = atom(false);

/** 配置只在应用生命周期内读取一次，组件重挂载不应重复走 IPC */
let didLoad = false;

export function useServerConfig() {
  const [config, setLocal] = useAtom(configAtom);
  const [loaded, setLoaded] = useAtom(loadedAtom);

  useEffect(() => {
    if (didLoad) return;
    didLoad = true;

    void getConfig().then((stored) => {
      setLocal(stored);
      setLoaded(true);
    });
  }, [setLocal, setLoaded]);

  /** 落盘由 Rust 完成，保存后原生侧会立即以新参数重连 */
  const save = useCallback(
    async (next: RoleConfig) => {
      setLocal(next);
      await setConfig(next);
    },
    [setLocal],
  );

  return { config, loaded, save };
}
