'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Dashboard costi/latenza minimale (§9 spec_canale_condiviso_finale.md,
// Fase 6). Sola lettura, aggregati da advisor_job_attempts.

interface ByStatusRow {
  advisor: string;
  status: string;
  n: number;
}

interface TotalsRow {
  advisor: string;
  completed_attempts: number;
  failed_attempts: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number | null;
}

interface DailyRow {
  advisor: string;
  day: string;
  completed: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
}

interface StatsResponse {
  by_status: ByStatusRow[];
  totals: TotalsRow[];
  daily: DailyRow[];
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('it-IT');
}

function fmtDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}

export default function ChannelStatsPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch('/api/channel/advisor-jobs/stats', { cache: 'no-store' })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setError('Impossibile caricare le statistiche'));
  }, [isSignedIn]);

  if (!isLoaded || !isSignedIn) return null;

  // Gate: stesso privilegio di Tifi 4.0 (tifide_access: true in Clerk public metadata)
  if (user?.publicMetadata?.tifide_access !== true) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-void)' }}>
        <div className="text-center">
          <span className="block mb-4 font-mono text-[9px] uppercase tracking-[0.5em] text-[var(--color-short-bright)]">
            Accesso non autorizzato
          </span>
          <span className="font-mono text-xs text-[var(--color-text-dim)]">
            Questa pagina richiede privilegi amministratore.
          </span>
        </div>
      </div>
    );
  }

  const statusByAdvisor = new Map<string, Map<string, number>>();
  for (const row of stats?.by_status ?? []) {
    if (!statusByAdvisor.has(row.advisor)) statusByAdvisor.set(row.advisor, new Map());
    statusByAdvisor.get(row.advisor)!.set(row.status, row.n);
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-lg font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
        Canale — costi &amp; latenza advisor
      </h1>
      {error && <div className="text-sm text-[var(--color-short-bright)]">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(stats?.totals ?? []).map(t => (
          <Card key={t.advisor} className="bg-[var(--color-surface)] border-[var(--color-border-dim)]">
            <CardHeader>
              <CardTitle className="font-mono uppercase text-sm">{t.advisor}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-[var(--color-text-dim)]">Completati</span>
              <span>{fmtNum(t.completed_attempts)}</span>
              <span className="text-[var(--color-text-dim)]">Falliti</span>
              <span>{fmtNum(t.failed_attempts)}</span>
              <span className="text-[var(--color-text-dim)]">Token input</span>
              <span>{fmtNum(t.input_tokens)}</span>
              <span className="text-[var(--color-text-dim)]">Token output</span>
              <span>{fmtNum(t.output_tokens)}</span>
              <span className="text-[var(--color-text-dim)]">Latenza media</span>
              <span>{t.avg_latency_ms != null ? `${Math.round(t.avg_latency_ms)} ms` : '—'}</span>
              <span className="text-[var(--color-text-dim)]">Job in coda</span>
              <span>
                {fmtNum(statusByAdvisor.get(t.advisor)?.get('pending'))} pending /{' '}
                {fmtNum(statusByAdvisor.get(t.advisor)?.get('retry_wait'))} retry
              </span>
            </CardContent>
          </Card>
        ))}
        {stats && stats.totals.length === 0 && (
          <div className="text-sm text-[var(--color-text-dim)]">Nessun tentativo registrato finora.</div>
        )}
      </div>

      <Card className="bg-[var(--color-surface)] border-[var(--color-border-dim)]">
        <CardHeader>
          <CardTitle className="font-mono uppercase text-sm">Andamento giornaliero (30gg)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--color-text-dim)]">
                  <th className="pr-4">Giorno</th>
                  <th className="pr-4">Advisor</th>
                  <th className="pr-4">Completati</th>
                  <th className="pr-4">Falliti</th>
                  <th className="pr-4">Tok. in</th>
                  <th>Tok. out</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.daily ?? []).map((d, i) => (
                  <tr key={i} className="border-t border-[var(--color-border-dim)]">
                    <td className="pr-4 py-1">{fmtDay(d.day)}</td>
                    <td className="pr-4 py-1 font-mono uppercase">{d.advisor}</td>
                    <td className="pr-4 py-1">{fmtNum(d.completed)}</td>
                    <td className="pr-4 py-1">{fmtNum(d.failed)}</td>
                    <td className="pr-4 py-1">{fmtNum(d.input_tokens)}</td>
                    <td className="py-1">{fmtNum(d.output_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats && stats.daily.length === 0 && (
              <div className="text-sm text-[var(--color-text-dim)] py-2">Nessun dato negli ultimi 30 giorni.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
