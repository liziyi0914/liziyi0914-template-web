import { useCallback, useState } from 'react';
import {
  type ConfigValidationErrors,
  type ServerConfig,
  validateServerConfig,
} from '@/lib/connection/types';

/** 表单草稿与校验，PC 端与移动端两套 UI 共用同一份逻辑 */
export function useServerConfigDraft(
  initialConfig: ServerConfig,
  onSubmit: (config: ServerConfig) => void,
) {
  const [draft, setDraft] = useState(initialConfig);
  const [errors, setErrors] = useState<ConfigValidationErrors>({});

  const patch = useCallback((partial: Partial<ServerConfig>) => {
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const found = validateServerConfig(draft);
      setErrors(found);

      if (Object.keys(found).length === 0) {
        onSubmit(draft);
      }
    },
    [draft, onSubmit],
  );

  return { draft, errors, patch, submit };
}
