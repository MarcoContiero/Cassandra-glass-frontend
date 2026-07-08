'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import ProgramsHub from '@/components/ProgramsHub';

// Tier utente (orione|argonauta|agema) determina tab accessibili in ProgramsHub
// Tab non disponibili per tier: visibili ma con lock overlay e CTA upgrade

export default function AppPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    fetch('/api/pizia/profile', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!data?.display_name) {
          router.replace('/onboarding/alias');
          return;
        }
        setChecked(true);
      })
      .catch(() => setChecked(true)); // se il check fallisce, non blocchiamo l'accesso all'app
  }, [isLoaded, isSignedIn, router]);

  if (!checked) return null;
  return <ProgramsHub />;
}
