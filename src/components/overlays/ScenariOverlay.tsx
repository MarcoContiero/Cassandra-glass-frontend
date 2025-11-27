'use client';

import { useMemo, useState, useCallback } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

import { OverlayShell } from "./OverlayShell";

type ScenarioItem = {
  nome?: string;
  codice?: string;
  direzione?: 'LONG' | 'SHORT' | string;
  tf?: string;
  confidence?: number; // 0..100
  trigger?: number | string;
  descrizione?: string;
};

// --- QUASI-SCENARI (uno step mancante)
type NearScenarioItem = {
  nome?: string;
  codice?: string;
  direzione?: 'LONG' | 'SHORT' | string;
  tf?: string;
  missing?: string;     // elemento mancante (testo)
  condizione?: string;  // cosa deve accadere
  trigger?: number | string;
  descrizione?: string;
};

function normalizeNearScenario(raw: any, fallbackTf?: string): NearScenarioItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const nome =
    firstNonEmpty<string>(raw, ['nome', 'name', 'titolo', 'title']) ??
    (raw.tipo ? `Scenario ${raw.tipo}` : undefined) ??
    (raw.codice ? `Scenario ${raw.codice}` : undefined);

  const codice = firstNonEmpty<string>(raw, ['codice', 'code', 'id', 'key']);
  const direzione = (firstNonEmpty<string>(raw, ['direzione', 'dir', 'direction']) || '')
    .toString()
    .toUpperCase();

  const tf =
    compactTF(firstNonEmpty<string>(raw, ['tf', 'timeframe', 'time_frame'])) ||
    compactTF(fallbackTf);

  // elemento mancante e condizione da campi vari
  const missingRaw =
    firstNonEmpty<any>(raw, [
      'mancante',
      'elemento_mancante',
      'missing',
      'missing_element',
      'elementi_mancanti',
      'missing_items',
    ]);

  const missing =
    Array.isArray(missingRaw) ? missingRaw.filter(Boolean).join(', ') : (missingRaw ? String(missingRaw) : undefined);

  const condizione =
    firstNonEmpty<string>(raw, ['condizione', 'deve_succedere', 'requirement', 'what', 'azione', 'if']) || undefined;

  const trigger =
    firstNonEmpty<number | string>(raw, ['trigger', 'livello', 'level', 'price', 'entry', 'target']) ?? undefined;

  const descrizione =
    firstNonEmpty<string>(raw, ['descrizione', 'description', 'spiegazione', 'explain', 'testo']) || undefined;

  if (!nome && !codice) return null;

  return { nome, codice, direzione, tf, missing, condizione, trigger, descrizione };
}

/** Estrae i quasi-scenari per TF da varie forme possibili del backend */
function extractNearScenariosByTf(result: any): Map<string, NearScenarioItem[]> {
  const byTf = new Map<string, NearScenarioItem[]>();
  if (!result) return byTf;

  // 1) array top-level con tf dentro agli item
  const toplists: any[] = [
    firstNonEmpty<any[]>(result, [
      'scenari_in_costruzione',
      'scenari_quasi',
      'scenari_candidati',
      'near_scenarios',
      'quasi',
      'one_missing',
      'missing_one',
    ]),
    firstNonEmpty<any[]>(result, ['risposte.scenari_in_costruzione', 'risposte.scenari_quasi']),
  ].filter(Boolean);

  for (const arr of toplists) {
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const n = normalizeNearScenario(raw);
      if (!n) continue;
      const key = n.tf || '—';
      const bucket = byTf.get(key) || [];
      bucket.push(n);
      byTf.set(key, bucket);
    }
  }

  // 2) per-TF in contenitori noti (rawPerTf / per_tf / timeframes_map …)
  const perTfCandidates =
    firstNonEmpty<any>(result, [
      'rawPerTf',
      'risposte.rawPerTf',
      'per_tf',
      'risposte.per_tf',
      'timeframes_map',
      'risposte.timeframes_map',
      'scenari', // alcuni backend potrebbero annidare qui delle chiavi "quasi"
    ]) || {};

  for (const [tfKey, payload] of Object.entries<any>(perTfCandidates)) {
    const arr =
      firstNonEmpty<any[]>(payload, [
        'scenari_in_costruzione',
        'scenari_quasi',
        'scenari_candidati',
        'near_scenarios',
        'quasi',
        'one_missing',
        'missing_one',
      ]) || [];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const n = normalizeNearScenario(raw, tfKey);
      if (!n) continue;
      const key = n.tf || compactTF(tfKey) || '—';
      const bucket = byTf.get(key) || [];
      bucket.push(n);
      byTf.set(key, bucket);
    }
  }

  // dedup minimo: nome/codice + tf
  for (const [tf, arr] of Array.from(byTf.entries())) {
    const seen = new Set<string>();
    const dedup = arr.filter((x) => {
      const k = `${(x.codice || x.nome || '').toString().toUpperCase()}__${tf}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    byTf.set(tf, dedup);
  }

  return byTf;
}

function get<T = any>(obj: any, path: string): T | undefined {
  return path.split('.').reduce((acc: any, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}
function firstNonEmpty<T = any>(obj: any, paths: string[]): T | undefined {
  for (const p of paths) {
    const v = get<T>(obj, p);
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}
function asNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function asPct(v: any): number | undefined {
  const n = asNum(v);
  if (!Number.isFinite(n as number)) return undefined;
  if ((n as number) <= 1 && (n as number) >= 0) return (n as number) * 100;
  return Math.max(0, Math.min(100, n as number));
}
function compactTF(tf?: string): string {
  if (!tf) return '';
  const t = String(tf).trim().toLowerCase();
  if (t === '1m' || t === '1min') return '1m';
  if (t === '5m' || t === '5min') return '5m';
  if (t === '15m' || t === '15min') return '15m';
  if (t === '1h' || t === '60m') return '1h';
  if (t === '4h') return '4h';
  if (t === '1d' || t === 'daily' || t === 'd') return '1d';
  if (t === '1w' || t === 'weekly' || t === 'w') return '1w';
  return tf;
}
function normalizeScenario(raw: any, fallbackTf?: string): ScenarioItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const nome =
    firstNonEmpty<string>(raw, ['nome', 'name', 'titolo', 'title']) ??
    (raw.tipo ? `Scenario ${raw.tipo}` : undefined) ??
    (raw.codice ? `Scenario ${raw.codice}` : undefined);

  const codice = firstNonEmpty<string>(raw, ['codice', 'code', 'id', 'key']);

  const direzione = (firstNonEmpty<string>(raw, ['direzione', 'dir', 'direction']) || '')
    .toString()
    .toUpperCase() as any;

  const tf =
    compactTF(firstNonEmpty<string>(raw, ['tf', 'timeframe', 'time_frame'])) ||
    compactTF(fallbackTf);

  const confidence =
    asPct(firstNonEmpty<number>(raw, ['confidence', 'confidenza', 'prob', 'probability'])) ??
    ((): number | undefined => {
      const score =
        asNum(firstNonEmpty<number>(raw, ['score_norm', 'score_normalized'])) ??
        asNum(raw.score);
      if (!Number.isFinite(score as number)) return undefined;
      if ((score as number) <= 1 && (score as number) >= 0) return (score as number) * 100;
      if ((score as number) <= 100 && (score as number) >= 0) return score as number;
      return Math.max(0, Math.min(100, score as number));
    })();

  const trigger =
    firstNonEmpty<number | string>(raw, ['trigger', 'livello', 'level', 'price']) ??
    firstNonEmpty<number | string>(raw, ['entry', 'target']);

  const descrizione =
    firstNonEmpty<string>(raw, ['descrizione', 'description', 'spiegazione', 'explain']) ??
    (raw.testo as string);

  const attivo = firstNonEmpty<boolean>(raw, ['attivo', 'active', 'enabled']);
  if (attivo === false) return null;

  if (!nome && !codice) return null;

  return { nome, codice, direzione, tf, confidence, trigger, descrizione };
}
function uniqBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}
function extractActiveScenarios(result: any): ScenarioItem[] {
  const out: ScenarioItem[] = [];
  if (!result) return out;

  // --- 1) array "piatti" classici (se presenti)
  const buckets: any[] = [
    firstNonEmpty<any[]>(result, ['scenari_attivi', 'risposte.scenari_attivi']),
    firstNonEmpty<any[]>(result, ['scenari', 'risposte.scenari']),
  ].filter(Boolean);

  for (const arr of buckets) {
    if (Array.isArray(arr)) {
      for (const raw of arr) {
        const n = normalizeScenario(raw);
        if (n) out.push(n);
      }
    }
  }

  // --- 2) per-TF classici (rawPerTf / per_tf / timeframes_map)
  const perTfCandidates =
    firstNonEmpty<any>(result, [
      'rawPerTf',
      'risposte.rawPerTf',
      'per_tf',
      'risposte.per_tf',
      'timeframes_map',
      'risposte.timeframes_map',
    ]) || {};

  for (const [tfKey, payload] of Object.entries<any>(perTfCandidates)) {
    const arr =
      firstNonEmpty<any[]>(payload, ['scenari_attivi', 'scenari']) ||
      firstNonEmpty<any[]>(payload, ['risposte.scenari_attivi', 'risposte.scenari']) ||
      [];
    if (Array.isArray(arr)) {
      for (const raw of arr) {
        const n = normalizeScenario(raw, tfKey);
        if (n) out.push(n);
      }
    }
  }

  // --- 3) **NUOVO**: struttura "scenari" per TF con trend.components (come nel JSON allegato)
  // es: scenari["1d"].trend.tot + scenari["1d"].trend.components.long|short|neutro[]
  const scenariByTf = result?.scenari;
  if (scenariByTf && typeof scenariByTf === 'object') {
    for (const [tfKey, block] of Object.entries<any>(scenariByTf)) {
      const trend = block?.trend;
      const tot = Number(trend?.tot);
      const comps = trend?.components || {};
      const groups = ['long', 'short', 'neutro'];

      for (const g of groups) {
        const arr = Array.isArray(comps[g]) ? comps[g] : [];
        for (const it of arr) {
          // --- estrazioni robuste
          const indicatore =
            it?.indicatore ?? it?.indicator ?? it?.name ?? it?.id ?? 'Indicatore';
          const descr =
            it?.scenario ?? it?.descrizione ?? it?.description ?? '';

          const punti = Number(it?.punteggio ?? it?.score ?? 0);
          if (!Number.isFinite(punti) || punti <= 0) continue; // scarta punteggio 0

          const conf =
            Number.isFinite(tot) && tot > 0
              ? Math.max(0, Math.min(100, (punti / tot) * 100))
              : undefined;

          out.push({
            nome: descr ? `${indicatore} – ${descr}` : String(indicatore),
            codice: it?.codice ?? it?.code ?? undefined,
            direzione: String(it?.direzione ?? g).toUpperCase(),
            tf: compactTF(tfKey),
            confidence: conf,
            trigger: it?.trigger ?? it?.level ?? undefined,
            descrizione: `Indicatore ${indicatore}${descr ? ` · ${descr}` : ''} · punteggio ${punti}`,
          });
        }
      }
    }
  }

  // dedup & sort
  const cleaned = uniqBy(
    out.filter(Boolean),
    (s) => `${(s.codice || s.nome || '').toString().toUpperCase()}__${s.tf || ''}`
  );
  cleaned.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
  return cleaned;
}
function fmtPct(n?: number): string {
  if (!Number.isFinite(n as number)) return '—';
  const v = Math.max(0, Math.min(100, n as number));
  return `${v.toFixed(v < 10 || v % 1 !== 0 ? 1 : 0)}%`;
}
function fmtTrigger(v: any): string {
  const n = Number(v);
  if (Number.isFinite(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return typeof v === 'string' ? v : '—';
}

export default function ScenarioOverlay({
  title,
  data,
}: {
  title?: string;
  data: any;
}) {
  const scenari = useMemo(
    () => extractActiveScenarios(data).filter(s => (s.confidence ?? 0) > 1e-9),
    [data]
  );

  // ---- ordine TF
  const tfOrder = (tf?: string) => {
    const t = (tf || '').toLowerCase();
    const map: Record<string, number> = {
      '1m': 1, '3m': 2, '5m': 3, '15m': 4, '30m': 5, '45m': 6,
      '1h': 7, '2h': 8, '3h': 9, '4h': 10, '6h': 11, '8h': 12, '12h': 13,
      '1d': 14, '3d': 15, '1w': 16,
    };
    return map[t] ?? 999;
  };

  // ---- raggruppa per TF
  const grouped = useMemo(() => {
    const g = new Map<string, ScenarioItem[]>();
    for (const s of scenari) {
      const key = s.tf || '—';
      const arr = g.get(key) || [];
      arr.push(s);
      g.set(key, arr);
    }
    // ordina ogni gruppo per confidence
    for (const [k, arr] of g) {
      arr.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
      g.set(k, arr);
    }
    return Array.from(g.entries()).sort((a, b) => tfOrder(a[0]) - tfOrder(b[0]));
  }, [scenari]);

  const nearByTf = useMemo(() => extractNearScenariosByTf(data), [data]);

  // quante TF copre ogni scenario (chiave = codice||nome in maiuscolo)
  const tfCoverage = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of scenari) {
      const k = ((s.codice || s.nome || '') + '').toUpperCase();
      if (!k) continue;
      const set = m.get(k) || new Set<string>();
      if (s.tf) set.add(s.tf);
      m.set(k, set);
    }
    return m;
  }, [scenari]);

  const totalTf = grouped.length; // n. di TF presenti nel pannello

  // ---- stato apertura/chiusura gruppi
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    grouped.forEach(([tf]) => { init[tf] = false; });
    for (const key of ['12h', '4h', '1d']) if (key in init) { init[key] = true; break; }
    return init;
  });


  const toggle = useCallback((tf: string) => {
    setOpen((prev: Record<string, boolean>) => ({ ...prev, [tf]: !prev[tf] }));
  }, []);

  const openAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const [tf] of grouped) next[tf] = true;
    setOpen(next);
  }, [grouped]);

  const closeAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const [tf] of grouped) next[tf] = false;
    setOpen(next);
  }, [grouped]);

  const overlayTitle = String(title ?? "Scenari attivi");

  return (
    <OverlayShell>
      <SafeDialogContent
        title={overlayTitle}
        description="Elenco e controllo degli scenari operativi attivi."
        className="sm:max-w-2xl bg-neutral-900 text-neutral-100 border border-neutral-700"
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <span className="i-lucide-scan-line w-5 h-5" />
              {overlayTitle}
            </span>
            {grouped.length > 0 && (
              <span className="flex items-center gap-2">
                <button
                  onClick={openAll}
                  className="text-xs px-2 py-1 rounded-lg border border-neutral-600 hover:bg-neutral-800"
                >
                  Apri tutti
                </button>
                <button
                  onClick={closeAll}
                  className="text-xs px-2 py-1 rounded-lg border border-neutral-600 hover:bg-neutral-800"
                >
                  Chiudi tutti
                </button>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {grouped.length === 0 ? (
          <div className="text-neutral-400 text-sm px-1">Nessuno scenario attivo trovato.</div>
        ) : (
          // contenitore scrollabile
          <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
            {grouped.map(([tf, arr]) => {
              const isOpen = !!open[tf];
              return (
                <section key={tf} className="rounded-2xl border border-neutral-700 bg-neutral-850/40">
                  {/* Header TF con toggle */}
                  <button
                    onClick={() => toggle(tf)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        aria-hidden
                      >
                        ›
                      </span>
                      <span className="text-sm font-medium text-neutral-200">
                        TF:&nbsp;<span className="uppercase">{tf}</span>
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">{arr.length} elementi</div>
                  </button>

                  {/* Lista a scomparsa */}
                  <div
                    className={`transition-all duration-200 ease-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                      } overflow-hidden`}
                  >
                    <ul className="space-y-2 px-4 pb-4">
                      {arr.map((s, i) => {
                        // --- badge MULTI-TF / ALL TF
                        const _k = ((s.codice || s.nome || '') + '').toUpperCase();
                        const seen = tfCoverage.get(_k);
                        const count = seen?.size ?? 1;
                        const isAll = totalTf > 0 && count === totalTf;
                        const isMulti = !isAll && count >= 2;

                        return (
                          <li
                            key={`${tf}-${s.codice || s.nome || i}`}
                            className="rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">
                                {s.nome || s.codice || `Scenario ${i + 1}`}
                                {s.direzione ? (
                                  <span
                                    className={`ml-2 text-xs rounded-full px-2 py-0.5 ${String(s.direzione).toUpperCase() === 'LONG'
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-600/40'
                                      : String(s.direzione).toUpperCase() === 'SHORT'
                                        ? 'bg-red-500/15 text-red-300 border border-red-600/40'
                                        : 'bg-neutral-700 text-neutral-200 border border-neutral-600'
                                      }`}
                                  >
                                    {String(s.direzione).toUpperCase()}
                                  </span>
                                ) : null}

                                {isAll ? (
                                  <span
                                    className="ml-2 text-[11px] rounded-full px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-600/40"
                                    title={`Presente in tutte le ${totalTf} TF`}
                                  >
                                    ALL TF
                                  </span>
                                ) : isMulti ? (
                                  <span
                                    className="ml-2 text-[11px] rounded-full px-2 py-0.5 bg-sky-500/20 text-sky-300 border border-sky-600/40"
                                    title={`Presente in ${count} TF`}
                                  >
                                    MULTI-TF
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-xs text-neutral-400">
                                Conf:&nbsp;<span className="text-neutral-200">{fmtPct(s.confidence)}</span>
                              </div>
                            </div>

                            {(s.trigger || s.descrizione) && (
                              <div className="mt-2 text-sm text-neutral-300">
                                {s.trigger && (
                                  <span className="mr-3">
                                    Trigger:&nbsp;<span className="text-neutral-100">{fmtTrigger(s.trigger)}</span>
                                  </span>
                                )}
                                {s.descrizione && (
                                  <span className="block mt-1 text-neutral-400">{s.descrizione}</span>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {/* --- Quasi-scenari del TF (in costruzione) --- */}
                    {(nearByTf.get(tf) || []).length > 0 && (
                      <div className="mt-3 px-4 pb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold tracking-wide text-amber-300">
                            IN COSTRUZIONE
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {(nearByTf.get(tf) || []).length} elementi
                          </div>
                        </div>

                        <ul className="space-y-2">
                          {(nearByTf.get(tf) || []).map((s, i) => (
                            <li
                              key={`near-${tf}-${s.codice || s.nome || i}`}
                              className="rounded-2xl border border-amber-600/40 bg-amber-500/10 px-4 py-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium">
                                  {s.nome || s.codice || `Scenario parziale ${i + 1}`}
                                  <span className="ml-2 text-[11px] rounded-full px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-600/40">
                                    IN COSTRUZIONE
                                  </span>
                                  {s.direzione ? (
                                    <span className="ml-2 text-[11px] rounded-full px-2 py-0.5 border border-neutral-600 text-neutral-200">
                                      {String(s.direzione).toUpperCase()}
                                    </span>
                                  ) : null}
                                </div>
                                {/* i quasi-scenari non hanno una Conf% “vera”: la omettiamo */}
                              </div>

                              <div className="mt-2 text-sm text-neutral-200">
                                {s.descrizione && <div className="text-neutral-300">{s.descrizione}</div>}

                                {s.trigger && (
                                  <div className="text-neutral-300">
                                    Trigger previsto:&nbsp;<span className="text-neutral-50">{fmtTrigger(s.trigger)}</span>
                                  </div>
                                )}

                                {s.missing && (
                                  <div className="text-neutral-300">
                                    Manca:&nbsp;<span className="text-neutral-50">{s.missing}</span>
                                  </div>
                                )}
                                {s.condizione && (
                                  <div className="text-neutral-300">
                                    Per completarsi:&nbsp;<span className="text-neutral-50">{s.condizione}</span>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </SafeDialogContent>
    </OverlayShell>
  );
}