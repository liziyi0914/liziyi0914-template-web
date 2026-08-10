import { ConnectionDetails } from '@/components/connection-details';
import { ConnectionStatusCard } from '@/components/connection-status-card';
import { LogPanel } from '@/components/log-panel';
import { ServerConfigForm } from '@/components/server-config-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnection } from '@/hooks/use-connection';
import { useSaveServerConfig } from '@/hooks/use-save-server-config';
import { useServerConfig } from '@/hooks/use-server-config';
import { isConfigComplete, serverUrl } from '@/lib/platform-api';

export function DesktopHome() {
  const { config, loaded } = useServerConfig();
  const { info, reconnect } = useConnection();
  const handleSubmit = useSaveServerConfig();

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">GDUFE Classroom</h1>
        <p className="text-sm text-muted-foreground">
          大屏 APP 端。关闭窗口后应用会驻留在系统托盘，可从托盘菜单重新打开。
        </p>
      </header>

      <ConnectionStatusCard
        info={info}
        serverUrl={isConfigComplete(config) ? serverUrl(config) : null}
        onReconnect={reconnect}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ConnectionDetails info={info} />
        {loaded ? (
          <ServerConfigForm initialConfig={config} onSubmit={handleSubmit} />
        ) : (
          <Skeleton className="h-96 w-full rounded-xl" />
        )}
      </div>

      <LogPanel />
    </main>
  );
}
