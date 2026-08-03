import { Eye, EyeOff, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  validateServerConfig,
} from '@/lib/connection/types';

interface ServerConfigFormProps {
  initialConfig: ServerConfig;
  onSubmit: (config: ServerConfig) => void;
}

export function ServerConfigForm({
  initialConfig,
  onSubmit,
}: ServerConfigFormProps) {
  const [draft, setDraft] = useState(initialConfig);
  const [errors, setErrors] = useState<ConfigValidationErrors>({});
  const [secretVisible, setSecretVisible] = useState(false);

  const patch = (partial: Partial<ServerConfig>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const found = validateServerConfig(draft);
    setErrors(found);

    if (Object.keys(found).length === 0) {
      onSubmit(draft);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>服务器配置</CardTitle>
          <CardDescription>保存后立即以新参数重新建立连接</CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field data-invalid={errors.host ? true : undefined}>
              <FieldLabel htmlFor="host">服务器地址</FieldLabel>
              <Input
                id="host"
                value={draft.host}
                placeholder="192.168.1.10 或 classroom.gdufe.edu.cn"
                aria-invalid={errors.host ? true : undefined}
                onChange={(event) => patch({ host: event.target.value })}
              />
              <FieldError>{errors.host}</FieldError>
            </Field>

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
                  patch({ port: Number.parseInt(event.target.value, 10) })
                }
              />
              <FieldError>{errors.port}</FieldError>
            </Field>

            <Field data-invalid={errors.clientId ? true : undefined}>
              <FieldLabel htmlFor="clientId">ClientId</FieldLabel>
              <Input
                id="clientId"
                value={draft.clientId}
                placeholder="桌面端在服务器注册的标识"
                aria-invalid={errors.clientId ? true : undefined}
                onChange={(event) => patch({ clientId: event.target.value })}
              />
              <FieldError>{errors.clientId}</FieldError>
            </Field>

            <Field data-invalid={errors.clientSecret ? true : undefined}>
              <FieldLabel htmlFor="clientSecret">ClientSecret</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="clientSecret"
                  type={secretVisible ? 'text' : 'password'}
                  value={draft.clientSecret}
                  autoComplete="off"
                  aria-invalid={errors.clientSecret ? true : undefined}
                  onChange={(event) =>
                    patch({ clientSecret: event.target.value })
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={secretVisible ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setSecretVisible((visible) => !visible)}
                  >
                    {secretVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError>{errors.clientSecret}</FieldError>
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="secure">使用 TLS 加密</FieldLabel>
              <Switch
                id="secure"
                checked={draft.secure}
                onCheckedChange={(checked) => patch({ secure: checked })}
              />
            </Field>

            <FieldDescription>
              将连接到 <span className="font-mono">{serverUrl(draft)}</span>
            </FieldDescription>
          </FieldGroup>
        </CardContent>

        <CardFooter>
          <Button type="submit">
            <Save data-icon="inline-start" />
            保存并连接
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
