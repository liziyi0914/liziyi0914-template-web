import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ConnectionDetails } from '@/components/connection-details';
import { ConnectionStatusCard } from '@/components/connection-status-card';
import { ServerConfigForm } from '@/components/server-config-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnection } from '@/hooks/use-connection';
import { useServerConfig } from '@/hooks/use-server-config';
import {
  isConfigComplete,
  type ServerConfig,
  serverUrl,
} from '@/lib/connection/types';

export const Route = createFileRoute('/')({
  component: MainWindow,
});

function MainWindow() {
  const { config, loaded, save } = useServerConfig();
  const { info, connect, reconnect, simulateFailure } = useConnection();

  const handleSubmit = async (next: ServerConfig) => {
    await save(next);
    connect(next);
    toast.success('配置已保存', { description: `正在连接 ${serverUrl(next)}` });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">GDUFE Classroom</h1>
        <p className="text-sm text-muted-foreground">
          桌面端客户端。关闭窗口后应用会驻留在系统托盘，可从托盘菜单重新打开。
        </p>
      </header>

      <ConnectionStatusCard
        info={info}
        serverUrl={isConfigComplete(config) ? serverUrl(config) : null}
        onReconnect={reconnect}
        onSimulateFailure={simulateFailure}
      />

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-2">
        <ConnectionDetails info={info} />
        {loaded ? (
          <ServerConfigForm initialConfig={config} onSubmit={handleSubmit} />
        ) : (
          <Skeleton className="h-96 w-full rounded-xl" />
        )}
      </div>
    </main>
  );
}
