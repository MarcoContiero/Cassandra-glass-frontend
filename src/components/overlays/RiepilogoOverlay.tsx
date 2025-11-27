/* src/components/overlays/RiepilogoOverlay.tsx */
'use client';

import { OverlayShell } from "./OverlayShell";

import React from 'react';
import GenericOverlay from '../GenericOverlay';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import ChartPreview from "@/components/ChartPreview";

/* ───────────────────────── helpers ───────────────────────── */
const A = <T = any,>(v: any): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const N = (v: any): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};
const fmt = (v: any, d = 2) => {
  const n = N(v);
  return Number.isFinite(n)
    ? n!.toLocaleString('it-IT', { maximumFractionDigits: d })
    : String(v ?? '—');
};
const pick = (o: any, ...keys: string[]) => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

const TF_ORDER = ['15m', '1h', '4h', '1d', '1w'];
const orderTF = (arr: string[]) =>
  [...new Set(arr)].sort((a, b) => {
    const ia = TF_ORDER.indexOf(a);
    const ib = TF_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

/* ───────────────────── tipi per indicatori ───────────────────── */
type SideAgg = { sum: number; count: number };
type TfAgg = { long: SideAgg; short: SideAgg; neutro: SideAgg };
type IndicatorRow = { name: string; perTf: Record<string, TfAgg>; impact: number };

// normalizza il nome indicatore: "analizza_rsi" -> "rsi"
const normIndName = (s?: string) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^analizza_/, '');

/* ───────────────────── estrazioni dal payload ───────────────────── */
function extractHeader(d: any) {
  const timeframes = A<string>(d.timeframes);
  const prezzo = N(d.prezzo ?? d.price);
  const coin = d.coin ?? d.symbol ?? d.simbolo ?? '—';
  const mm = d.minmax_per_tf ?? {};
  return { coin, prezzo, timeframes, minmax: mm };
}

function extractTrend(d: any) {
  const src: Record<string, any> = d.trend_tf_score || {};

  const out: Record<
    string,
    {
      bias?: string;
      score?: number;
      long?: number;
      short?: number;
      neutro?: number;
      tot?: number;
      components?: {
        kind: 'long' | 'short' | 'neutro';
        indicatore?: string;
        scenario?: string;
        direzione?: string;
        punteggio?: number;
      }[];
    }
  > = {};

  for (const [tf, v] of Object.entries(src)) {
    const comp: any[] = [];
    for (const kind of ['long', 'short', 'neutro'] as const) {
      const items = A<any>(v?.components?.[kind]);
      for (const it of items) {
        comp.push({
          kind,
          indicatore: it?.indicatore,
          scenario: it?.scenario,
          direzione: it?.direzione,
          punteggio: it?.punteggio,
        });
      }
    }
    out[tf] = {
      bias: v?.bias,
      score: v?.score,
      long: v?.long,
      short: v?.short,
      neutro: v?.neutro,
      tot: v?.tot,
      components: comp,
    };
  }
  return out;
}

/** Indicatori derivati dalle componenti dei trend (RSI/MACD/Bollinger ecc.) */
function buildIndicatorsFromComponents(
  trendPerTF: ReturnType<typeof extractTrend>
): IndicatorRow[] {
  const out: Record<string, { byTf: Record<string, TfAgg>; impact: number }> =
    {};

  for (const [tf, node] of Object.entries(trendPerTF)) {
    for (const c of A<any>((node as any).components)) {
      const name = normIndName(c?.indicatore);
      if (!name) continue;

      if (!out[name]) out[name] = { byTf: {}, impact: 0 };
      if (!out[name].byTf[tf]) {
        out[name].byTf[tf] = {
          long: { sum: 0, count: 0 },
          short: { sum: 0, count: 0 },
          neutro: { sum: 0, count: 0 },
        };
      }

      const k: 'long' | 'short' | 'neutro' =
        c?.kind === 'long' || c?.kind === 'short' || c?.kind === 'neutro'
          ? c.kind
          : 'neutro';
      const pts = N(c?.punteggio) ?? 0;

      out[name].byTf[tf][k].sum += pts;
      out[name].byTf[tf][k].count += 1;
      out[name].impact += Math.abs(pts);
    }
  }

  const rows: IndicatorRow[] = Object.entries(out)
    .map(([name, v]) => ({ name, perTf: v.byTf, impact: v.impact }))
    .sort((a, b) => b.impact - a.impact);

  return rows;
}

type Level = {
  valore?: number;
  timeframe?: string;
  forza?: number;
  scenario?: string;
  indicatore?: string;
};
function extractLevels(d: any) {
  const sup = A<any>(d.supporti).map((x) => ({
    valore: N(x?.valore),
    timeframe: x?.timeframe,
    forza: x?.forza,
    scenario: x?.scenario,
    indicatore: x?.indicatore,
  })) as Level[];
  const res = A<any>(d.resistenze).map((x) => ({
    valore: N(x?.valore),
    timeframe: x?.timeframe,
    forza: x?.forza,
    scenario: x?.scenario,
    indicatore: x?.indicatore,
  })) as Level[];
  return { sup, res };
}

type Pool = {
  livello?: number;
  dist?: number;
  source?: string;
  tf?: string;
  range?: [number, number];
  idx?: number;
  indicatore?: string;
  timeframe?: string;
  forza?: number;
  scenario?: string;
};
function extractLiquidity(d: any) {
  const sopra = A<any>(d?.liquidity?.sopra).map((x) => ({
    livello: N(x?.livello),
    dist: N(x?.dist),
    source: x?.source,
    tf: x?.tf,
    range: x?.range,
    idx: x?.idx,
    indicatore: x?.indicatore,
    timeframe: x?.timeframe,
    forza: x?.forza,
    scenario: x?.scenario,
  })) as Pool[];
  const sotto = A<any>(d?.liquidity?.sotto).map((x) => ({
    livello: N(x?.livello),
    dist: N(x?.dist),
    source: x?.source,
    tf: x?.tf,
    range: x?.range,
    idx: x?.idx,
    indicatore: x?.indicatore,
    timeframe: x?.timeframe,
    forza: x?.forza,
    scenario: x?.scenario,
  })) as Pool[];
  const summary = d?.liquidity_summary;
  return { sopra, sotto, summary };
}

function extractLS(d: any) {
  return d?.longshort
    ? {
      direzione: d.longshort.direzione,
      score: d.longshort.score,
      motivi: A<any>(d.longshort.motivi),
    }
    : null;
}

function extractStrategiaAI(d: any) {
  return A<any>(d?.strategia_ai?.items);
}

function extractDiagnostica(d: any) {
  const dx = d?.diagnostica ?? d?.presenter?.note ?? {};
  return {
    data_collect: dx?.data_collect,
    levels: dx?.levels,
    liquidity_availability: dx?.liquidity_availability,
    liquidity_bias: dx?.liquidity_bias,
    liquidity_bias_autotune: dx?.liquidity_bias_autotune,
    ui_params: dx?.ui_params,
  };
}

function extractScenariPerTF(d: any) {
  // nel JSON d'esempio: "scenari" -> { "1d": { trend: { … } } }
  const bag = d?.scenari ?? {};
  const out: Record<string, any> = {};
  for (const [tf, node] of Object.entries<any>(bag)) {
    out[tf] = (node as any)?.trend ?? node;
  }
  return out;
}

/* ───────────────────────── componente ───────────────────────── */
type Props = { title: string; data?: any };

export default function RiepilogoOverlay({ title, data }: Props) {
  const payload =
    (typeof window !== 'undefined'
      ? (window as any).__RIEPILOGO__
      : null) || data || {};

  const header = extractHeader(payload);
  const tfs = orderTF(
    header.timeframes.length
      ? header.timeframes
      : Object.keys(payload?.trend_tf_score ?? {})
  );
  const trend = extractTrend(payload);
  const indicatorsFromComp = buildIndicatorsFromComponents(trend);
  const { sup, res } = extractLevels(payload);
  const liq = extractLiquidity(payload);
  const ls = extractLS(payload);
  const strat = extractStrategiaAI(payload);
  const diag = extractDiagnostica(payload);
  const scenariPerTF = extractScenariPerTF(payload);

  /* ---------- export TXT ---------- */
  const buildTxt = React.useCallback(() => {
    const L: string[] = [];

    // Header
    L.push(`# Riepilogo Cassandra`);
    L.push(`Symbol: ${header.coin ?? '-'}`);
    if (Number.isFinite(header.prezzo)) L.push(`Prezzo: ${fmt(header.prezzo)}`);
    if (tfs.length) L.push(`Timeframes: ${tfs.join(' | ')}`);
    if (header.minmax?.['1d'])
      L.push(`1d H/L: ${fmt(header.minmax['1d']?.high)} / ${fmt(header.minmax['1d']?.low)}`);
    L.push('');

    // Long/Short sintetico
    if (ls) {
      L.push(`== Direzione sintetica ==`);
      L.push(`Direzione: ${ls.direzione} | Score: ${fmt(ls.score)}`);
      if (ls.motivi?.length) {
        L.push(`Motivi:`);
        for (const m of ls.motivi) L.push(` - ${String(m)}`);
      }
      L.push('');
    }

    // Trend + componenti
    L.push(`== Trend per timeframe ==`);
    for (const tf of tfs) {
      const t = (trend as any)[tf] ?? {};
      L.push(
        `• ${tf}: bias=${t.bias ?? 'NEUTRO'} | score=${fmt(t.score)} | long=${fmt(
          t.long
        )} | short=${fmt(t.short)} | neutro=${fmt(t.neutro)} | tot=${fmt(t.tot, 0)}`
      );
      const comps = A<any>(t.components);
      for (const c of comps) {
        L.push(
          `   - ${String(c.kind).toUpperCase()} · ${c.indicatore ?? '—'}${c.scenario ? ` (${c.scenario})` : ''
          }${c.direzione ? ` dir:${c.direzione}` : ''} · +${fmt(c.punteggio, 0)}`
        );
      }
    }
    L.push('');

    // Indicatori aggregati
    if (indicatorsFromComp.length) {
      L.push(`== Indicatori (aggregati) ==`);
      for (const row of indicatorsFromComp) {
        const parts: string[] = [];
        for (const tf of orderTF(Object.keys(row.perTf))) {
          const b = row.perTf[tf];
          const chunk: string[] = [];
          if (b.long.count) chunk.push(`LONG +${fmt(b.long.sum, 0)} (${b.long.count})`);
          if (b.short.count) chunk.push(`SHORT +${fmt(b.short.sum, 0)} (${b.short.count})`);
          if (b.neutro.count) chunk.push(`NEUTRO +${fmt(b.neutro.sum, 0)} (${b.neutro.count})`);
          parts.push(`${tf}: ${chunk.join(' · ') || '—'}`);
        }
        L.push(`• ${row.name.toUpperCase()} | Impatto: ${fmt(row.impact, 0)} | ${parts.join(' | ')}`);
      }
      L.push('');
    }

    // Supporti / Resistenze
    L.push(`== Supporti (${sup.length}) ==`);
    for (const s of sup)
      L.push(
        `• ${fmt(s.valore)}  [TF:${s.timeframe ?? '-'}${s.scenario ? ` · ${s.scenario}` : ''}${s.forza != null ? ` · forza:${fmt(s.forza, 0)}` : ''
        }] (${s.indicatore ?? 'supporto'})`
      );
    L.push('');
    L.push(`== Resistenze (${res.length}) ==`);
    for (const r of res)
      L.push(
        `• ${fmt(r.valore)}  [TF:${r.timeframe ?? '-'}${r.scenario ? ` · ${r.scenario}` : ''}${r.forza != null ? ` · forza:${fmt(r.forza, 0)}` : ''
        }] (${r.indicatore ?? 'resistenza'})`
      );
    L.push('');

    // Liquidità
    L.push(`== Liquidità (sopra: ${liq.sopra.length} | sotto: ${liq.sotto.length}) ==`);
    L.push(`-- Sopra --`);
    for (const p of liq.sopra)
      L.push(
        `• ${fmt(p.livello)}  dist:${fmt(p.dist)}  src:${p.source ?? p.indicatore ?? '-'}  TF:${p.tf ?? p.timeframe ?? '-'}${p.range ? `  range:${fmt(p.range[0])}-${fmt(p.range[1])}` : ''
        }${p.idx != null ? `  idx:${p.idx}` : ''}${p.scenario ? `  ${p.scenario}` : ''}${p.forza != null ? `  forza:${fmt(p.forza, 0)}` : ''
        }`
      );
    L.push(`-- Sotto --`);
    for (const p of liq.sotto)
      L.push(
        `• ${fmt(p.livello)}  dist:${fmt(p.dist)}  src:${p.source ?? p.indicatore ?? '-'}  TF:${p.tf ?? p.timeframe ?? '-'}${p.range ? `  range:${fmt(p.range[0])}-${fmt(p.range[1])}` : ''
        }${p.idx != null ? `  idx:${p.idx}` : ''}${p.scenario ? `  ${p.scenario}` : ''}${p.forza != null ? `  forza:${fmt(p.forza, 0)}` : ''
        }`
      );
    if (liq.summary) {
      L.push('');
      L.push(`-- Liquidity summary --`);
      const s = liq.summary;
      if (s.nearest_above)
        L.push(
          `Nearest above: ${fmt(s.nearest_above.livello)}  dist:${fmt(s.nearest_above.dist)}  src:${s.nearest_above.source ?? '-'}`
        );
      if (s.nearest_below)
        L.push(
          `Nearest below: ${fmt(s.nearest_below.livello)}  dist:${fmt(s.nearest_below.dist)}  src:${s.nearest_below.source ?? '-'}${A(s.nearest_below.range).length === 2
            ? `  range:${fmt(s.nearest_below.range[0])}-${fmt(s.nearest_below.range[1])}`
            : ''
          }${s.nearest_below.tf ? `  TF:${s.nearest_below.tf}` : ''}`
        );
      if (s.weights) L.push(`Weights up:${fmt(s.weights.up)}  down:${fmt(s.weights.down)}  delta:${fmt(s.delta)}`);
      if (s.k != null || s.dist_pct != null) L.push(`k:${fmt(s.k, 0)}  dist_pct:${fmt(s.dist_pct, 4)}`);
    }
    L.push('');

    // Scenari per TF (dump sintetico)
    const scenKeys = Object.keys(scenariPerTF);
    if (scenKeys.length) {
      L.push('== Scenari (per timeframe) ==');
      for (const tf of scenKeys) {
        L.push(`• ${tf}`);
        L.push(JSON.stringify((scenariPerTF as any)[tf], null, 2));
      }
      L.push('');
    }

    // Strategia AI
    if (strat.length) {
      L.push('== Strategia AI ==');
      for (const s of strat) {
        L.push(`• ${s.titolo ?? '—'}`);
        if (s.descrizione) L.push(`  ${s.descrizione}`);
        L.push(
          `  TF:${s.tf ?? '-'}  confidenza:${fmt(s.confidenza, 2)}  prezzo_rif:${fmt(s.prezzo_riferimento)}`
        );
      }
      L.push('');
    }

    // Diagnostica (compatta)
    if (diag.data_collect || diag.levels || diag.liquidity_availability || diag.liquidity_bias || diag.liquidity_bias_autotune || diag.ui_params) {
      L.push('== Diagnostica ==');
      if (diag.data_collect) L.push(`data_collect: ${JSON.stringify(diag.data_collect)}`);
      if (diag.levels) L.push(`levels: ${JSON.stringify(diag.levels)}`);
      if (diag.liquidity_availability) L.push(`liquidity_availability: ${JSON.stringify(diag.liquidity_availability)}`);
      if (diag.liquidity_bias) L.push(`liquidity_bias: ${JSON.stringify(diag.liquidity_bias)}`);
      if (diag.liquidity_bias_autotune) L.push(`liquidity_bias_autotune: ${JSON.stringify(diag.liquidity_bias_autotune)}`);
      if (diag.ui_params) L.push(`ui_params: ${JSON.stringify(diag.ui_params)}`);
    }

    return L.join('\n');
  }, [header, tfs, trend, indicatorsFromComp, sup, res, liq, scenariPerTF, strat, diag, ls]);

  const downloadTxt = React.useCallback(() => {
    const text = buildTxt();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = (header.coin ? String(header.coin) : 'riepilogo').replace(/[^\w.-]+/g, '_');
    a.download = `${base}_riepilogo.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [buildTxt, header.coin]);

  return (
    <OverlayShell>
      <GenericOverlay title={title} data={undefined}>
        {/* Header + pulsante download */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm text-white/80">
            {header.coin && (
              <span className="mr-2">
                • <b>Symbol:</b> {String(header.coin)}
              </span>
            )}
            {Number.isFinite(header.prezzo) && (
              <span>
                • <b>Prezzo:</b> {fmt(header.prezzo)}
              </span>
            )}
            {!!tfs.length && (
              <span className="ml-2">
                • <b>TF:</b> {tfs.join(' · ')}
              </span>
            )}
            {header.minmax && header.minmax['1d'] && (
              <span className="ml-2">
                • <b>1d</b> H/L: {fmt(header.minmax['1d']?.high)} /{' '}
                {fmt(header.minmax['1d']?.low)}
              </span>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={downloadTxt}>
            Scarica .txt
          </Button>
        </div>

        <Accordion type="multiple" className="space-y-2">
          {/* Direzione sintetica */}
          {ls && (
            <AccordionItem value="ls">
              <AccordionTrigger>Direzione sintetica (Long/Short)</AccordionTrigger>
              <AccordionContent>
                <div className="text-sm">
                  Direzione: <b>{ls.direzione}</b> · Score:{' '}
                  <b>{fmt(ls.score)}</b>
                  {ls.motivi.length > 0 && (
                    <div className="mt-2 text-white/80">
                      <div className="text-white/60 text-xs mb-1">Motivi</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {ls.motivi.map((m: any, i: number) => (
                          <li key={i}>{String(m)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Trend + componenti */}
          <AccordionItem value="trend">
            <AccordionTrigger>Trend e bias per timeframe</AccordionTrigger>
            <AccordionContent>
              {tfs.length ? (
                <div className="space-y-3">
                  {tfs.map((tf) => {
                    const t = (trend as any)[tf] ?? {};
                    return (
                      <div
                        key={tf}
                        className="rounded-xl border border-white/10 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-white/70">{tf}</div>
                          <div className="text-sm text-white/60">
                            Tot: {fmt(t.tot, 0)}
                          </div>
                        </div>
                        <div className="text-base font-semibold uppercase">
                          {t.bias ?? 'NEUTRO'}
                        </div>
                        <div className="mt-1 text-xs text-white/60">
                          Score: {fmt(t.score)} · Long: {fmt(t.long)} · Short:{' '}
                          {fmt(t.short)} · Neutro: {fmt(t.neutro)}
                        </div>

                        {A<any>(t.components).length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs text-white/60 mb-1">
                              Componenti (indicatori/scenari che contribuiscono)
                            </div>
                            <div className="max-h-[28vh] overflow-auto pr-1 space-y-1 text-sm">
                              {A<any>(t.components).map((c, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between rounded border border-white/10 px-2 py-1"
                                >
                                  <div className="truncate">
                                    <b className="uppercase">{c.kind}</b> ·{' '}
                                    {c.indicatore ?? '—'}
                                    {c.scenario ? (
                                      <span className="text-white/60">
                                        {' '}
                                        — {c.scenario}
                                      </span>
                                    ) : null}
                                    {c.direzione ? (
                                      <span className="text-white/60">
                                        {' '}
                                        — dir: {c.direzione}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="shrink-0 text-xs text-white/80">
                                    +{fmt(c.punteggio, 0)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-white/70">
                  Nessun timeframe disponibile.
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Indicatori (derivati dai componenti) */}
          {indicatorsFromComp.length > 0 && (
            <AccordionItem value="ind-comp">
              <AccordionTrigger>Indicatori (derivati dai componenti)</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 max-h-[45vh] overflow-auto pr-1">
                  {indicatorsFromComp.map(({ name, perTf, impact }) => (
                    <div
                      key={name}
                      className="rounded-xl border border-white/10 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-white/70 uppercase">
                          {name}
                        </div>
                        <div className="text-xs text-white/60">
                          Impatto: {fmt(impact, 0)}
                        </div>
                      </div>
                      <div className="text-sm text-white/90 mt-1">
                        {orderTF(Object.keys(perTf))
                          .map((tf) => {
                            const b = perTf[tf];
                            const parts: string[] = [];
                            if (b.long.count)
                              parts.push(
                                `LONG +${fmt(b.long.sum, 0)} (${b.long.count})`
                              );
                            if (b.short.count)
                              parts.push(
                                `SHORT +${fmt(b.short.sum, 0)} (${b.short.count})`
                              );
                            if (b.neutro.count)
                              parts.push(
                                `NEUTRO +${fmt(b.neutro.sum, 0)} (${b.neutro.count
                                })`
                              );
                            return `${tf}: ${parts.join(' · ') || '—'}`;
                          })
                          .join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Supporti / Resistenze */}
          <AccordionItem value="levels">
            <AccordionTrigger>Supporti / Resistenze (dettaglio)</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-sm text-white/70 mb-2">
                    Supporti ({sup.length})
                  </div>
                  <div className="space-y-1 max-h-[35vh] overflow-auto pr-1 text-sm">
                    {sup.length ? (
                      sup.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              {s.indicatore ?? 'Supporto'}
                            </div>
                            <div className="text-xs text-white/60">
                              {s.timeframe ? `TF: ${s.timeframe}` : ''}
                              {s.scenario ? ` · ${s.scenario}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold">{fmt(s.valore)}</div>
                            {s.forza !== undefined && (
                              <div className="text-xs text-white/60">
                                Forza: {fmt(s.forza, 0)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-white/60">Nessun supporto.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 p-3">
                  <div className="text-sm text-white/70 mb-2">
                    Resistenze ({res.length})
                  </div>
                  <div className="space-y-1 max-h-[35vh] overflow-auto pr-1 text-sm">
                    {res.length ? (
                      res.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              {r.indicatore ?? 'Resistenza'}
                            </div>
                            <div className="text-xs text-white/60">
                              {r.timeframe ? `TF: ${r.timeframe}` : ''}
                              {r.scenario ? ` · ${r.scenario}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold">{fmt(r.valore)}</div>
                            {r.forza !== undefined && (
                              <div className="text-xs text-white/60">
                                Forza: {fmt(r.forza, 0)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-white/60">Nessuna resistenza.</div>
                    )}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Liquidità + summary */}
          <AccordionItem value="liq">
            <AccordionTrigger>Liquidità (pool sopra / sotto)</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['sopra', 'sotto'] as const).map((side) => (
                  <div key={side} className="rounded-xl border border-white/10 p-3">
                    <div className="text-sm text-white/70 mb-2">
                      {side === 'sopra' ? 'Sopra' : 'Sotto'} (
                      {(side === 'sopra' ? liq.sopra : liq.sotto).length})
                    </div>
                    <div className="space-y-1 max-h-[35vh] overflow-auto pr-1 text-sm">
                      {(side === 'sopra' ? liq.sopra : liq.sotto).map((p, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              {p.source ?? p.indicatore ?? 'pool'}
                              {p.range ? (
                                <span className="text-white/60">
                                  {' '}
                                  — range {fmt(p.range[0])}–{fmt(p.range[1])}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-white/60">
                              {p.tf ? `TF: ${p.tf}` : p.timeframe ? `TF: ${p.timeframe}` : ''}
                              {p.idx != null ? ` · idx: ${p.idx}` : ''}
                              {p.scenario ? ` · ${p.scenario}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold">{fmt(p.livello)}</div>
                            <div className="text-xs text-white/60">
                              dist: {fmt(p.dist)}
                            </div>
                            {p.forza !== undefined && (
                              <div className="text-xs text-white/60">
                                forza: {fmt(p.forza, 0)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {liq.summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-white/70 text-xs mb-1">Nearest above</div>
                    <div>
                      Livello: <b>{fmt(liq.summary?.nearest_above?.livello)}</b>
                    </div>
                    <div>Dist: {fmt(liq.summary?.nearest_above?.dist)}</div>
                    <div>Source: {String(liq.summary?.nearest_above?.source ?? '—')}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-white/70 text-xs mb-1">Nearest below</div>
                    <div>
                      Livello: <b>{fmt(liq.summary?.nearest_below?.livello)}</b>
                    </div>
                    <div>Dist: {fmt(liq.summary?.nearest_below?.dist)}</div>
                    <div>Source: {String(liq.summary?.nearest_below?.source ?? '—')}</div>
                    {A(liq.summary?.nearest_below?.range).length === 2 && (
                      <div>
                        Range: {fmt(liq.summary.nearest_below.range[0])} –{' '}
                        {fmt(liq.summary.nearest_below.range[1])}
                      </div>
                    )}
                    {liq.summary?.nearest_below?.tf && (
                      <div>TF: {String(liq.summary.nearest_below.tf)}</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 p-3">
                    <div className="text-white/70 text-xs mb-1">Pesi / Delta</div>
                    <div>Up: {fmt(liq.summary?.weights?.up)}</div>
                    <div>Down: {fmt(liq.summary?.weights?.down)}</div>
                    <div>Delta: {fmt(liq.summary?.delta)}</div>
                    <div>
                      K: {fmt(liq.summary?.k, 0)} · dist_pct:{' '}
                      {fmt(liq.summary?.dist_pct, 4)}
                    </div>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Scenari (dal blocco "scenari" del payload) */}
          {Object.keys(scenariPerTF).length > 0 && (
            <AccordionItem value="scenari-tf">
              <AccordionTrigger>Scenari (per timeframe)</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {Object.entries(scenariPerTF).map(([tf, node]) => (
                    <div key={tf} className="rounded-xl border border-white/10 p-3">
                      <div className="text-sm text-white/70 mb-1">Timeframe {tf}</div>
                      {node && typeof node === 'object' ? (
                        <pre className="text-xs whitespace-pre-wrap wrap-break-words text-white/80">
                          {JSON.stringify(node, null, 2)}
                        </pre>
                      ) : (
                        <div className="text-sm text-white/60">—</div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Strategia AI */}
          {strat.length > 0 && (
            <AccordionItem value="strategia-ai">
              <AccordionTrigger>Strategia AI</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  {strat.map((s: any, i: number) => (
                    <div key={i} className="rounded-xl border border-white/10 p-3">
                      <div className="font-medium">{s.titolo ?? '—'}</div>
                      <div className="text-white/80">{s.descrizione ?? '—'}</div>
                      <div className="text-white/60 text-xs mt-1">
                        TF: {s.tf ?? '—'} · Confidenza: {fmt(s.confidenza, 2)} · Prezzo rif.:{' '}
                        {fmt(s.prezzo_riferimento)}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Diagnostica */}
          {(diag.data_collect ||
            diag.levels ||
            diag.liquidity_availability ||
            diag.liquidity_bias ||
            diag.liquidity_bias_autotune ||
            diag.ui_params) && (
              <AccordionItem value="diagnostica">
                <AccordionTrigger>Diagnostica</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {diag.data_collect && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">
                          Data Collect / Provider
                        </div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.data_collect, null, 2)}
                        </pre>
                      </div>
                    )}
                    {diag.levels && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">Levels</div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.levels, null, 2)}
                        </pre>
                      </div>
                    )}
                    {diag.liquidity_availability && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">
                          Liquidity availability
                        </div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.liquidity_availability, null, 2)}
                        </pre>
                      </div>
                    )}
                    {diag.liquidity_bias && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">
                          Liquidity bias
                        </div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.liquidity_bias, null, 2)}
                        </pre>
                      </div>
                    )}
                    {diag.liquidity_bias_autotune && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">
                          Liquidity bias autotune
                        </div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.liquidity_bias_autotune, null, 2)}
                        </pre>
                      </div>
                    )}
                    {diag.ui_params && (
                      <div className="rounded-xl border border-white/10 p-3">
                        <div className="text-xs text-white/60 mb-1">UI params</div>
                        <pre className="whitespace-pre-wrap wrap-break-words text-white/80 text-xs">
                          {JSON.stringify(diag.ui_params, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
        </Accordion>
      </GenericOverlay>
    </OverlayShell>
  );
}
