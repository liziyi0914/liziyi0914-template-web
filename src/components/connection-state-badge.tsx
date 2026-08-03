import { Badge } from '@/components/ui/badge';
import {
  CONNECTION_STATE_LABEL,
  type ConnectionState,
} from '@/lib/connection/types';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATE_STYLE: Record<
  ConnectionState,
  { variant: BadgeVariant; dot: string }
> = {
  idle: { variant: 'outline', dot: 'bg-muted-foreground' },
  connecting: { variant: 'secondary', dot: 'bg-primary animate-pulse' },
  connected: { variant: 'default', dot: 'bg-primary-foreground' },
  reconnecting: { variant: 'secondary', dot: 'bg-primary animate-pulse' },
  disconnected: { variant: 'outline', dot: 'bg-muted-foreground' },
  error: { variant: 'destructive', dot: 'bg-destructive' },
};

export function StateDot({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 rounded-full',
        STATE_STYLE[state].dot,
        className,
      )}
    />
  );
}

export function ConnectionStateBadge({ state }: { state: ConnectionState }) {
  return (
    <Badge variant={STATE_STYLE[state].variant}>
      <StateDot state={state} />
      {CONNECTION_STATE_LABEL[state]}
    </Badge>
  );
}
