// app/api/agema/route.ts
//
// Redesign 2026-09-17: prima questa route ricalcolava uno score composito
// chiamando /api/analisi_light per ogni coin del watchlist ad ogni apertura
// pagina (lento, e duplicava logica di scoring mai validata). Ora e' un
// thin proxy verso lo snapshot gia' pronto sul backend
// (tools/agema_scan.py, job orario) — l'unico calcolo resta l'hook
// fire-and-forget per gli alert utente, gia' presente prima.
import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/proxy';
import type { AgemaSnapshot } from '@/types/agema';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function direzioneItaliana(d?: string): 'rialzista' | 'ribassista' | 'neutrale' {
  const s = String(d || '').toUpperCase();
  if (s === 'LONG') return 'rialzista';
  if (s === 'SHORT') return 'ribassista';
  return 'neutrale';
}

export async function GET(_req: NextRequest) {
  const backendRes = await callBackend('/api/agema/snapshot', { method: 'GET' });

  if (!backendRes.ok) {
    return NextResponse.json(
      { generated_at_ms: null, score_min: null, coins_scanned: 0, picks: [],
        error: `backend HTTP ${backendRes.status}` } satisfies AgemaSnapshot,
      { status: 200 },
    );
  }

  const snapshot = (await backendRes.json()) as AgemaSnapshot;

  // Hook alert Agema — fire-and-forget, non blocca la risposta. Stesso
  // contratto di prima (_match_agema in backend/alerts_engine.py):
  // event = {coin, score, posizione, direzione}.
  void (async () => {
    try {
      for (let i = 0; i < snapshot.picks.length; i++) {
        const p = snapshot.picks[i];
        await callBackend('/api/alerts/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modulo: 'agema',
            event: {
              coin: p.coin,
              score: p.score ?? 0,
              posizione: i + 1,
              direzione: direzioneItaliana(p.direction),
            },
          }),
        });
      }
    } catch { /* ignore */ }
  })();

  return NextResponse.json(snapshot);
}
