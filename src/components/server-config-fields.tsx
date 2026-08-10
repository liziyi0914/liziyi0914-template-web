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
  isScreenAppConfig,
  type RoleConfig,
  serverUrl,
} from '@/lib/platform-api';

/**
 * 单个配置项各自成组件，PC 端把它们平铺在一张卡片里，
 * 移动端则按语义拆进「服务器」「凭据」两段，避免两套 UI 各写一份字段。
 */
export interface ServerConfigFieldProps {
  draft: RoleConfig;
  errors: ConfigValidationErrors;
  onPatch: (partial: Partial<RoleConfig>) => void;
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

function SecretField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
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
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** 大屏 APP 端：app_key / app_secret 换票，外加 Chrome 路径与 kiosk */
export function ScreenAppFields({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  if (!isScreenAppConfig(draft)) return null;

  return (
    <>
      <Field data-invalid={errors.appKey ? true : undefined}>
        <FieldLabel htmlFor="appKey">AppKey</FieldLabel>
        <Input
          id="appKey"
          value={draft.appKey}
          placeholder="在平台注册的大屏标识"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.appKey ? true : undefined}
          onChange={(event) => onPatch({ appKey: event.target.value })}
        />
        <FieldError>{errors.appKey}</FieldError>
      </Field>

      <SecretField
        id="appSecret"
        label="AppSecret"
        value={draft.appSecret}
        error={errors.appSecret}
        onChange={(appSecret) => onPatch({ appSecret })}
      />

      <Field>
        <FieldLabel htmlFor="chromePath">Chrome 路径</FieldLabel>
        <Input
          id="chromePath"
          value={draft.chromePath ?? ''}
          placeholder="留空则自动探测"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) =>
            onPatch({ chromePath: event.target.value || null })
          }
        />
        <FieldDescription>
          macOS 可直接填 /Applications/Google Chrome.app
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <FieldLabel htmlFor="kiosk">全屏 kiosk 模式</FieldLabel>
        <Switch
          id="kiosk"
          checked={draft.kiosk}
          onCheckedChange={(kiosk) => onPatch({ kiosk })}
        />
      </Field>
    </>
  );
}

/** 机器人：Device Flow 用的设备编号与密钥 */
export function RobotFields({
  draft,
  errors,
  onPatch,
}: ServerConfigFieldProps) {
  if (isScreenAppConfig(draft)) return null;

  return (
    <>
      <Field data-invalid={errors.deviceNo ? true : undefined}>
        <FieldLabel htmlFor="deviceNo">设备编号</FieldLabel>
        <Input
          id="deviceNo"
          value={draft.deviceNo}
          placeholder="平台分配的 device_no"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.deviceNo ? true : undefined}
          onChange={(event) => onPatch({ deviceNo: event.target.value })}
        />
        <FieldError>{errors.deviceNo}</FieldError>
      </Field>

      <SecretField
        id="deviceSecret"
        label="设备密钥"
        value={draft.deviceSecret}
        error={errors.deviceSecret}
        onChange={(deviceSecret) => onPatch({ deviceSecret })}
      />
    </>
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

export function TargetUrlDescription({ draft }: { draft: RoleConfig }) {
  return (
    <FieldDescription>
      服务器地址 <span className="font-mono">{serverUrl(draft)}</span>
    </FieldDescription>
  );
}

/** 完整字段列表，按角色分化 */
export function ServerConfigFields(props: ServerConfigFieldProps) {
  return (
    <FieldGroup>
      <HostField {...props} />
      <PortField {...props} />
      <ScreenAppFields {...props} />
      <RobotFields {...props} />
      <SecureField {...props} />
      <TargetUrlDescription draft={props.draft} />
    </FieldGroup>
  );
}
