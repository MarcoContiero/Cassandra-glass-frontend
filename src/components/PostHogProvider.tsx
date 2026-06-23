'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { initPostHog, posthog } from '@/lib/posthog';

function PostHogIdentifier() {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  // Identifica l'utente su PostHog dopo il login
  useEffect(() => {
    if (!isLoaded) return;
    if (user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
    } else {
      posthog.reset();
    }
  }, [user, isLoaded]);

  // Traccia ogni cambio pagina manualmente (capture_pageview è off)
  useEffect(() => {
    posthog.capture('$pageview', { path: pathname });
  }, [pathname]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogIdentifier />
      {children}
    </PHProvider>
  );
}
