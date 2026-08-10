import { useCallback, useState } from 'react';
import {
  type ConfigValidationErrors,
  type RoleConfig,
  validateConfig,
} from '@/lib/platform-api';

/** 表单草稿与校验，PC 端与移动端两套 UI 共用同一份逻辑 */
export function useServerConfigDraft(
  initialConfig: RoleConfig,
  onSubmit: (config: RoleConfig) => void,
) {
  const [draft, setDraft] = useState(initialConfig);
  const [errors, setErrors] = useState<ConfigValidationErrors>({});

  const patch = useCallback((partial: Partial<RoleConfig>) => {
    setDraft((current) => ({ ...current, ...partial }) as RoleConfig);
  }, []);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const found = validateConfig(draft);
      setErrors(found);

      if (Object.keys(found).length === 0) {
        onSubmit(draft);
      }
    },
    [draft, onSubmit],
  );

  return { draft, errors, patch, submit };
}
