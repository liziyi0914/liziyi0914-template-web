import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import {
  type ConfigValidationErrors,
  type ServerConfig,
  serverUrl,
} from '@/lib/connection/types';

/**
 * 单个配置项各自成组件，PC 端把它们平铺在一张卡片里，
 * 移动端则按语义拆进「服务器」「凭据」两段，避免两套 UI 各写一份字段。
 */
export interface ServerConfigFieldProps {
  draft: ServerConfig;
  errors: ConfigValidationErrors;
  onPatch: (partial: Partial<ServerConfig>) => void;
}

export function HostField({ draft, errors, onPatch }: ServerConfigFieldProps) {
  return (
    <Field data-invalid={errors.host ? true : undefined}>
      <FieldLabel htmlFor="host">服务器地址</FieldLabel>
      <Input
        id="host"
        value={draft.host}
        placeholder="192.168.1.10 或 classroom.gdufe.edu.cn"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={errors.host ? true : undefined}
        onChange={(event) => onPatch({ host: event.target.value })}
      />
      <FieldError>{errors.host}</FieldError>
    </Field>
  );
}

export function PortField({ draft, errors, onPatch }: ServerConfigFieldProps) {
  return (
    <Field data-invalid={errors.port ? true : undefined}>
      <FieldLabel htmlFor="port">端口</FieldLabel>
      <Input
        id="port"
        type="number"
        inputMode="numeric"
        min={1}
        max={65535}
        value={Number.isNaN(draft.port) ? '' : draft.port}
        aria-invalid={errors.port ? true : undefined}
        onChange={(event) =>
          onPatch({ port: Number.parseInt(event.target.value, 10) })
        }
      />
      <FieldError>{errors.port}</FieldError>
    </Field>
  );
}

export function ClientIdField({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  return (
    <Field data-invalid={errors.clientId ? true : undefined}>
      <FieldLabel htmlFor="clientId">ClientId</FieldLabel>
      <Input
        id="clientId"
        value={draft.clientId}
        placeholder="在服务器注册的客户端标识"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={errors.clientId ? true : undefined}
        onChange={(event) => onPatch({ clientId: event.target.value })}
      />
      <FieldError>{errors.clientId}</FieldError>
    </Field>
  );
}

export function ClientSecretField({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={errors.clientSecret ? true : undefined}>
      <FieldLabel htmlFor="clientSecret">ClientSecret</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="clientSecret"
          type={visible ? 'text' : 'password'}
          value={draft.clientSecret}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.clientSecret ? true : undefined}
          onChange={(event) => onPatch({ clientSecret: event.target.value })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? '隐藏密钥' : '显示密钥'}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{errors.clientSecret}</FieldError>
    </Field>
  );
}

export function SecureField({ draft, onPatch }: ServerConfigFieldProps) {
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor="secure">使用 TLS 加密</FieldLabel>
      <Switch
        id="secure"
        checked={draft.secure}
        onCheckedChange={(checked) => onPatch({ secure: checked })}
      />
    </Field>
  );
}

export function TargetUrlDescription({ draft }: { draft: ServerConfig }) {
  return (
    <FieldDescription>
      将连接到 <span className="font-mono">{serverUrl(draft)}</span>
    </FieldDescription>
  );
}

/** PC 端的完整字段列表 */
export function ServerConfigFields(props: ServerConfigFieldProps) {
  return (
    <FieldGroup>
      <HostField {...props} />
      <PortField {...props} />
      <ClientIdField {...props} />
      <ClientSecretField {...props} />
      <SecureField {...props} />
      <TargetUrlDescription draft={props.draft} />
    </FieldGroup>
  );
}
