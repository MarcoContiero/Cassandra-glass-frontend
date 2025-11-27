'use client';

import React, { Fragment, useMemo, useState, useCallback } from 'react';
import { Dialog as MinorContent, DialogHeader as MinorHeader, DialogTitle as MinorTitle } from '@/components/ui/dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SafeDialogContent from '@/components/ui/SafeDialogContent';
import { OverlayShell } from "./OverlayShell";

/* ========== helpers ========== */
// --- Strength helpers ---
const TF_WEIGHTS: Record<string, number> = { '15m': 1, '30m': 1.3, '45m': 1.5, '1h': 2, '4h': 3, '1d': 4, '1w': 5 };

const parseTFList = (tfStr?: string): string[] =>
  String(tfStr || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

const naturaFromSourceLite = (src?: string, fallback?: string) => {
  const s = String(src || '').toUpperCase();

  // Se non ho source ma ho una "famiglia" di fallback, usala
  if (!s && fallback) return fallback;

  // Famiglie principali riconoscibili dal prefix
  if (s.startsWith('FIBO')) return 'Fibonacci';
  if (s.startsWith('ROUND')) return 'Round number';
  if (s.startsWith('FVG')) return 'FVG';
  if (s.startsWith('SWING')) return 'Swing';

  // Liquidity / orderbook
  if (s.includes('LIQUID')) return 'Liquidity';
  if (s.includes('ORDERBLOCK') || s === 'OB' || s.startsWith('OB_')) return 'Orderblock';

  // Pattern (candlestick, pattern vari)
  if (s.includes('PATTERN')) return 'Pattern';

  // SR tecnici (supporti/resistenze, SR_TECH, ecc.)
  if (
    s.includes('SUPPORT') ||
    s.includes('SUPPORTO') ||
    s.includes('RESIST') ||
    s === 'SR' ||
    s.startsWith('SR_') ||
    s === 'SR_TECH'
  ) {
    return 'Tecnico';
  }

  // Default
  return fallback || 'Tecnico';
};

// Parser numeri "it-IT" (12.345,67 -> 12345.67)
function toNumIt(x: any): number | undefined {
  if (x == null) return undefined;
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  let s = String(x).trim();
  if (!s) return undefined;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(/,/g, '.');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function removeMembersInsideZones(rows: SRRow[], eps = 1e-9) {
  const zones = rows.filter(z =>
    Number.isFinite(z.min as number) && Number.isFinite(z.max as number)
  );
  if (!zones.length) return rows;

  return rows.filter(r => {
    const m = toNumIt(r.mid);
    if (!Number.isFinite(m)) return true;
    // tieni la riga zona (ha min/max)…
    if (Number.isFinite(r.min as number) && Number.isFinite(r.max as number)) return true;
    // …scarta i singoli se ricadono dentro QUALSIASI zona
    return !zones.some(z => {
      const zmin = toNumIt(z.min); const zmax = toNumIt(z.max);
      return Number.isFinite(zmin) && Number.isFinite(zmax) && m! >= zmin! - eps && m! <= zmax! + eps;
    });
  });
}

// forza basata su: TF (peso max), #confluenze (natura distinte), impulso (FVG/SWING)
function computeZoneForza(
  members: Array<{ tf?: string; source?: string; natura?: string; forza?: number }>
): number {
  // TF: prendi il peso massimo tra tutti i TF presenti nei member
  const tfSet = new Set<string>();
  members.forEach(m => parseTFList(m.tf).forEach(t => tfSet.add(t)));
  const tfW = Math.max(1, ...Array.from(tfSet).map(t => TF_WEIGHTS[t] || 1));

  // Confluenze: quante nature distinte nella zona (Tecnico/FVG/Swing/Round/Fibonacci/…)
  const natSet = new Set<string>();
  let hasFVG = false, hasSwing = false;
  for (const m of members) {
    const nat = naturaFromSourceLite(m.source, m.natura);
    natSet.add(nat);
    const s = String(m.source || '').toUpperCase();
    if (s.startsWith('FVG_')) hasFVG = true;
    if (s.startsWith('SWING_')) hasSwing = true;
  }
  const confl = natSet.size;

  // Impulso: FVG (+2) e Swing (+1), capped a 3
  const impulse = Math.min(3, (hasFVG ? 2 : 0) + (hasSwing ? 1 : 0));

  // Formula semplice e leggibile; scala e clamp 1..6
  const raw = 0.8 * tfW + 1.2 * Math.log1p(confl) + impulse; // tipicamente 2..6
  return Math.max(1, Math.min(6, Math.round(raw)));
}

// Legge il prezzo da più chiavi usate dal backend
const midFrom = (raw: any): number | undefined =>
  toNumFlex(first(raw, ['livello'])) ??      // priorità
  toNumFlex(first(raw, ['valore'])) ??
  toNumFlex(first(raw, ['mid'])) ??
  toNumFlex(first(raw, ['level', 'price', 'prezzo']));

const get = (o: any, p: string) =>
  p.split('.').reduce((a: any, k) => (a && a[k] != null ? a[k] : undefined), o);

const first = (o: any, paths: string[]) => {
  for (const p of paths) {
    const v = get(o, p);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

const toNumFlex = (v: any): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return undefined;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(/,/g, '.');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const nice = (n?: number, maxFrac = 2) =>
  Number.isFinite(n as number)
    ? (n as number).toLocaleString(undefined, { maximumFractionDigits: maxFrac })
    : '—';

const compactTF = (tf?: string) => {
  if (!tf) return '';
  const t = String(tf).trim().toLowerCase();
  if (t === '1m' || t === '1min') return '1m';
  if (t === '5m' || t === '5min') return '5m';
  if (t === '15m' || t === '15min') return '15m';
  if (t === '30m') return '30m';
  if (t === '45m') return '45m';
  if (t === '1h' || t === '60m') return '1h';
  if (t === '4h') return '4h';
  if (t === '12h') return '12h';
  if (t === '1d' || t === 'daily' || t === 'd') return '1d';
  if (t === '1w' || t === 'weekly' || t === 'w') return '1w';
  return tf;
};

const fmtTFs = (raw: any) => {
  const t = raw?.tfs ?? raw?.tf ?? raw?.timeframe;
  const arr = Array.isArray(t) ? t : t ? [t] : [];
  return arr.map((x: any) => compactTF(String(x))).join(', ');
};

// Deduplica per (natura, tf) sullo stesso livello di prezzo (tolleranza ±0.5)
function dedupeRows(rows: SRRow[], eps = 0.5): SRRow[] {
  const out: SRRow[] = [];
  for (const r of rows) {
    const mid = r.mid as number;
    if (!Number.isFinite(mid)) { out.push(r); continue; }

    const tf = String(r.tf || '').toLowerCase();
    const nat = String(r.natura || 'Tecnico');

    const found = out.find(x =>
      Number.isFinite(x.mid as number) &&
      Math.abs((x.mid as number) - mid) <= eps &&
      String(x.natura || 'Tecnico') === nat &&
      String(x.tf || '').toLowerCase() === tf
    );

    if (found) {
      const lvA = Number(found.livelli ?? 0), lvB = Number(r.livelli ?? 0);
      const foA = Number(found.forza ?? 0), foB = Number(r.forza ?? 0);
      found.livelli = (lvA || lvB) ? Math.max(lvA, lvB) : found.livelli;
      found.forza = (foA || foB) ? Math.max(foA, foB) : found.forza;
      continue;
    }

    out.push(r);
  }
  return out;
}

/* ========== tipi ========== */
type ZoneDetail =
  | { method: 'backend' }
  | { method: 'zone_cluster'; members: Array<{ mid: number; natura: string; tf?: string; source?: string; forza?: number }> }
  | { method: 'fibo_derivato'; anchors: { hi: number; lo: number; tf?: string } };

type SRRow = {
  zona: string;
  mid?: number;
  livelli?: number;
  forza?: number;
  tf?: string;
  natura?: string;
  source?: string;
  _details?: ZoneDetail;
  // range zona (usato dal clustering)
  min?: number;
  max?: number;
  // magnetismo orderbook (solo per livelli da liquidità)
  magnet?: number;

  // 🔽 campi orderbook opzionali (se arrivano dal liquidity_builder)
  size?: number;
  size_reale?: number;
  size_sint?: number;
  wall_notional?: number;
  wall_ratio?: number;
  difficulty?: string;
  penetration_score?: number;
  confluence_count?: number;
};

/* ========== 1) estrazione “tecnica” ========== */
function extractBaseSR(data: any) {
  let rawSup: any[] = [];
  let rawRes: any[] = [];

  if (Array.isArray(data)) {
    const tag = String(
      (data[0] && (data[0].indicatore || data[0].tipo || data[0].kind || data[0].source)) || ''
    ).toLowerCase();
    if (tag.includes('res')) rawRes = data;
    else rawSup = data;
  } else {
    // Prova varie posizioni: top-level, operativa, blocco SR, risposte...
    rawSup =
      (first(data, ['supporti']) as any[]) ||
      (first(data, ['operativa.supporti']) as any[]) ||
      (first(data, ['supporti_resistenze.supporti']) as any[]) ||
      (first(data, ['sr.supporti']) as any[]) ||
      (first(data, ['risposte.supporti']) as any[]) ||
      [];
    rawRes =
      (first(data, ['resistenze']) as any[]) ||
      (first(data, ['operativa.resistenze']) as any[]) ||
      (first(data, ['supporti_resistenze.resistenze']) as any[]) ||
      (first(data, ['sr.resistenze']) as any[]) ||
      (first(data, ['risposte.resistenze']) as any[]) ||
      [];

    // Fallback difensivi per vecchie strutture
    if (!Array.isArray(rawSup) && Array.isArray((data as any)?.supporti)) {
      rawSup = (data as any).supporti;
    }
    if (!Array.isArray(rawSup) && Array.isArray((data as any)?.operativa?.supporti)) {
      rawSup = (data as any).operativa.supporti;
    }
    if (!Array.isArray(rawRes) && Array.isArray((data as any)?.resistenze)) {
      rawRes = (data as any).resistenze;
    }
    if (!Array.isArray(rawRes) && Array.isArray((data as any)?.operativa?.resistenze)) {
      rawRes = (data as any).operativa.resistenze;
    }
  }

  const mapOne = (it: any): SRRow => {
    const zonaStr =
      (first(it, ['zona']) ?? first(it, ['zona_str']) ?? first(it, ['range']) ?? '—') as string;

    const mid = midFrom(it);

    const livelli =
      (toNumFlex(first(it, ['livelli', 'levels'])) as number | undefined) ?? 1;

    const forza =
      (toNumFlex(first(it, ['forza', 'strength', 'score'])) as number | undefined) ?? 1;

    const tfs = first(it, ['tf']) ?? first(it, ['tfs']) ?? first(it, ['timeframe']);
    const tf =
      Array.isArray(tfs)
        ? tfs.map((t: any) => compactTF(String(t))).join(', ')
        : tfs
          ? compactTF(String(tfs))
          : '';

    const natura = (first(it, ['natura']) as string) || 'Tecnico';

    return {
      zona: String(zonaStr),
      mid,
      livelli,
      forza,
      tf,
      natura,
      source: 'SR_TECH',
      _details: { method: 'backend' },
    };
  };

  const supporti = (rawSup || []).map(mapOne);
  const resistenze = (rawRes || []).map(mapOne);
  return { supporti, resistenze };
}

/* ========== 2) merge: ROUND/FVG/SWING/FIBO + LIQUIDITY ========== */
function extractLiquidityUnified(data: any) {
  // Fonti valide di liquidità
  const isLiqSource = (src: any) => {
    const s = String(src || '').toUpperCase();
    return (
      s.startsWith('FVG_') ||
      s.startsWith('SWING_') ||
      s.startsWith('ROUND_') ||
      s.startsWith('FIBO_') ||
      s === 'SR_RES' || s === 'SR_SUP'
    );
  };

  const normOne = (it: any) => {
    const magnetRaw =
      first(it, ['magnet']) ??
      first(it, ['orderbook_share']) ??
      first(it, ['orderbook_pct']) ??
      first(it, ['size_pct']);

    return {
      mid: midFrom(it),
      tf: fmtTFs(it) || (typeof it?.tf === 'string' ? compactTF(it.tf) : ''),
      source: String((it as any)?.source ?? (it as any)?.fonte ?? '').toUpperCase(),
      range: Array.isArray(it?.range) ? it.range.slice(0, 2) : undefined,
      forza: toNumFlex(it?.forza),
      livelli: toNumFlex(it?.livelli),
      magnet: toNumFlex(magnetRaw),
      // 🔽 campi extra di orderbook se presenti nel JSON
      size: toNumFlex(first(it, ['size'])),
      size_reale: toNumFlex(first(it, ['size_reale'])),
      size_sint: toNumFlex(first(it, ['size_sint'])),
      wall_notional: toNumFlex(first(it, ['wall_notional'])),
      wall_ratio: toNumFlex(first(it, ['wall_ratio'])),
      difficulty: first(it, ['difficulty']) as string | undefined,
      penetration_score: toNumFlex(first(it, ['penetration_score'])),
      confluence_count: toNumFlex(first(it, ['confluence_count'])),
      raw: it,
    };
  };

  const pushVals = (val: any, target: 'above' | 'below', aboveAll: any[], belowAll: any[]) => {
    const pushArr = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      const clean = arr.filter((it) => isLiqSource((it as any)?.source ?? (it as any)?.fonte)); // 🔑 fonte||source
      if (clean.length) (target === 'above' ? aboveAll : belowAll).push(...clean);
    };
    if (!val) return;
    if (Array.isArray(val)) return pushArr(val);
    if (typeof val === 'object') {
      for (const subv of Object.values(val)) {
        if (Array.isArray(subv)) pushArr(subv);
        else if (subv && typeof subv === 'object') {
          for (const subv2 of Object.values(subv as any)) {
            if (Array.isArray(subv2)) pushArr(subv2 as any[]);
          }
        }
      }
    }
  };

  const aboveAll: any[] = [];
  const belowAll: any[] = [];

  // 1) Se esiste, usa DIRETTAMENTE data.liquidity (o alias noti)
  const pack =
    first(data, ['liquidity']) ??
    first(data, ['operativa.liquidita']) ??   // nuovo: blocco operativa.liquidita
    first(data, ['operativa.liquidity']) ??   // nel dubbio, anche versione inglese
    first(data, ['livelli_liquidita']) ??
    first(data, ['livelli_liquidità']) ??
    first(data, ['liquidity_levels']) ??
    null;

  if (pack) {
    pushVals((pack as any)?.sopra ?? (pack as any)?.above, 'above', aboveAll, belowAll);
    pushVals((pack as any)?.sotto ?? (pack as any)?.below, 'below', aboveAll, belowAll);
  } else {
    // 2) Fallback: scan profondo qualunque chiave “sopra/above” / “sotto/below”
    const keyMatch = (k: string, group: 'above' | 'below') => {
      const s = k.toLowerCase();
      return group === 'above' ? /(sopra|above|over|up)/.test(s) : /(sotto|below|under|down)/.test(s);
    };
    const seen = new Set<any>();
    const stack: any[] = [data];

    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
      seen.add(cur);

      for (const [k, v] of Object.entries(cur)) {
        if (keyMatch(k, 'above')) pushVals(v, 'above', aboveAll, belowAll);
        if (keyMatch(k, 'below')) pushVals(v, 'below', aboveAll, belowAll);
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  }

  // normalizza + filtra numerici
  const normAbove = aboveAll.map(normOne).filter((x) => Number.isFinite(x.mid as number));
  const normBelow = belowAll.map(normOne).filter((x) => Number.isFinite(x.mid as number));

  // dedup (stesso mid ±0.5, stessa source, stesso tf)
  const dedupe = (arr: any[]) => {
    const out: any[] = [];
    for (const r of arr) {
      const hit = out.find(
        (x) =>
          Math.abs((x.mid as number) - (r.mid as number)) <= 0.5 &&
          String(x.source) === String(r.source) &&
          String(x.tf).toLowerCase() === String(r.tf).toLowerCase()
      );
      if (!hit) out.push(r);
      else {
        hit.forza = Math.max(Number(hit.forza ?? 0), Number(r.forza ?? 0)) || hit.forza;
        hit.livelli = Math.max(Number(hit.livelli ?? 0), Number(r.livelli ?? 0)) || hit.livelli;
        const magA = Number(hit.magnet ?? 0), magB = Number(r.magnet ?? 0);
        if (magB > magA) hit.magnet = magB;
      }
    }
    return out;
  };

  const above = dedupe(normAbove);
  const below = dedupe(normBelow);

  // sonde per DevTools
  if (typeof window !== 'undefined') {
    (window as any).__SR_LIQ_RAW__ = { rawAbove: aboveAll, rawBelow: belowAll }; // già filtrati
    console.debug('[SR] liquidity raw (filtered):', { above: aboveAll.length, below: belowAll.length });
  }

  return { above, below };
}

function mergeLiquidity(data: any, baseSup: SRRow[], baseRes: SRRow[]) {
  const { above, below } = extractLiquidityUnified(data);

  const outSup = baseSup.slice();
  const outRes = baseRes.slice();

  // consideriamo anche SWING_ come extra valido
  const isExtra = (src = '') =>
    ['ROUND_', 'FVG_', 'SWING_', 'FIBO_', 'PATTERN_'].some((p) =>
      String(src).toUpperCase().startsWith(p)
    );

  const eps = 0.5; // ~ mezzo punto
  const alreadyHas = (bucket: SRRow[], mid: number, natura: string, tfStr: string) =>
    bucket.some(
      (x) =>
        Number.isFinite(x.mid as number) &&
        Math.abs((x.mid as number) - mid) <= eps &&
        String(x.natura || 'Tecnico') === natura &&
        String(x.tf || '').toLowerCase() === tfStr.toLowerCase()
    );

  const naturaFrom = (src = '') => {
    const s = String(src).toUpperCase();
    if (s.startsWith('FIBO_')) return 'Fibonacci';
    if (s.startsWith('ROUND_')) return 'Round number';
    if (s.startsWith('FVG_')) return 'FVG';
    if (s.startsWith('SWING_')) return 'Swing';
    return 'Tecnico';
  };

  // aggiunge un livello “extra” (ROUND/FVG/SWING/FIBO) nel bucket giusto
  const pushExtra = (bucket: SRRow[], it: any) => {
    if (!isExtra(it.source)) return;

    const mid = it.mid as number;
    const tfStr = compactTF(it.tf || '') || fmtTFs(it.raw) || '';
    const natura = naturaFrom(it.source);

    if (alreadyHas(bucket, mid, natura, tfStr)) return;

    const row: SRRow = {
      zona: '—',
      mid,
      livelli: (toNumFlex(it.livelli) as number | undefined) ?? 1,
      forza: (toNumFlex(it.forza) as number | undefined) ?? 1,
      tf: tfStr,
      natura,
      source: it.source,
      magnet: it.magnet,
      // 🔽 portiamo giù i campi orderbook per usarli in UI
      size: it.size,
      size_reale: it.size_reale,
      size_sint: it.size_sint,
      wall_notional: it.wall_notional,
      wall_ratio: it.wall_ratio,
      difficulty: it.difficulty,
      penetration_score: it.penetration_score,
      confluence_count: it.confluence_count,
      _details: it.range
        ? ({
          method: 'zone_cluster', // riuso il pannello dettagli per mostrare i membri/range
          members: [{ mid, natura, tf: tfStr, source: it.source }],
        } as ZoneDetail)
        : { method: 'backend' },
    };

    bucket.push(row);
  };

  // “sotto” → SUPPORTI ; “sopra” → RESISTENZE
  below.forEach((it) => pushExtra(outSup, it));
  above.forEach((it) => pushExtra(outRes, it));

  return { supporti: outSup, resistenze: outRes };
}

function mergeSrExtras(data: any, baseSup: SRRow[], baseRes: SRRow[]) {
  // cerchiamo un blocco sr_extras in più posizioni possibili
  const block =
    (first(data, ['sr_extras']) as any) ||
    (first(data, ['operativa.sr_extras']) as any) ||
    null;

  if (!block) {
    return { supporti: baseSup, resistenze: baseRes };
  }

  const rawSotto: any[] = Array.isArray(block.sotto) ? block.sotto : [];
  const rawSopra: any[] = Array.isArray(block.sopra) ? block.sopra : [];

  const mapExtraToRow = (it: any): SRRow => {
    const min = toNumFlex(it?.min) as number | undefined;
    const max = toNumFlex(it?.max) as number | undefined;

    let mid = toNumFlex(it?.mid) as number | undefined;
    // 👉 se non ho mid ma ho min/max, uso il centro del range
    if (!Number.isFinite(mid as number) && Number.isFinite(min) && Number.isFinite(max)) {
      mid = (min! + max!) / 2;
    }

    const zona =
      typeof min === 'number' && typeof max === 'number' && min !== max
        ? `${nice(min, 4)} – ${nice(max, 4)}`
        : '—';

    const livelli =
      (toNumFlex(it?.livelli) as number | undefined) ?? 1;
    const forza =
      (toNumFlex(it?.forza) as number | undefined) ?? 1;

    const tfRaw = it?.tf ?? it?.tfs ?? it?.timeframe;
    const tf =
      Array.isArray(tfRaw)
        ? tfRaw.map((t: any) => compactTF(String(t))).join(', ')
        : tfRaw
          ? compactTF(String(tfRaw))
          : '';

    const source = String(it?.source ?? it?.fonte ?? it?.famiglia ?? '').toUpperCase();
    const natura = naturaFromSourceLite(source, it?.famiglia);

    const magnetRaw =
      it?.magnet ??
      it?.orderbook_share ??
      it?.orderbook_pct ??
      it?.size_pct;

    const magnet = toNumFlex(magnetRaw);

    return {
      zona,
      mid,
      livelli,
      forza,
      tf,
      natura,
      source,
      min,
      max,
      magnet,
      // se in futuro vuoi portare giù anche questi, puoi aggiungerli:
      size: toNumFlex(it?.size),
      size_reale: toNumFlex(it?.size_reale),
      size_sint: toNumFlex(it?.size_sint),
      wall_notional: toNumFlex(it?.wall_notional),
      wall_ratio: toNumFlex(it?.wall_ratio),
      difficulty: it?.difficulty,
      penetration_score: toNumFlex(it?.penetration_score),
      confluence_count: toNumFlex(it?.confluence_count),
      _details: { method: 'backend' },
    };
  };

  const extraSup = rawSotto.map(mapExtraToRow);
  const extraRes = rawSopra.map(mapExtraToRow);

  return {
    supporti: baseSup.concat(extraSup),
    resistenze: baseRes.concat(extraRes),
  };
}

// === 3) clustering zone (±0,25%) — 1 riga per cluster (robusto) ===
function applyZoneClustering(rows: SRRow[], tolPct = 0.005): SRRow[] {
  // copia superficiale per non mutare l'input
  const arr = rows.map(r => ({ ...r }));

  // separa le righe con mid valido da quelle senza
  const withMid: Array<{ idx: number; mid: number }> = [];
  const noMidIdx: number[] = [];
  arr.forEach((r, i) => {
    const m = r.mid as number;
    Number.isFinite(m) ? withMid.push({ idx: i, mid: m }) : noMidIdx.push(i);
  });

  // ordina per prezzo
  withMid.sort((a, b) => a.mid - b.mid);

  // helper: due valori sono “vicini” entro la tolleranza percentuale
  const fits = (a: number, b: number) => {
    const ref = Math.min(a, b);
    return Math.abs(a - b) <= tolPct * ref;
  };

  // 1) costruisci cluster contigui sulla SEQUENZA ORDINATA
  type Cluster = {
    items: Array<{ idx: number; mid: number }>;
    min: number;
    max: number;
    anchor: number; // primo livello del cluster
  };

  const clusters: Cluster[] = [];
  let cur: Cluster | null = null;

  for (let k = 0; k < withMid.length; k++) {
    const item = withMid[k];

    if (!cur) {
      // nuovo cluster: ancora = primo mid
      cur = { items: [item], min: item.mid, max: item.mid, anchor: item.mid };
      continue;
    }

    const anchor = cur.anchor; // <-- sempre il PRIMO del cluster
    if (fits(anchor, item.mid)) {
      // dentro la fascia % calcolata dall’ancora
      cur.items.push(item);
      cur.min = Math.min(cur.min, item.mid);
      cur.max = Math.max(cur.max, item.mid);
    } else {
      // fuori fascia: chiudi il cluster e aprine uno nuovo
      clusters.push(cur);
      cur = { items: [item], min: item.mid, max: item.mid, anchor: item.mid };
    }
  }
  if (cur) clusters.push(cur);

  // 2) per ogni cluster con >1 membro, scegli 1 leader e rimuovi gli altri
  const rank = (n?: string) => {
    const s = (n || '').toLowerCase();
    if (s.startsWith('tecnic')) return 0;   // preferisci Tecnico
    if (s.includes('fvg')) return 1;
    if (s.includes('swing')) return 2;
    if (s.includes('round')) return 3;
    if (s.startsWith('fibonacci')) return 4;
    return 9;
  };

  const drop = new Set<number>();

  for (const c of clusters) {
    if (c.items.length < 2) continue;

    // scegli leader tra gli indici del cluster
    const leader = c.items
      .map(x => x.idx)
      .sort((ia, ib) => {
        const A = arr[ia], B = arr[ib];
        const rA = rank(A.natura), rB = rank(B.natura);
        if (rA !== rB) return rA - rB;
        const fA = Number(A.forza ?? 0), fB = Number(B.forza ?? 0);
        if (fA !== fB) return fB - fA;
        const lA = Number(A.livelli ?? 0), lB = Number(B.livelli ?? 0);
        if (lA !== lB) return lB - lA;
        return 0;
      })[0];

    const zonaStr = `${nice(c.min, 4)} – ${nice(c.max, 4)}`;
    const memberRows = c.items.map(({ idx }) => arr[idx]);

    const members = memberRows.map(m => ({
      mid: m.mid as number,
      natura: m.natura || 'Tecnico',
      tf: m.tf,
      source: m.source,
      forza: typeof m.forza === 'number' ? m.forza : undefined,
    }));

    // aggregati zona
    const livelliAgg = memberRows.length;
    const tfAgg = Array.from(
      new Set(memberRows.map(m => (m.tf || '').trim()).filter(Boolean))
    ).join(", ");

    // forza massima tra i membri (backend “vera forza”)
    const maxMemberForza = Math.max(
      0,
      ...memberRows.map(m => Number(m.forza ?? 0))
    );

    // bonus di confluenza in base al numero di livelli
    // 1–2 livelli  => +0
    // 3–5 livelli  => +1
    // 6–8 livelli  => +2
    // 9–11 livelli => +3
    // 12+ livelli  => +4 (cap)
    const bonusConfl = Math.min(
      4,
      Math.floor(Math.max(0, livelliAgg - 1) / 3)
    );

    // forza finale della ZONA
    const forzaFinale =
      maxMemberForza > 0 ? maxMemberForza + bonusConfl : 0;

    // magnet aggregato: usa il massimo (più appetibile)
    const magnetAgg = Math.max(0, ...memberRows.map(m => Number(m.magnet ?? 0))) || undefined;

    // leader
    const lead = arr[leader];
    lead.zona = zonaStr;
    lead.livelli = livelliAgg;
    lead.forza = forzaFinale;        // 👈 ora è lo score combinato
    lead.tf = tfAgg || lead.tf;
    lead._details = { method: 'zone_cluster', members };
    lead.min = toNumIt(c.min);
    lead.max = toNumIt(c.max);
    lead.magnet = magnetAgg ?? lead.magnet;

    // marca gli altri membri del cluster per la rimozione
    for (const { idx } of c.items) {
      if (idx !== leader) drop.add(idx);
    }
  }

  // 3) tieni tutte le righe non droppate + quelle senza mid
  const keep = new Set<number>(noMidIdx);
  withMid.forEach(x => { if (!drop.has(x.idx)) keep.add(x.idx); });

  // Calcola una forza sensata solo se manca la forza raw
  arr.forEach(r => {
    if (r._details?.method === "zone_cluster") return;
    if (r.forza == null) {
      const members = [{ tf: r.tf, source: r.source, natura: r.natura }];
      r.forza = computeZoneForza(members);
    }
  });
  return arr.filter((_, i) => keep.has(i));
}

/* ========== hook dati ========== */
function useSupportResistance(data: any) {
  return useMemo(() => {
    const base = extractBaseSR(data);
    const mergedLiq = mergeLiquidity(data, base.supporti, base.resistenze);
    const merged = mergeSrExtras(data, mergedLiq.supporti, mergedLiq.resistenze);

    const sortByMid = (a: SRRow, b: SRRow) => {
      if (a.mid == null && b.mid == null) return 0;
      if (a.mid == null) return 1;
      if (b.mid == null) return -1;
      return (a.mid as number) - (b.mid as number);
    };

    // pre-cluster (RAW per filler/popup)
    const supClean = dedupeRows(merged.supporti).sort(sortByMid);
    const resClean = dedupeRows(merged.resistenze).sort(sortByMid);

    // post-cluster (per righe principali)
    const supporti = applyZoneClustering(supClean);
    const resistenze = applyZoneClustering(resClean);

    return { supporti, resistenze, supportiRaw: supClean, resistenzeRaw: resClean };
  }, [data]);
}

/* ========== selezione 10 + popup extra ========== */
const getPrice = (data?: any): number | undefined => {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  return toNumFlex(data?.prezzo ?? data?.price ?? data?.last ?? w?.__CASSANDRA__?.lastPrice);
};

function partitionPrimary(
  rows: SRRow[],
  side: 'S' | 'R',
  price?: number,
  rawAll?: SRRow[]
) {
  const p = price;
  const isValid = (r: SRRow) => Number.isFinite(r.mid as number);
  const dist = (r: SRRow) =>
    p == null || !isValid(r) ? Number.POSITIVE_INFINITY : Math.abs((r.mid as number) - (p as number));

  // 1) “Più vicina” per lato (sotto per S, sopra per R). Se non c’è, prendi la più vicina in assoluto.
  let nearest: SRRow | undefined;
  if (p != null) {
    if (side === 'S') {
      const below = rows.filter(r => isValid(r) && (r.mid as number) <= (p as number));
      nearest = below.sort((a, b) => (b.mid as number) - (a.mid as number))[0];
    } else {
      const above = rows.filter(r => isValid(r) && (r.mid as number) >= (p as number));
      nearest = above.sort((a, b) => (a.mid as number) - (b.mid as number))[0];
    }
  }
  if (!nearest) nearest = rows.filter(isValid).sort((a, b) => dist(a) - dist(b))[0];

  // Identità zona (univoca anche dopo clustering)
  const key = (r: SRRow) => `${r.mid}|${r.natura}|${(r.tf || '').toLowerCase()}|${r.zona}`;
  const nearestKey = nearest ? key(nearest) : '';

  // 2) Top10 per forza pura (uso la distanza solo come tie-breaker)
  const byForceDesc = rows
    .slice()
    .sort((a, b) => {
      const fA = Number(a.forza ?? 0), fB = Number(b.forza ?? 0);
      if (fA !== fB) return fB - fA;          // prima i più forti
      return dist(a) - dist(b);              // a parità di forza, più vicini al prezzo
    });

  const chosen: SRRow[] = byForceDesc.slice(0, 10);

  // 3) “Altri livelli minori”: i successivi più forti non già scelti (max 10)
  const chosenKeys = new Set(chosen.map(key));
  let pool: SRRow[];

  if (rawAll && rawAll.length) {
    // uso i RAW per avere più granularità (livelli singoli non già dentro le zone)
    pool = rawAll.filter(r => !chosenKeys.has(key(r)));
  } else {
    // fallback: uso il post-cluster rimanente
    pool = rows.filter(r => !chosenKeys.has(key(r)));
  }

  const extra = pool
    .slice()
    .sort((a, b) => {
      const fA = Number(a.forza ?? 0), fB = Number(b.forza ?? 0);
      if (fA !== fB) return fB - fA;          // ancora: prima i più forti
      return dist(a) - dist(b);              // poi i più vicini
    })
    .slice(0, 10);

  const primary = chosen; // esattamente: le 10 zone/livelli più forti
  return { primary, extra, nearestKey };
}

/* ========== UI helpers extra 2.0 ========== */

// format magnet in percent (gestisce sia 0–1 che 0–100)
function formatMagnetPercent(magnet?: number): string | null {
  if (!Number.isFinite(magnet as number)) return null;
  let v = magnet as number;
  if (v <= 1) v = v * 100;
  if (v <= 0) return null;
  const dec = v >= 10 ? 1 : 2;
  return `${v.toFixed(dec)}%`;
}

// mid + magnet stacked
function renderMidCell(r: SRRow) {
  const main = nice(r.mid, 4);
  const magStr = formatMagnetPercent(r.magnet);
  if (!magStr) return <>{main}</>;

  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{main}</span>
      <span className="text-[10px] text-neutral-400">OB: {magStr}</span>
    </span>
  );
}

// mini descrizione gassosa
function describeZone(r: SRRow): string {
  const forza = Number(r.forza ?? 0);
  const natura = (r.natura || 'Tecnico').toLowerCase();
  const tf = (r.tf || '').toLowerCase();

  const tfTag = tf.includes('1w') || tf.includes('1d')
    ? 'multi–TF alto'
    : tf.includes('4h') || tf.includes('12h')
      ? 'TF intermedi'
      : tf
        ? 'short term'
        : '';

  const isFvg = natura.includes('fvg');
  const isSwing = natura.includes('swing');
  const isRound = natura.includes('round');
  const isFibo = natura.includes('fibonacci');

  let base: string;
  if (forza >= 5) {
    base = 'Zona chiave ad alta confluenza: qui il mercato tende a reagire in modo deciso.';
  } else if (forza >= 3) {
    base = 'Livello rilevante con buona confluenza tra timeframe e natura del segnale.';
  } else {
    base = 'Livello secondario: utile come riferimento, ma meno difeso rispetto alle zone principali.';
  }

  const parts: string[] = [base];

  if (isFvg) parts.push('Il livello è collegato a un FVG, quindi riflette un impulso recente di prezzo.');
  if (isSwing) parts.push('Deriva da uno swing strutturale: spesso agisce come pivot naturale del trend.');
  if (isRound) parts.push('È un prezzo psicologico (round number): tende ad attirare ordini e liquidità.');
  if (isFibo) parts.push('Livello proporzionale (Fibonacci) utilizzato spesso dai desk per gestire i rientri.');

  if (tfTag) parts.push(`La lettura è coerente con il contesto ${tfTag}.`);

  return parts.join(' ');
}

/* ========== UI ========== */

// thead come componente per evitare riutilizzo dello stesso elemento in 2 tabelle
function TableHead() {
  return (
    <thead className="bg-neutral-800/60 text-neutral-300">
      <tr>{[
        <th key="h0" className="px-4 py-2 text-left w-12"></th>,
        <th key="h1" className="px-2 py-2 text-left">Zona</th>,
        <th key="h2" className="px-2 py-2 text-right">Mid</th>,
        <th key="h3" className="px-2 py-2 text-right">Livelli</th>,
        <th key="h4" className="px-2 py-2 text-right">Forza</th>,
        <th key="h5" className="px-2 py-2 text-left">TF</th>,
        <th key="h6" className="px-2 py-2 text-left">Natura</th>,
      ]}</tr>
    </thead>
  );
}

export default function SupportiResistenzeOverlay({
  title,
  data,
}: {
  title?: string;
  data: any;
}) {
  // sonda: input grezzo
  if (typeof window !== 'undefined') {
    (window as any).__SR_INPUT__ = data;
  }

  let { supporti, resistenze, supportiRaw, resistenzeRaw } = useSupportResistance(data);
  supporti = removeMembersInsideZones(supporti);
  resistenze = removeMembersInsideZones(resistenze);
  supportiRaw = removeMembersInsideZones(supportiRaw);
  resistenzeRaw = removeMembersInsideZones(resistenzeRaw);

  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = useCallback((key: string) => {
    setOpenRows((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  // popup “Altri livelli minori”
  const [showMinor, setShowMinor] = useState(false);

  // distanza massima visualizzata (percentuale)
  const [maxDistancePct, setMaxDistancePct] = useState(0.1); // default 3%

  // sonda: output (post merge+cluster)
  const price = getPrice(data);
  const supSel = useMemo(() => partitionPrimary(supporti, 'S', price, supportiRaw), [supporti, price, supportiRaw]);
  const resSel = useMemo(() => partitionPrimary(resistenze, 'R', price, resistenzeRaw), [resistenze, price, resistenzeRaw]);

  // === FILTRO PER DISTANZA MASSIMA ===
  const filterByDistance = (zone: any[]) => {
    if (!price) return zone;
    return zone.filter(z => {
      const lvl =
        z.mid ??
        z.livello ??
        z.prezzo ??
        null;
      if (!lvl) return true;
      const dist = Math.abs(lvl - price) / price;
      return dist <= maxDistancePct;  // <-- usa lo stato del filtro
    });
  };

  const supPrimaryFiltered = filterByDistance(supSel.primary);
  const resPrimaryFiltered = filterByDistance(resSel.primary);
  const supExtraFiltered = filterByDistance(supSel.extra);
  const resExtraFiltered = filterByDistance(resSel.extra);

  if (typeof window !== 'undefined') {
    (window as any).__SR_MERGED__ = { supporti, resistenze, supportiRaw, resistenzeRaw };
    (window as any).__SR_PRIMARY__ = { sup: supSel, res: resSel, price };
    console.debug('[SR] merged counts:', { sup: supporti.length, res: resistenze.length });
  }

  const difficultyClass = (difficulty?: string) => {
    if (!difficulty) return '';
    const d = difficulty.toLowerCase();
    if (d.includes('molto')) {
      return 'bg-red-600/20 text-red-300 border-red-600/50';
    }
    if (d.includes('alta')) {
      return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
    }
    if (d.includes('media')) {
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
    }
    return 'bg-neutral-700 text-neutral-200 border-neutral-600';
  };

  const Badge = (natura?: string, highlight?: boolean) => (
    <span
      className={`text-xs rounded-full px-2 py-0.5 border ${highlight
        ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
        : (natura || '').toLowerCase().startsWith('fibonacci')
          ? 'bg-violet-500/15 text-violet-300 border-violet-600/40'
          : (natura || '').toLowerCase().includes('round')
            ? 'bg-sky-500/15 text-sky-300 border-sky-600/40'
            : (natura || '').toLowerCase().includes('fvg')
              ? 'bg-amber-500/15 text-amber-300 border-amber-600/40'
              : (natura || '').toLowerCase().includes('swing')
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40'
                : 'bg-neutral-700 text-neutral-200 border-neutral-600'
        }`}
    >
      {highlight ? 'Più vicina' : (natura || 'Tecnico')}
    </span>
  );

  const Row = (side: 'S' | 'R', nearestKey?: string) => (r: SRRow, idx: number) => {
    const key = `${side}-${r.natura}-${r.mid}-${r.tf}-${idx}`;
    const isOpen = !!openRows[key];
    const isNearest = nearestKey && `${r.mid}|${r.natura}|${(r.tf || '').toLowerCase()}|${r.zona}` === nearestKey;

    const magnetStr = formatMagnetPercent(r.magnet);

    return (
      <Fragment key={key}>
        <tr className={`hover:bg-neutral-800/30 ${isNearest ? 'ring-1 ring-indigo-500/40' : ''}`}>
          <td className="px-4 py-2">
            <button
              onClick={() => toggleRow(key)}
              className="w-6 h-6 rounded-md border border-neutral-600 hover:bg-neutral-800 flex items-center justify-center"
              title="Dettagli zona"
            >
              <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
            </button>
          </td>
          <td className="px-2 py-2 text-neutral-200 flex items-center gap-2">
            {isNearest && Badge(undefined, true)}
            <span>{r.zona || '—'}</span>
          </td>
          <td className="px-2 py-2 text-right text-neutral-200">{renderMidCell(r)}</td>
          <td className="px-2 py-2 text-right text-neutral-200">{r.livelli ?? '—'}</td>
          <td className="px-2 py-2 text-right text-neutral-200">
            {r.forza ?? '—'}
            {typeof r.size === 'number' && (
              <span className="ml-2 text-[11px] text-neutral-400">
                {nice(r.size, 0)}
              </span>
            )}
          </td>
          <td className="px-2 py-2 text-left text-neutral-200">{r.tf || '—'}</td>
          <td className="px-2 py-2 text-left">
            {Badge(r.natura)}
            {r.difficulty && (
              <span
                className={
                  'ml-2 text-xs rounded-full px-2 py-0.5 border ' +
                  difficultyClass(r.difficulty)
                }
              >
                {r.difficulty}
              </span>
            )}
          </td>
        </tr>
        <tr key={`${key}-details`} className={`${isOpen ? 'table-row' : 'hidden'}`}>
          <td colSpan={7} className="px-4 pb-3">
            <div className="rounded-xl border border-neutral-700 bg-neutral-850/40 px-4 py-3 text-sm text-neutral-300">
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <div><span className="text-neutral-400">Natura:</span> <span className="text-neutral-100">{r.natura || 'Tecnico'}</span></div>
                  {r.source && (<div><span className="text-neutral-400">Source:</span> <span className="text-neutral-100">{r.source}</span></div>)}
                  {r.tf && (<div><span className="text-neutral-400">TF:</span> <span className="text-neutral-100">{r.tf}</span></div>)}
                  {magnetStr && (
                    <div>
                      <span className="text-neutral-400">Magnete orderbook:</span>{' '}
                      <span className="text-neutral-100">{magnetStr}</span>
                    </div>
                  )}
                  {typeof r.wall_notional === 'number' && (
                    <div>
                      <span className="text-neutral-400">Orderbook:</span>{' '}
                      <span className="text-neutral-100">
                        {nice(r.wall_notional, 0)}
                      </span>
                    </div>
                  )}
                  {typeof r.wall_ratio === 'number' && (
                    <div>
                      <span className="text-neutral-400">Quota orderbook:</span>{' '}
                      <span className="text-neutral-100">
                        {(r.wall_ratio * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {typeof r.confluence_count === 'number' && (
                    <div>
                      <span className="text-neutral-400">Confluenze:</span>{' '}
                      <span className="text-neutral-100">{r.confluence_count}</span>
                    </div>
                  )}
                  {typeof r.penetration_score === 'number' && (
                    <div>
                      <span className="text-neutral-400">Penetrazione:</span>{' '}
                      <span className="text-neutral-100">
                        {r.penetration_score.toFixed(1)}
                      </span>
                    </div>
                  )}

                </div>
                <div>
                  <div><span className="text-neutral-400">Mid:</span> <span className="text-neutral-100">{nice(r.mid, 6)}</span></div>
                  <div><span className="text-neutral-400">Livelli/Forza:</span> <span className="text-neutral-100">{r.livelli ?? '—'} / {r.forza ?? '—'}</span></div>
                  {Number.isFinite(r.min as number) && Number.isFinite(r.max as number) && (
                    <div>
                      <span className="text-neutral-400">Range zona:</span>{' '}
                      <span className="text-neutral-100">{nice(r.min, 4)} – {nice(r.max, 4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {r._details?.method === 'backend' && (
                <div className="mt-2">Zona fornita dal <span className="text-neutral-100">backend</span>.</div>
              )}
              {r._details?.method === 'zone_cluster' && (
                <div className="mt-2">
                  Zona ottenuta raggruppando livelli entro <span className="text-neutral-100">±0,25%</span>:
                  <ul className="mt-1 grid sm:grid-cols-2 gap-1">
                    {r._details.members
                      // mostra solo i livelli con forza >= 1
                      .filter((m: any) => Number(m.forza ?? 0) >= 1)
                      .map((m: any, i: number) => (
                        <li key={i} className="text-neutral-200">
                          • {nice(m.mid, 6)}{" "}
                          <span className="text-neutral-400">
                            ({m.natura}
                            {m.tf ? ` · ${m.tf}` : ""}
                            {typeof m.forza === "number" ? ` · F:${m.forza}` : ""}
                            )
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {r._details?.method === 'fibo_derivato' && (
                <div className="mt-2">
                  Livello <span className="text-neutral-100">Fibonacci (derivato)</span> da SWING
                  {' '}<span className="text-neutral-100">{nice(r._details.anchors.lo, 6)}</span>
                  {' → '}<span className="text-neutral-100">{nice(r._details.anchors.hi, 6)}</span>
                  {r._details.anchors.tf && <> ({r._details.anchors.tf})</>}.
                </div>
              )}

              {/* Narrativa gassosa sintetica */}
              <div className="mt-3 text-xs text-neutral-300 italic">
                {describeZone(r)}
              </div>
            </div>
          </td>
        </tr>
      </Fragment>
    );
  };

  const overlayTitle = String(title ?? "Supporti/Resistenze");

  // extra reali dal partitionPrimary
  const supExtra = supSel.extra;
  const resExtra = resSel.extra;

  return (
    <>
      <SafeDialogContent
        title={overlayTitle}
        description="Mappa di supporti e resistenze con livelli chiave e dettagli."
        className="pointer-events-auto w-[min(96vw,1200px)] sm:max-w-5xl md:max-w-6xl bg-neutral-900 text-neutral-100 border border-neutral-700"
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="i-lucide-shield w-5 h-5" />
            {overlayTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-3 text-xs text-neutral-400">
          Prezzo di riferimento: <span className="text-neutral-200">{nice(price, 6)}</span>
        </div>

        {/* FILTRO DISTANZA */}
        <div className="mb-3 flex items-center gap-3">
          <label className="text-neutral-300 whitespace-nowrap">
            Distanza max (%)
          </label>

          <input
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={maxDistancePct * 100}
            onChange={(e) => setMaxDistancePct(Number(e.target.value) / 100)}
            className="w-20 bg-neutral-800 border border-neutral-700 rounded p-1 text-neutral-100 text-right"
          />

          <span className="text-neutral-500 text-sm">
            (mostra solo i livelli entro {(maxDistancePct * 100).toFixed(1)}%)
          </span>
        </div>

        <div className="px-4 pb-4 grid md:grid-cols-2 gap-4">
          {/* Supporti */}
          <div className="w-full overflow-visible rounded-xl border border-neutral-700">
            <div className="px-4 py-2 text-sm font-medium text-neutral-200 flex items-center justify-between">
              <span>Supporti</span>
              <button
                onClick={() => setShowMinor(true)}
                className="pointer-events-auto relative z-61 text-xs px-2 py-0.5 rounded-md border border-neutral-600 hover:bg-neutral-800"
                title="Mostra altri livelli minori"
              >
                Altri livelli minori
              </button>
            </div>
            <table className="w-full text-sm">
              <TableHead />
              <tbody className="divide-y divide-neutral-800">
                {supPrimaryFiltered.map(Row("S", supSel.nearestKey))}
                {supSel.primary.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 text-neutral-400">
                      Nessun supporto
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Resistenze */}
          <div className="w-full overflow-hidden rounded-xl border border-neutral-700">
            <div className="px-4 py-2 text-sm font-medium text-neutral-200 flex items-center justify-between">
              <span>Resistenze</span>
              <button
                onClick={() => setShowMinor(true)}
                className="pointer-events-auto relative z-61 text-xs px-2 py-0.5 rounded-md border border-neutral-600 hover:bg-neutral-800"
                title="Mostra altri livelli minori"
              >
                Altri livelli minori
              </button>
            </div>
            <table className="w-full text-sm">
              <TableHead />
              <tbody className="divide-y divide-neutral-800">
                {resPrimaryFiltered.map(Row("R", resSel.nearestKey))}
                {resSel.primary.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 text-neutral-400">
                      Nessuna resistenza
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SafeDialogContent>

      {/* Popup: Altri livelli minori (10 per lato) */}
      <Dialog open={showMinor} onOpenChange={setShowMinor} modal={false}>
        <DialogContent
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    z-80 pointer-events-auto
                    w-[min(90vw,1200px)] sm:max-w-5xl md:max-w-6xl
                    bg-neutral-900 text-neutral-100 border border-neutral-700"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg">Altri livelli minori</DialogTitle>
          </DialogHeader>

          <div className="px-4 pb-4 grid md:grid-cols-2 gap-4">
            {/* Colonna Supporti (extra) */}
            <div className="w-full overflow-visible rounded-xl border border-neutral-700">
              <div className="px-4 py-2 text-sm font-medium text-neutral-200">
                Supporti (altri 10)
              </div>
              <table className="w-full text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Livello</th>
                    <th className="px-4 py-2 text-right font-normal">Forza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {supExtraFiltered.map((row: any, i: number) => (
                    <tr key={`sup-extra-${i}`}>
                      <td className="px-4 py-2">{nice(row.mid, 6)}</td>
                      <td className="px-4 py-2 text-right">{row.forza ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Colonna Resistenze (extra) */}
            <div className="w-full overflow-visible rounded-xl border border-neutral-700">
              <div className="px-4 py-2 text-sm font-medium text-neutral-200">
                Resistenze (altri 10)
              </div>
              <table className="w-full text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Livello</th>
                    <th className="px-4 py-2 text-right font-normal">Forza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {resExtraFiltered.map((row: any, i: number) => (
                    <tr key={`res-extra-${i}`}>
                      <td className="px-4 py-2">{nice(row.mid, 6)}</td>
                      <td className="px-4 py-2 text-right">{row.forza ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} // <-- CHIUSURA della funzione componente
