import { QueryClientProvider } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/query-core";
import React, { useEffect, useState } from "react";
import { MobileSessionProvider, useMobileSession } from "./MobileSessionProvider";
import { usePushNotifications } from "../hooks/usePushNotifications";

function PushRegistrationBridge() {
  const session = useMobileSession();
  usePushNotifications({
    enabled: session.status === "signed_in",
    accessToken: session.accessToken,
  });
  return null;
}

export function MobileAppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (attempt: number, error: any) => error?.status !== 401 && error?.status !== 403 && attempt < 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  }));

  useEffect(() => () => queryClient.clear(), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileSessionProvider>
        <PushRegistrationBridge />
        {children}
      </MobileSessionProvider>
    </QueryClientProvider>
  );
}
