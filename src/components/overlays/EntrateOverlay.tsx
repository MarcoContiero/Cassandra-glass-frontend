'use client';

import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

type Any = Record<string, any>;

type EntryRow = {
  dir: 'LONG' | 'SHORT';
  tf?: string;
  entry: number;
  stop: number;
  tp1?: number;
  tp2?: number;
  rr?: number;
  note?: string;
  forza?: number;
  src?: string;
  // Nuovo: campi specifici per i "setup in costruzione"
  phase?: string;               // es. "IN_COSTRUZIONE" / "ATTIVO"
  score_potenziale?: number;    // 0..100
  missing_trigger?: string;     // descrizione breve di cosa manca
};

type SRNorm = { min: number; max: number; mid: number; forza?: number; tf?: string };

// Utility: numeric-safe
function toN(v: any): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function nNum(v: any): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// R/R helper
function RR(dir: 'LONG' | 'SHORT', entry: number, sl: number, tp?: number): number | undefined {
  if (!entry || !sl || !tp) return undefined;
  const risk = dir === 'LONG' ? entry - sl : sl - entry;
  const reward = dir === 'LONG' ? tp - entry : entry - tp;
  if (risk <= 0 || reward <= 0) return undefined;
  return +(reward / risk).toFixed(2);
}

// =====================
// SR normalizer
// =====================

function grabSR(rows?: Any) {
  const norm = (r: any): SRNorm | null => {
    if (!r) return null;

    const readLevel = (obj: any): number | undefined => {
      if (!obj) return undefined;
      const cands = [
        obj.mid,
        obj.mid_price,
        obj.price,
        obj.livello,
        obj.level,
        obj.value,
        obj.valore,
        obj.center,
      ];
      for (const c of cands) {
        const n = nNum(c);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    };

    // 1) prova a leggere i "members" di una zona, cercando mid/value ecc.
    const membersRaw = Array.isArray(r?._details?.members) ? r._details.members : [];
    const midsFromMembers = membersRaw
      .map((m: any) => readLevel(m))
      .filter((v: any) => Number.isFinite(v)) as number[];

    // 2) mid principale (da vari alias)
    const mid = readLevel(r);

    // 3) min/max: priorità ai members; poi alias su r; infine fallback a mid
    const minCand = nNum(r?.min) ?? (midsFromMembers.length ? Math.min(...midsFromMembers) : undefined);
    const maxCand = nNum(r?.max) ?? (midsFromMembers.length ? Math.max(...midsFromMembers) : undefined);

    const finalMid = mid ?? (midsFromMembers.length ? +(midsFromMembers.reduce((a, b) => a + b, 0) / midsFromMembers.length).toFixed(2) : undefined);
    const finalMin = minCand ?? finalMid;
    const finalMax = maxCand ?? finalMid;

    if (!Number.isFinite(finalMid as number)) return null;

    const forza =
      nNum(r?.forza) ??
      nNum(r?.strength) ??
      nNum(r?.score) ??
      nNum(r?._details?.forza) ??
      0;

    const tf = String(r?.tf ?? r?.timeframe ?? '').trim() || undefined;

    return { min: finalMin as number, max: finalMax as number, mid: finalMid as number, forza, tf };
  };

  const S: SRNorm[] = ((rows?.supporti ?? []) as any[])
    .map(norm)
    .filter((x: SRNorm | null): x is SRNorm => !!x);

  const R: SRNorm[] = ((rows?.resistenze ?? []) as any[])
    .map(norm)
    .filter((x: SRNorm | null): x is SRNorm => !!x);

  // Debug utile (puoi toglierlo dopo)
  if (typeof window !== 'undefined') {
    (window as any).__ENTRATE_DEBUG__ = {
      in_supporti_len: rows?.supporti?.length ?? 0,
      in_resistenze_len: rows?.resistenze?.length ?? 0,
      out_S_len: S.length,
      out_R_len: R.length,
      sample_S: S.slice(0, 2),
      sample_R: R.slice(0, 2),
    };
  }

  return { S, R };
}

function grabPrice(data?: Any) {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  const cand =
    data?.prezzo ??
    data?.price ??
    data?.last_price ??
    data?.ticker?.last_price ??
    data?.ticker?.price ??
    w?.__CASSANDRA_PRICE__;
  const n = Number(cand);
  return Number.isFinite(n) ? n : undefined;
}

// ====================
// Scoring entry
// ====================

const MIN_ENTRY_SCORE_N = 0.6;

function scoreEntry(e: EntryRow, price?: number): number {
  if (!price) return 0.5;

  const dist = Math.abs(e.entry - price) / price; // distanza relativa
  const distScore = Math.max(0, 1 - dist * 10); // meno è lontano, meglio è

  const rr = e.rr ?? 1;
  const rrScore = Math.min(rr / 3, 1); // sopra 3x non fa molta differenza

  const base = 0.4 * distScore + 0.6 * rrScore;

  // bonus se ha TP2
  const bonusTp2 = e.tp2 ? 0.05 : 0;

  // bonus se forza alta
  const forzaScore = Math.min((e.forza ?? 0) / 10, 1) * 0.1;

  return base + bonusTp2 + forzaScore;
}

function rankTop(arr: EntryRow[], price?: number, k = 5): EntryRow[] {
  const ranked = arr
    .map((e) => ({ e, s: scoreEntry(e, price) }))
    // PATCH: scarta entry sotto soglia
    .filter(({ s }) => s >= MIN_ENTRY_SCORE_N)
    .sort((a, b) => b.s - a.s);

  return ranked.slice(0, k).map(({ e }) => e);
}


/* -----------------------------
   COSTRUZIONE ENTRATE MECCANICHE
   (solo TP1/TP2 e SL migliorati)
-------------------------------- */

function buildMechanicalEntries(data?: Any): EntryRow[] {
  const { S, R } = grabSR(data);
  const p = grabPrice(data);
  if (!S.length && !R.length) return [];

  // === Parametri ===
  const MIN_TP_LEVEL = 2;     // TP devono usare livelli con "livelli" >= 2 (più significativi)
  const FALLBACK_SL_PCT = 0.003; // 0.3% se non esiste il livello "successivo" per lo SL
  const ENTRY_BUFFER_PCT = 0.0005; // 0.05% oltre il bordo per breakout

  const dist = (x: number) => (p == null ? 0 : Math.abs(x - (p as number)));

  // -- helpers per scelta TP1/TP2 “significativi” e SL “successivo” --
  const pickTPsLong = (s: SRNorm) => {
    // Resistenze sopra la zona, prima considera livelli "forti"
    const aboveAll = R.filter(r => r.min > s.max).sort((a, b) => a.min - b.min);
    const strong = aboveAll.filter(r => (r.forza ?? 0) >= MIN_TP_LEVEL);
    const weak = aboveAll.filter(r => (r.forza ?? 0) < MIN_TP_LEVEL);

    const ordered = [...strong, ...weak];

    const tp1 = ordered[0]?.min ?? ordered[0]?.mid;
    const tp2 = ordered[1]?.min ?? ordered[1]?.mid ?? tp1;

    return { tp1, tp2 };
  };

  const pickTPsShort = (r: SRNorm) => {
    // Supporti sotto la zona
    const belowAll = S.filter(s => s.max < r.min).sort((a, b) => b.max - a.max);
    const strong = belowAll.filter(s => (s.forza ?? 0) >= MIN_TP_LEVEL);
    const weak = belowAll.filter(s => (s.forza ?? 0) < MIN_TP_LEVEL);

    const ordered = [...strong, ...weak];

    const tp1 = ordered[0]?.max ?? ordered[0]?.mid;
    const tp2 = ordered[1]?.max ?? ordered[1]?.mid ?? tp1;

    return { tp1, tp2 };
  };

  const nextLowerSupportForSL = (s: SRNorm): number | undefined => {
    const below = S.filter(x => x.max < s.min).sort((a, b) => b.max - a.max);
    return below[0]?.min ?? below[0]?.mid;
  };

  const nextUpperResistanceForSL = (r: SRNorm): number | undefined => {
    const above = R.filter(x => x.min > r.max).sort((a, b) => a.min - b.min);
    return above[0]?.max ?? above[0]?.mid;
  };

  const stopFallbackLong = (entry: number): number =>
    p != null ? entry * (1 - FALLBACK_SL_PCT) : entry * 0.99;
  const stopFallbackShort = (entry: number): number =>
    p != null ? entry * (1 + FALLBACK_SL_PCT) : entry * 1.01;

  // ==========
  // REBOUND
  // ==========

  // LONG (rebound): entry al mid del supporto; SL al supporto successivo sotto; TP su resistenze forti sopra
  const longRebound: EntryRow[] = S.slice()
    .sort((a, b) => dist(a.mid) - dist(b.mid))
    .slice(0, 40)
    .map((s): EntryRow => {
      const entry = s.mid;
      const sl = nextLowerSupportForSL(s) ?? stopFallbackLong(entry);
      const { tp1, tp2 } = pickTPsLong(s);
      return {
        dir: 'LONG',
        tf: s.tf,
        entry,
        stop: sl,
        tp1,
        tp2,
        rr: RR('LONG', entry, sl, tp1),
        forza: s.forza,
        note: 'Rimbalzo su supporto (mid zona)',
        src: 'mechanical',
      };
    });

  // SHORT (rebound): entry al mid della resistenza; SL alla resistenza successiva sopra; TP su supporti forti sotto
  const shortRebound: EntryRow[] = R.slice()
    .sort((a, b) => dist(a.mid) - dist(b.mid))
    .slice(0, 40)
    .map((r): EntryRow => {
      const entry = r.mid;
      const sl = nextUpperResistanceForSL(r) ?? stopFallbackShort(entry);
      const { tp1, tp2 } = pickTPsShort(r);
      return {
        dir: 'SHORT',
        tf: r.tf,
        entry,
        stop: sl,
        tp1,
        tp2,
        rr: RR('SHORT', entry, sl, tp1),
        forza: r.forza,
        note: 'Rimbalzo su resistenza (mid zona)',
        src: 'mechanical',
      };
    });

  // ==========
  // BREAKOUT
  // ==========

  // LONG (breakout): entry sopra la parte alta del supporto; SL sotto il supporto; TP su resistenze
  const longBreakout: EntryRow[] = S.slice()
    .sort((a, b) => dist(a.max) - dist(b.max))
    .slice(0, 40)
    .map((s): EntryRow => {
      const baseEntry = s.max;
      const entry = p != null ? baseEntry * (1 + ENTRY_BUFFER_PCT) : baseEntry;
      const sl = nextLowerSupportForSL(s) ?? stopFallbackLong(entry);
      const { tp1, tp2 } = pickTPsLong(s);
      return {
        dir: 'LONG',
        tf: s.tf,
        entry,
        stop: sl,
        tp1,
        tp2,
        rr: RR('LONG', entry, sl, tp1),
        forza: s.forza,
        note: 'Breakout sopra zona di supporto',
        src: 'mechanical',
      };
    });

  // SHORT (breakout): entry sotto la parte bassa della resistenza; SL sopra la resistenza; TP su supporti
  const shortBreakout: EntryRow[] = R.slice()
    .sort((a, b) => dist(a.min) - dist(b.min))
    .slice(0, 40)
    .map((r): EntryRow => {
      const baseEntry = r.min;
      const entry = p != null ? baseEntry * (1 - ENTRY_BUFFER_PCT) : baseEntry;
      const sl = nextUpperResistanceForSL(r) ?? stopFallbackShort(entry);
      const { tp1, tp2 } = pickTPsShort(r);
      return {
        dir: 'SHORT',
        tf: r.tf,
        entry,
        stop: sl,
        tp1,
        tp2,
        rr: RR('SHORT', entry, sl, tp1),
        forza: r.forza,
        note: 'Breakdown sotto zona di resistenza',
        src: 'mechanical',
      };
    });

  // Unisco le quattro famiglie e lascio che il ranking scelga le migliori 5 per lato
  const allLongs = [...longRebound, ...longBreakout];
  const allShorts = [...shortRebound, ...shortBreakout];

  const longs = rankTop(allLongs, p, 5);
  const shorts = rankTop(allShorts, p, 5);

  return [...longs, ...shorts];
}

// =====================
// NUOVO: estrazione "Setup in costruzione"
// =====================

function extractBackendEntries(d?: Any): EntryRow[] {
  // Per questo overlay usiamo esplicitamente i "setup in costruzione"
  // provenienti dal backend Strategia AI (chiave: strategia_ai_in_costruzione).
  const raw = (Array.isArray(d?.strategia_ai_in_costruzione)
    ? (d!.strategia_ai_in_costruzione as Any[])
    : []
  ).filter(Boolean);

  const norm = (e: any): EntryRow => {
    const dirRaw = String(e?.direction ?? e?.dir ?? e?.side ?? '').toUpperCase();
    const dir: 'LONG' | 'SHORT' = dirRaw === 'SHORT' ? 'SHORT' : 'LONG';

    const entry = toN(e?.entry ?? e?.price ?? e?.ingresso ?? e?.tp1_price ?? e?.tp1) as number;
    const stop = toN(e?.stop ?? e?.sl_price ?? e?.sl ?? e?.stop_loss) as number;
    const tp1 = toN(e?.tp1 ?? e?.tp1_price ?? e?.tp ?? e?.target);
    const tp2 = toN(e?.tp2 ?? e?.tp2_price ?? e?.target2);

    const rr =
      toN(e?.rr ?? e?.risk_reward) ??
      (entry && stop && tp1 ? RR(dir, entry, stop, tp1) : undefined);

    const phase = String(e?.phase ?? e?.stato ?? e?.status ?? '').toUpperCase() || undefined;
    const score_potenziale = toN(e?.score_potenziale ?? e?.score);
    const missing_trigger =
      e?.missing_trigger ??
      e?.trigger_mancante ??
      undefined;

    const note =
      e?.note_in_costruzione ??
      e?.note ??
      e?.explanation ??
      e?.setup ??
      undefined;

    const src =
      e?.source ??
      e?.fonte ??
      'strategia_ai';

    return {
      dir,
      tf: String(e?.tf ?? e?.timeframe ?? '').trim() || undefined,
      entry,
      stop,
      tp1,
      tp2,
      rr,
      note,
      src,
      forza: toN(e?.forza),
      phase,
      score_potenziale,
      missing_trigger,
    };
  };

  const out = raw
    .map(norm)
    .filter((x) => x.entry && x.stop && (x.tp1 || x.tp2));

  const key = (x: EntryRow) => `${x.dir}|${x.entry}|${x.stop}|${x.tp1}|${x.tp2}`;
  const seen = new Set<string>();
  const dedup: EntryRow[] = [];
  for (const r of out) {
    const k = key(r);
    if (!seen.has(k)) {
      seen.add(k);
      dedup.push(r);
    }
  }
  return dedup;
}

// Estrae le entry già ATTIVE (strategia_ai) per evitare doppioni
function extractActiveEntries(d?: Any): { dir: 'LONG' | 'SHORT'; tf?: string; entry: number }[] {
  const raw = (Array.isArray(d?.strategia_ai) ? (d!.strategia_ai as Any[]) : []).filter(Boolean);

  const out: { dir: 'LONG' | 'SHORT'; tf?: string; entry: number }[] = [];

  for (const e of raw) {
    const dirRaw = String(e?.direction ?? e?.dir ?? e?.side ?? '').toUpperCase();
    const dir: 'LONG' | 'SHORT' = dirRaw === 'SHORT' ? 'SHORT' : 'LONG';
    const entry = toN(e?.entry ?? e?.price ?? e?.ingresso ?? e?.tp1_price ?? e?.tp1);
    if (!entry) continue;

    const tf = String(e?.tf ?? e?.timeframe ?? '').trim() || undefined;
    out.push({ dir, tf, entry });
  }

  return out;
}

// Rimuove dai candidati quelli che sono praticamente uguali a un setup attivo
function filterOverlaps(cands: EntryRow[], actives: { dir: 'LONG' | 'SHORT'; tf?: string; entry: number }[]): EntryRow[] {
  if (!actives.length) return cands;
  const TOL_PCT = 0.001; // 0.1% di tolleranza sul prezzo

  return cands.filter((c) => {
    if (!c.entry) return true;
    return !actives.some((a) => {
      if (a.dir !== c.dir) return false;
      if (a.tf && c.tf && a.tf !== c.tf) return false;
      const diffPct = Math.abs(a.entry - c.entry) / a.entry;
      return diffPct <= TOL_PCT;
    });
  });
}

// =====================
// Overlay principale
// =====================

export default function EntrateOverlay({ title, data }: { title: string; data?: Any }) {
  // Setup attivi (Strategia AI) – li usiamo solo per evitare doppioni
  const active = extractActiveEntries(data);

  // 1) Costruzione liste
  const backendRaw = extractBackendEntries(data);
  const mechanicalRaw = Array.isArray(data?.strategia_ai_in_costruzione)
    ? []
    : buildMechanicalEntries(data);

  // 1b) Filtra via tutto ciò che è già un setup operativo
  const backend = filterOverlaps(backendRaw, active);
  const mechanical = filterOverlaps(mechanicalRaw, active);

  // 2) Merge unico (niente duplicati identici)
  const key = (x: EntryRow) => `${x.dir}|${Number(x.entry)}|${Number(x.stop)}|${Number(x.tp1)}|${Number(x.tp2)}`;
  const seen = new Set<string>();
  const merged: EntryRow[] = [...backend, ...mechanical].filter(e => {
    const k = key(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  function normalizeDir(v: any): 'LONG' | 'SHORT' | null {
    const s = String(v ?? '').trim().toUpperCase();
    if (s === 'LONG' || s === 'BUY' || s === 'L') return 'LONG';
    if (s === 'SHORT' || s === 'SELL' || s === 'S') return 'SHORT';
    return null;
  }

  // 3) Sanitizer relazioni (scarta entrate incoerenti)
  function sanitize(entries: EntryRow[]): EntryRow[] {
    return entries
      .map((e) => {
        const dirNorm = normalizeDir(e.dir);
        if (!dirNorm) return null;

        const entry = toN(e.entry);
        const stop = toN(e.stop);
        const tp1 = toN(e.tp1);
        const tp2 = toN(e.tp2);

        if (!entry || !stop || (!tp1 && !tp2)) return null;

        if (dirNorm === 'LONG') {
          if (!(stop < entry)) return null;
          if (tp1 && !(tp1 > entry)) return null;
          if (tp2 && !(tp2 > (tp1 ?? entry))) return null;
        } else {
          if (!(stop > entry)) return null;
          if (tp1 && !(tp1 < entry)) return null;
          if (tp2 && !(tp2 < (tp1 ?? entry))) return null;
        }

        const rr = e.rr ?? (tp1 ? RR(dirNorm, entry, stop, tp1) : undefined);

        return {
          ...e,
          dir: dirNorm,
          entry,
          stop,
          tp1,
          tp2,
          rr,
        } as EntryRow;
      })
      .filter((x: EntryRow | null): x is EntryRow => !!x);
  }

  const sanitized = sanitize(merged);
  const price = grabPrice(data);

  // Split LONG/SHORT
  const longsAll = sanitized.filter((e) => e.dir === 'LONG');
  const shortsAll = sanitized.filter((e) => e.dir === 'SHORT');

  const longsClustered = clusterByKey(longsAll, price);
  const shortsClustered = clusterByKey(shortsAll, price);

  const longsTop = rankTop(longsClustered, price, 5);
  const shortsTop = rankTop(shortsClustered, price, 5);

  if (typeof window !== 'undefined') {
    (window as any).__ENTRATE__ = { entries: [...longsTop, ...shortsTop], backend, mechanical, raw: data ?? {} };
  }

  const empty = longsTop.length === 0 && shortsTop.length === 0;

  const overlayTitle = `🎯 ${title}`;

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Pannello Entrate: segnali, filtri e dettagli operativi."
      className="w-full max-w-none p-0 bg-zinc-900/95 text-white"
    >
      <div className="flex flex-col h-full">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
            Entrate / Setup in costruzione
            {price != null && (
              <span className="ml-2 text-xs text-white/70 border border-white/10 rounded-md px-2 py-0.5">
                Prezzo corrente: <span className="font-mono">{price.toLocaleString('it-IT')}</span>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-4 pb-4 pt-2">
          {empty ? (
            <div className="text-white/70">Nessuna entry trovata.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start content-start min-w-0">
              {/* COLONNA LONG */}
              <div className="space-y-4 min-w-0 md:col:1">
                {longsTop.map((e, i) => (
                  <div key={`L-${i}`} className="rounded-xl border border-white/10 bg-white/3 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium min-w-0">
                        Entry {i + 1}
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-md bg-green-500/15 text-green-300 border border-green-400/30">
                          LONG
                        </span>
                        {e.tf && (
                          <span className="ml-2 text-xs text-white/70 border border-white/10 rounded-md px-2 py-0.5">
                            {e.tf}
                          </span>
                        )}
                        {Number.isFinite(e.forza) && (
                          <span className="ml-2 text-xs text-white/70 border border-white/10 rounded-md px-2 py-0.5">
                            Forza {e.forza}
                          </span>
                        )}
                      </div>
                      {typeof e.rr !== 'undefined' && (
                        <div className="text-xs text-white/80">R/R: {e.rr}</div>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-3">
                      {([
                        ['Entry', e.entry],
                        ['Stop', e.stop],
                        ['TP1', e.tp1],
                        ['TP2', e.tp2],
                      ] as const).map(([lab, val]) => (
                        <div
                          key={lab}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 min-w-[130px]"
                        >
                          <div className="text-[10px] uppercase text-white/60 whitespace-nowrap">{lab}</div>
                          <div className="whitespace-nowrap font-mono tabular-nums text-[13px] tracking-tight">
                            {val?.toLocaleString?.('it-IT') ?? '—'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {typeof e.score_potenziale === 'number' && (
                      <div className="mt-1 text-xs text-white/60">
                        Score potenziale: {e.score_potenziale.toFixed(1)}
                      </div>
                    )}
                    {e.missing_trigger && (
                      <div className="mt-1 text-xs text-amber-300">
                        Manca: {e.missing_trigger}
                      </div>
                    )}
                    {e.note && <p className="mt-2 text-white/80">{e.note}</p>}
                    {e.src && <div className="mt-1 text-xs text-white/60">Fonte: {e.src}</div>}
                  </div>
                ))}
              </div>

              {/* COLONNA SHORT */}
              <div className="space-y-4 min-w-0 md:col-2">
                {shortsTop.map((e, i) => (
                  <div key={`S-${i}`} className="rounded-xl border border-white/10 bg-white/3 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium min-w-0">
                        Entry {i + 1}
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-400/30">
                          SHORT
                        </span>
                        {e.tf && (
                          <span className="ml-2 text-xs text-white/70 border border-white/10 rounded-md px-2 py-0.5">
                            {e.tf}
                          </span>
                        )}
                        {Number.isFinite(e.forza) && (
                          <span className="ml-2 text-xs text-white/70 border border-white/10 rounded-md px-2 py-0.5">
                            Forza {e.forza}
                          </span>
                        )}
                      </div>
                      {typeof e.rr !== 'undefined' && (
                        <div className="text-xs text-white/80">R/R: {e.rr}</div>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-3">
                      {([
                        ['Entry', e.entry],
                        ['Stop', e.stop],
                        ['TP1', e.tp1],
                        ['TP2', e.tp2],
                      ] as const).map(([lab, val]) => (
                        <div
                          key={lab}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 min-w-[130px]"
                        >
                          <div className="text-[10px] uppercase text-white/60 whitespace-nowrap">{lab}</div>
                          <div className="whitespace-nowrap font-mono tabular-nums text-[13px] tracking-tight">
                            {val?.toLocaleString?.('it-IT') ?? '—'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {typeof e.score_potenziale === 'number' && (
                      <div className="mt-1 text-xs text-white/60">
                        Score potenziale: {e.score_potenziale.toFixed(1)}
                      </div>
                    )}
                    {e.missing_trigger && (
                      <div className="mt-1 text-xs text-amber-300">
                        Manca: {e.missing_trigger}
                      </div>
                    )}
                    {e.note && <p className="mt-2 text-white/80">{e.note}</p>}
                    {e.src && <div className="mt-1 text-xs text-white/60">Fonte: {e.src}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SafeDialogContent>
  );
}

// piccolo helper per clustering (se già presente nel file, lascialo com’è)
function clusterByKey(entries: EntryRow[], price?: number): EntryRow[] {
  if (!entries.length) return [];
  const key = (e: EntryRow) => `${e.dir}|${e.tf ?? ''}`;
  const map = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const k = key(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  const out: EntryRow[] = [];
  for (const group of map.values()) {
    const best = rankTop(group, price, 1)[0];
    if (best) out.push(best);
  }
  return out;
}