import { useNavigate } from '@tanstack/react-router';
import { Save } from 'lucide-react';
import { ConnectionDetails } from '@/components/connection-details';
import { ConnectionStatusCard } from '@/components/connection-status-card';
import { MobilePage } from '@/components/mobile/page';
import {
  ClientIdField,
  ClientSecretField,
  HostField,
  PortField,
  SecureField,
  TargetUrlDescription,
} from '@/components/server-config-fields';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnection } from '@/hooks/use-connection';
import { useSaveServerConfig } from '@/hooks/use-save-server-config';
import { useServerConfig } from '@/hooks/use-server-config';
import { useServerConfigDraft } from '@/hooks/use-server-config-draft';
import {
  isConfigComplete,
  type ServerConfig,
  serverUrl,
} from '@/lib/connection/types';

/** 保存按钮在应用栏里，靠 form 属性跨 DOM 层级关联到表单 */
const FORM_ID = 'server-config-form';

export function MobileSettings() {
  const { config, loaded } = useServerConfig();
  const { info, reconnect, simulateFailure } = useConnection();
  const navigate = useNavigate();
  const handleSubmit = useSaveServerConfig(() => navigate({ to: '/' }));

  return (
    <MobilePage
      title="设置"
      subtitle="连接状态与服务器参数"
      back
      actions={
        <Button type="submit" form={FORM_ID} disabled={!loaded}>
          <Save data-icon="inline-start" />
          保存
        </Button>
      }
    >
      <div className="flex flex-col gap-3 landscape:gap-4">
        <div className="grid items-start gap-3 landscape:gap-4 landscape:lg:grid-cols-2">
          <ConnectionStatusCard
            info={info}
            serverUrl={isConfigComplete(config) ? serverUrl(config) : null}
            unconfiguredHint="尚未配置服务器，请在下方填写连接参数"
            onReconnect={reconnect}
            onSimulateFailure={simulateFailure}
          />
          <ConnectionDetails info={info} />
        </div>

        {loaded ? (
          <SettingsForm initialConfig={config} onSubmit={handleSubmit} />
        ) : (
          <Skeleton className="h-96 w-full rounded-xl" />
        )}
      </div>
    </MobilePage>
  );
}

function SettingsForm({
  initialConfig,
  onSubmit,
}: {
  initialConfig: ServerConfig;
  onSubmit: (config: ServerConfig) => void;
}) {
  const { draft, errors, patch, submit } = useServerConfigDraft(
    initialConfig,
    onSubmit,
  );
  const fieldProps = { draft, errors, onPatch: patch };

  return (
    <form
      id={FORM_ID}
      onSubmit={submit}
      className="grid items-start gap-3 landscape:gap-4 landscape:lg:grid-cols-2"
    >
      <Card>
        <CardHeader>
          <CardTitle>服务器</CardTitle>
          <CardDescription>保存后立即以新参数重新建立连接</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <HostField {...fieldProps} />
            <PortField {...fieldProps} />
            <SecureField {...fieldProps} />
            <TargetUrlDescription draft={draft} />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>身份凭据</CardTitle>
          <CardDescription>由服务器为本客户端签发</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ClientIdField {...fieldProps} />
            <ClientSecretField {...fieldProps} />
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  );
}
