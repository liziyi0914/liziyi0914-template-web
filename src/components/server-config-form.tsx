import { Save } from 'lucide-react';
import { ServerConfigFields } from '@/components/server-config-fields';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useServerConfigDraft } from '@/hooks/use-server-config-draft';
import type { RoleConfig } from '@/lib/platform-api';

interface ServerConfigFormProps {
  initialConfig: RoleConfig;
  onSubmit: (config: RoleConfig) => void;
}

/** PC 端表单：与连接详情并排放在主窗口里 */
export function ServerConfigForm({
  initialConfig,
  onSubmit,
}: ServerConfigFormProps) {
  const { draft, errors, patch, submit } = useServerConfigDraft(
    initialConfig,
    onSubmit,
  );

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>服务器配置</CardTitle>
          <CardDescription>保存后立即以新参数重新建立连接</CardDescription>
        </CardHeader>

        <CardContent>
          <ServerConfigFields draft={draft} errors={errors} onPatch={patch} />
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
