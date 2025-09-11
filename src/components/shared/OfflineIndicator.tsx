"use client";

import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
            {isOnline ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-destructive" />
            )}
        </TooltipTrigger>
        <TooltipContent>
          <p>{isOnline ? 'Você está online' : 'Você está offline. O conteúdo pode ser limitado.'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
