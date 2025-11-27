'use client';

import { useEffect, useMemo } from 'react';
import SupportiResistenzePanel from '@/components/SupportiResistenzePanel';
import LongShortOverlay from '@/components/LongShortOverlay';

function Section({ title, children }:{title:string; children:any}) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      <div className="rounded-xl bg-black/40 ring-1 ring-white/10 p-4">{children}</div>
    </section>
  );
}

function KV({obj}:{obj:any}) {
  const entries = Object.entries(obj||{});
  if (!entries.length) return <div className="text-sm text-zinc-400">—</div>;
  return (
    <div className="grid md:grid-cols-2 gap-2 text-sm">
      {entries.map(([k,v])=>(
        <div key={k} className="rounded-lg bg-white/5 px-3 py-2">
          <div className="text-xs text-zinc-400">{k}</div>
          <div className="break-words">{typeof v==='object'? JSON.stringify(v) : String(v)}</div>
        </div>
      ))}
    </div>
  );
}

/** ---------------- Fallback helpers (robusti alle chiavi mancanti) ---------------- */
type AnyObj = Record<string, any>;
const TFS_BREVI = ["1m","3m","5m","15m","30m","1h","2h"];
const TFS_MEDI  = ["4h"];
const TFS_LUNGHI = ["6h","8h","12h","1d","3d","1w","1M"];

function pickPath(o: AnyObj, paths: string[][], def: any = undefined) {
  for (const p of paths) {
    let cur: any = o;
    let ok = true;
    for (const k of p) { cur = (cur ?? {})[k]; if (cur === undefined) { ok = false; break; } }
    if (ok && cur !== undefined) return cur;
  }
  return def;
}

function asZones(arr: any[]): {min:number,max:number,forza?:number}[] {
  if (!Array.isArray(arr)) return [];
  const parse = (x:any) => {
    if (x == null) return null;
    if (typeof x === "string") {
      const str = x.replace(",", ".");
      const m = str.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
      if (m) return { min: +m[1], max: +m[2] };
      const s = str.match(/([\d.]+)/);
      if (s) { const v = +s[1]; return { min: v, max: v }; }
      return null;
    }
    const lo = x.min ?? x.low ?? x.da ?? x.start ?? x[0];
    const hi = x.max ?? x.high ?? x.a ?? x.end ?? x[1] ?? lo;
    const f  = x.forza ?? x.strength ?? undefined;
    if (lo == null && hi == null) return null;
    const min = +(`${lo}`.replace(",", "."));
    const max = +(`${hi}`.replace(",", "."));
    return (isFinite(min) && isFinite(max)) ? { min, max, forza: f } : null;
  };
  return arr.map(parse).filter(Boolean) as any;
}

function bestZone(zones: {min:number,max:number,forza?:number}[] | undefined) {
  if (!zones?.length) return undefined;
  return zones.slice().sort(
    (a,b) => (b.forza ?? 0) - (a.forza ?? 0) || (a.max-a.min) - (b.max-b.min)
  )[0];
}

function fmtRange(z?: {min:number,max:number}) {
  if (!z) return "—";
  const same = Math.abs(z.max - z.min) < 1e-6;
  return same ? z.min.toFixed(2) : `${z.min.toFixed(2)}–${z.max.toFixed(2)}`;
}

function splitTF(trendTF: AnyObj) {
  const norm = Object.fromEntries(Object.entries(trendTF || {}).map(([k,v]) => [k, String(v ?? "").toUpperCase()]));
  const pick = (lst:string[]) => lst.filter(tf => norm[tf]).map(tf => `${tf}: ${norm[tf]}`).join(", ") || "—";
  return {
    brevi:  pick(TFS_BREVI),
    medi:   pick(TFS_MEDI),
    lunghi: pick(TFS_LUNGHI),
  };
}

function buildSpiegazioneFallback(result: AnyObj): string {
  const direzione = (pickPath(result, [
    ["direzione"], ["risposte","longshort","direzione"], ["longshort","direzione"]
  ], "NEUTRO") as string).toUpperCase();

  const score = pickPath(result, [["score"],["risposte","score"],["risposte","longshort","score"]], "—");
  const delta = pickPath(result, [["delta_score"],["delta"],["risposte","delta_score"]], "—");

  const trendTF = pickPath(result, [
    ["trend_tf"],["risposte","trend_tf"],["risposte","trend_tf_score"]
  ], {}) as AnyObj;
  const tf = splitTF(trendTF);

  const supporti = asZones(pickPath(result, [["supporti"],["risposte","supporti"],["livelli","supporti"]], []));
  const resistenze = asZones(pickPath(result, [["resistenze"],["risposte","resistenze"],["livelli","resistenze"]], []));

  const S1 = bestZone(supporti);
  const R1 = bestZone(resistenze);

  return [
    `Bias attuale: **${direzione}** (score ${score}, Δ ${delta}).`,
    `TF brevi: **${tf.brevi}**, 4h: **${trendTF["4h"]?.toString?.().toUpperCase?.() || "—"}**, TF lunghi: **${tf.lunghi}**.`,
    `Prima area di difesa: **${fmtRange(S1)}** (possibili rimbalzi).`,
    `Prima area di pressione: **${fmtRange(R1)}** (possibili respinte).`,
    `🧭 In sintesi, score complessivo **${score}** pt con prevalenza **${direzione}**.`
  ].join("\n");
}
/** ----------------------------------------------------------------------- */

export default function RiepilogoOverlay({ data }: { data: any }) {
  // Esporta l'ultimo payload in un global per i fallback della Strategia (senza toccare la UI)
  useEffect(() => {
    (globalThis as any).__CASSANDRA_LAST_RESULT__ = data;
  }, [data]);

  // Panoramica (robusta a chiavi mancanti)
  const direzione = useMemo(() => {
    const d = pickPath(data ?? {}, [
      ["direzione"],["risposte","longshort","direzione"],["longshort","direzione"]
    ], "—");
    return String(d ?? '—').toUpperCase();
  }, [data]);

  const score = useMemo(() => pickPath(data ?? {}, [["score"],["risposte","score"],["risposte","longshort","score"]], 0), [data]);
  const deltaScore = useMemo(() => {
    const v = pickPath(data ?? {}, [["delta_score"],["delta"],["risposte","delta_score"]], 0);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }, [data]);

  const srBlock = {
    supporti: data?.supporti ?? [],
    resistenze: data?.resistenze ?? [],
    supporti_extra: (data?.supporti_extra?.length ? data.supporti_extra : (data?.supporti || []).slice(3)) ?? [],
    resistenze_extra: (data?.resistenze_extra?.length ? data.resistenze_extra : (data?.resistenze || []).slice(3)) ?? [],
  };

  const liquiditaSopra = data?.liquidita_top?.sopra ?? data?.zone_liquidita?.sopra ?? [];
  const liquiditaSotto = data?.liquidita_top?.sotto ?? data?.zone_liquidita?.sotto ?? [];

  // Spiegazione: usa data.spiegazione altrimenti genera il fallback
  const spiegazioneText = useMemo(
    () => data?.spiegazione ?? buildSpiegazioneFallback(data ?? {}),
    [data]
  );

  return (
    <div className="p-5 max-h-[80vh] overflow-y-auto">
      {/* Panoramica */}
      <Section title="Panoramica">
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-zinc-400">Direzione</div>
            <div className="text-xl font-semibold">{direzione}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-zinc-400">Score</div>
            <div className="text-xl font-semibold">{score}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-zinc-400">Delta</div>
            <div className={`text-xl font-semibold ${deltaScore>=0?'text-emerald-400':'text-rose-400'}`}>
              {deltaScore>=0?'+':''}{deltaScore}
            </div>
          </div>
        </div>
        {data?.narrativa && <div className="mt-3 text-sm text-zinc-200">{data.narrativa}</div>}
      </Section>

      {/* Long/Short – tabella punteggi */}
      <Section title="Trend & Punteggi per TF">
        <LongShortOverlay data={{
          direzione: direzione, score: score, delta_score: deltaScore,
          trend_tf_score: data?.trend_tf_score || {}
        }} />
      </Section>

      {/* Liquidità */}
      <Section title="Zone di liquidità">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-400 mb-2">SOPRA (sell-side)</div>
            <div className="space-y-2">
              {(liquiditaSopra || []).slice(0,10).map((x:any, i:number)=>(
                <div key={i} className="rounded-lg bg-white/5 px-3 py-2">{x?.testo ?? JSON.stringify(x)}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-2">SOTTO (buy-side)</div>
            <div className="space-y-2">
              {(liquiditaSotto || []).slice(0,10).map((x:any, i:number)=>(
                <div key={i} className="rounded-lg bg-white/5 px-3 py-2">{x?.testo ?? JSON.stringify(x)}</div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Supporti/Resistenze */}
      <Section title="Supporti / Resistenze">
        <SupportiResistenzePanel {...srBlock} />
      </Section>

      {/* Scenari per TF (sintesi) */}
      {data?.scenari_per_tf && (
        <Section title="Scenari per TF">
          <KV obj={data.scenari_per_tf} />
        </Section>
      )}

      {/* Indicatori & co. – sezioni comprimibili se presenti */}
      {data?.indicatori_per_tf && <Section title="Indicatori per TF"><KV obj={data.indicatori_per_tf} /></Section>}
      {data?.ema_per_tf && <Section title="EMA per TF"><KV obj={data.ema_per_tf} /></Section>}
      {data?.struttura_per_tf && <Section title="Struttura per TF"><KV obj={data.struttura_per_tf} /></Section>}
      {data?.pattern_per_tf && <Section title="Pattern per TF"><KV obj={data.pattern_per_tf} /></Section>}
      {data?.minmax_per_tf && <Section title="Minimi/Massimi per TF"><KV obj={data.minmax_per_tf} /></Section>}
      {data?.volume_per_tf && <Section title="Volume per TF"><KV obj={data.volume_per_tf} /></Section>}
      {data?.pdh_pdl && <Section title="PDH/PDL"><KV obj={data.pdh_pdl} /></Section>}
      {data?.equal_highs_lows && <Section title="Equal Highs/Lows"><KV obj={data.equal_highs_lows} /></Section>}
      {data?.indicatori_sintesi && <Section title="Indicatori – Sintesi"><KV obj={data.indicatori_sintesi} /></Section>}

      {/* Spiegazione (sempre visibile: payload → oppure fallback) */}
      <Section title="Spiegazione dell’analisi">
        <div className="whitespace-pre-wrap text-sm">{spiegazioneText}</div>
      </Section>
    </div>
  );
}
