import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConnectionStatusBadgeProps {
  isConnected: boolean;
  onReconnect?: () => void;
  className?: string;
}

export function ConnectionStatusBadge({
  isConnected,
  onReconnect,
  className,
}: ConnectionStatusBadgeProps) {
  if (isConnected) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'flex items-center gap-1.5 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400',
          className
        )}
      >
        <Wifi className="h-3 w-3" />
        <span className="text-xs">Connected</span>
      </Badge>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onReconnect}
      className={cn(
        'flex items-center gap-1.5 border-red-500/50 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400',
        className
      )}
    >
      <WifiOff className="h-3 w-3" />
      <span className="text-xs">Disconnected</span>
      <RefreshCw className="h-3 w-3" />
    </Button>
  );
}
