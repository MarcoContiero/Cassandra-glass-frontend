'use client';

import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

import { OverlayShell } from "./OverlayShell";

type Any = Record<string, any>;
type SR = { min?: number; max?: number; mid?: number; tf?: string; forza?: number };
type TFEntry = { long: number; short: number; direction?: string };
type LiquidityPoint = { price?: number; forza?: number };
type GasClusterMeta = { tf_ref?: string; X?: string; Y?: string; Z?: string; extra?: string };

/* ----------------------------- helpers ----------------------------- */

function num(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function toNumIt(x: any): number | undefined {
  if (x == null) return undefined;
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  if (typeof x === 'string') {
    const s = x.trim();
    if (!s) return undefined;
    const norm = s.replace(/\./g, '').replace(',', '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function fmtPrice(x: any): string {
  const v = toNumIt(x);
  if (!Number.isFinite(v as number)) return '-';
  const n = v as number;
  if (Math.abs(n) >= 100000) return n.toFixed(0);
  if (Math.abs(n) >= 1000) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPct(x?: number): string {
  if (!Number.isFinite(x as number)) return '-';
  const n = x as number;
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function qDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('debug') === '1') return true;
  } catch {
    // ignore
  }
  try {
    return window.localStorage.getItem('DEBUG_SPIEGAZIONE') === '1';
  } catch {
    return false;
  }
}

/* ------------------------- normalizzazione TF ------------------------- */

// Copre M15/15m/15min, H1/1h/60m, H4/4h/240m, D1/1d/d/daily, W1/1w/w/weekly, tf_* ecc.
function normTfKey(k: string) {
  const s0 = String(k).trim().toLowerCase();
  const s = s0.replace(/[\s_\-]/g, '');

  const direct: Record<string, string> = {
    // minuti
    m1: '1m',
    m3: '3m',
    m5: '5m',
    m15: '15m',
    m30: '30m',
    m45: '45m',
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '45m': '45m',
    '15min': '15m',
    '30min': '30m',
    '45min': '45m',
    tf15m: '15m',
    tf_15m: '15m',
    tf30m: '30m',
    tf_30m: '30m',

    // ore
    h1: '1h',
    '1h': '1h',
    h2: '2h',
    '2h': '2h',
    h3: '3h',
    '3h': '3h',
    h4: '4h',
    '4h': '4h',
    h6: '6h',
    '6h': '6h',
    h8: '8h',
    '8h': '8h',
    h12: '12h',
    '12h': '12h',

    // giorni
    d1: '1d',
    '1d': '1d',
    d: '1d',
    daily: '1d',
    '24h': '1d',

    // settimane
    w1: '1w',
    '1w': '1w',
    w: '1w',
    weekly: '1w',
  };

  if (direct[s]) return direct[s];

  const m = /^(\d+)(m|min)$/.exec(s);
  if (m) return `${m[1]}m`;
  const h = /^(\d+)(h|hr|hour|ore)$/.exec(s);
  if (h && h[1]) return `${h[1]}h`;
  const d = /^(\d+)(d|day|giorni?)$/.exec(s);
  if (d) return `${d[1]}d`;
  const w = /^(\d+)(w|week|sett)$/.exec(s);
  if (w) return `${w[1]}w`;

  if (s.startsWith('tf') && s.length > 2) {
    const rest = s.slice(2);
    return normTfKey(rest);
  }

  return s0;
}

/* ----------------------------- read riepilogo ----------------------------- */

function readRiepilogo(data?: Any) {
  // 2.0: nessun fallback da window, solo JSON del BE
  const rep = (data?.riepilogo ?? data ?? {}) as Any;
  const tfs: Any = rep.tfs ?? {};
  const global: Any = rep.global ?? {};
  return { tfs, global, raw: rep };
}

function readPrice(data?: Any) {
  // 2.0: prezzo solo dal payload dell'analisi
  return (
    num(
      data?.prezzo ??
      data?.price ??
      data?.last ??
      data?.last_price ??
      data?.riepilogo?.prezzo,
    ) ?? undefined
  );
}

function normSR(r: any): SR {
  if (!r) return {};
  const mids: number[] = (r?._details?.members ?? [])
    .map((m: any): number | undefined => toNumIt(m?.mid))
    .filter((v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v));

  let mid = toNumIt(r?.mid);
  let min = toNumIt(r?.min);
  let max = toNumIt(r?.max);

  if (mids.length) {
    min = Math.min(...mids);
    max = Math.max(...mids);
  }
  if (!Number.isFinite(mid as number) && Number.isFinite(min as number) && Number.isFinite(max as number)) {
    mid = ((min as number) + (max as number)) / 2;
  }

  const tf = String(r?.tf ?? r?.timeframe ?? '').toLowerCase();
  const forza = toNumIt(r?.forza ?? r?.strength ?? r?.score) ?? 0;

  return { min, max, mid, tf, forza };
}

/* ----------------------- S/R + liquidity dal JSON 2.0 ----------------------- */

function readSR(data?: Any, raw?: Any) {
  // Cerchiamo il blocco SR nel payload, senza usare window.*
  const candidates: Any[] = [
    (data as Any)?.supporti_resistenze,
    (data as Any)?.sr_merged,
    (data as Any)?.sr,
    raw?.supporti_resistenze,
    raw?.sr_merged,
    raw?.sr,
  ].filter(Boolean);

  let src: Any | null = null;

  for (const c of candidates) {
    if (!c) continue;
    if (Array.isArray(c.supporti) || Array.isArray(c.resistenze)) {
      src = c;
      break;
    }
  }

  const supports: SR[] = Array.isArray(src?.supporti) ? src.supporti.map(normSR) : [];
  const resists: SR[] = Array.isArray(src?.resistenze) ? src.resistenze.map(normSR) : [];

  return { supports, resists };
}

function strongestSR(supports: SR[], resists: SR[]) {
  const s = supports.slice().sort((a, b) => (b.forza ?? 0) - (a.forza ?? 0))[0];
  const r = resists.slice().sort((a, b) => (b.forza ?? 0) - (a.forza ?? 0))[0];
  return { bestS: s, bestR: r };
}

function nearestBelow(px: number, rows: SR[]) {
  return rows
    .filter((r) => Number.isFinite(r.mid as number) && (r.mid as number) < px)
    .sort((a, b) => (b.mid as number) - (a.mid as number))[0];
}

function nearestAbove(px: number, rows: SR[]) {
  return rows
    .filter((r) => Number.isFinite(r.mid as number) && (r.mid as number) > px)
    .sort((a, b) => (a.mid as number) - (b.mid as number))[0];
}

/* ----------------------- TF map & scenari ----------------------- */

const TF_GROUPS: Record<'brevi' | 'medi' | 'lunghi', string[]> = {
  brevi: ['5m', '15m', '30m', '45m', '1h'],
  medi: ['2h', '3h', '4h', '6h', '8h', '12h'],
  lunghi: ['1d', '3d', '1w'],
};

function buildTFMap(src: Any): Record<string, TFEntry> {
  const root =
    src?.trend_tf_score ??
    src?.trendPerTf ??
    src?.trend_per_tf ??
    src?.tfScore ??
    src?.tf_score ??
    src?.tfs ??
    src ??
    {};

  const out: Record<string, TFEntry> = {};
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    for (const [rawK, v] of Object.entries<any>(root)) {
      const key = normTfKey(String(rawK));
      const long = toNumIt(v?.long ?? v?.LONG ?? v?.l ?? v?.score_long) ?? 0;
      const short = toNumIt(v?.short ?? v?.SHORT ?? v?.s ?? v?.score_short) ?? 0;
      let direction: string | undefined = v?.direction ?? v?.dir ?? v?.direzione;
      if (!direction) {
        if (long > short) direction = 'LONG';
        else if (short > long) direction = 'SHORT';
        else direction = 'NEUTRO';
      }
      out[key] = { long, short, direction };
    }
  }
  return out;
}

function dominantFromTF(tfMap: Record<string, TFEntry>) {
  let num = 0,
    den = 0;
  for (const v of Object.values<TFEntry>(tfMap)) {
    const l = v.long ?? 0;
    const s = v.short ?? 0;
    const w = Math.max(l, s, 1);
    num += w * (l - s);
    den += w * (l + s);
  }
  let dir: 'LONG' | 'SHORT' | 'NEUTRO' = 'NEUTRO';
  if (num > 0) dir = 'LONG';
  else if (num < 0) dir = 'SHORT';
  const pct = den > 0 ? Math.round((Math.abs(num) / den) * 1000) / 10 : undefined;
  return { dir, pct };
}

function extractScenariByTf(data: Any, raw: Any): Record<string, string[]> {
  const roots = [
    data?.scenari_by_tf,
    data?.risposte?.scenari_by_tf,
    data?.scenari_per_tf,
    data?.risposte?.scenari_per_tf,
    data?.scenariAttiviPerTf,
    raw?.scenari_by_tf,
    raw?.scenari_per_tf,
  ].filter(Boolean);

  const out: Record<string, string[]> = {};
  for (const root of roots) {
    if (root && typeof root === 'object') {
      for (const [tf, arr] of Object.entries<any>(root)) {
        const list: string[] = Array.isArray(arr)
          ? arr
            .map(
              (x: any) =>
                x?.codice ?? x?.code ?? x?.nome ?? x?.name ?? x,
            )
            .map(String)
          : [];
        if (!out[tf]) out[tf] = [];
        for (const s of list) if (!out[tf].includes(s)) out[tf].push(s);
      }
    }
  }
  return out;
}

/* ----------------------- LIQUIDITY RAW (dal JSON 2.0) ----------------------- */

function readLiquidity(
  data?: Any,
  raw?: Any,
): {
  strongestAbove?: LiquidityPoint & { src?: string };
  strongestBelow?: LiquidityPoint & { src?: string };
  counts: { above: number; below: number };
  above: Array<LiquidityPoint & { src?: string }>;
  below: Array<LiquidityPoint & { src?: string }>;
} {
  // Cerchiamo il blocco di liquidità (versione 2.0) nel payload
  const candidates: Any[] = [
    (data as Any)?.liquidity,
    (data as Any)?.liquidity_raw,
    (data as Any)?.liquidity_sr,
    (data as Any)?.sr_liquidity,
    raw?.liquidity,
    raw?.liquidity_raw,
    raw?.liquidity_sr,
    raw?.sr_liquidity,
  ].filter(Boolean);

  const src: Any = candidates[0] ?? {};

  const norm = (x: any): LiquidityPoint & { src?: string } => {
    const price =
      toNumIt(
        x?.price ??
        x?.prezzo ??
        x?.valore ??
        x?.level ??
        x?.livello ??
        x?.mid,
      ) ?? undefined;
    const forza = toNumIt(x?.forza ?? x?.strength ?? x?.score) ?? undefined;
    // la fonte spesso è una stringa con codici separati da '/', es: "ROUND_IP/SR_SUP/..."
    const srcStr = String(
      x?.fonte ?? x?.source ?? x?.sources ?? '',
    ).toUpperCase() || undefined;
    return { price, forza, src: srcStr };
  };

  const aboveRaw = Array.isArray(src.rawAbove)
    ? src.rawAbove
    : Array.isArray(src.above)
      ? src.above
      : [];
  const belowRaw = Array.isArray(src.rawBelow)
    ? src.rawBelow
    : Array.isArray(src.below)
      ? src.below
      : [];

  const above = (aboveRaw as any[]).map(norm).filter((z) => z.price != null);
  const below = (belowRaw as any[]).map(norm).filter((z) => z.price != null);

  const byForzaDesc = (a: any, b: any) => (b.forza ?? 0) - (a.forza ?? 0);

  const strongestAbove = above.slice().sort(byForzaDesc)[0];
  const strongestBelow = below.slice().sort(byForzaDesc)[0];

  return {
    strongestAbove,
    strongestBelow,
    counts: { above: above.length, below: below.length },
    above,
    below,
  };
}

/* ----------------------- GAS META X/Y/Z (cluster brevi/medi/lunghi) ----------------------- */

function normGasEntry(x: any): GasClusterMeta {
  if (!x || typeof x !== 'object') return {};
  return {
    tf_ref: x.tf_ref ?? x.tf ?? x.timeframe,
    X: x.X ?? x.x ?? x.asse_x ?? x.dimensione_x ?? x.seq ?? x.sequence,
    Y: x.Y ?? x.y ?? x.asse_y ?? x.dimensione_y ?? x.pos ?? x.vertical,
    Z: x.Z ?? x.z ?? x.asse_z ?? x.dimensione_z ?? x.depth ?? x.convergenza,
    extra: x.extra ?? x.d ?? x.note ?? x.commento,
  };
}

function readGasMeta(
  data?: Any,
  raw?: Any,
): {
  brevi?: GasClusterMeta;
  medi?: GasClusterMeta;
  lunghi?: GasClusterMeta;
} {
  const d = (data ?? {}) as Any;
  const r = (raw ?? {}) as Any;

  // Possibili posizioni future nel JSON 2.0
  const candidates: Any[] = [
    d.pregresso_gassoso,
    d.riepilogo?.pregresso_gassoso,
    r.pregresso_gassoso,
    r.meta_xyz,
    r.meta_d_per_cluster,
  ].filter(Boolean);

  const src = candidates.find(
    (c) => c && typeof c === 'object' && !Array.isArray(c),
  );

  if (!src) return {};

  const brevi =
    src.brevi ??
    src.breve ??
    src.short_term ??
    src.short ??
    src.cluster_brevi;
  const medi = src.medi ?? src.medium_term ?? src.mid ?? src.cluster_medi;
  const lunghi =
    src.lunghi ??
    src.lungo ??
    src.long_term ??
    src.long ??
    src.cluster_lunghi;

  return {
    brevi: brevi ? normGasEntry(brevi) : undefined,
    medi: medi ? normGasEntry(medi) : undefined,
    lunghi: lunghi ? normGasEntry(lunghi) : undefined,
  };
}

/* ----------------------- narrativa intelligente ----------------------- */

function buildNarrativa(opts: {
  px?: number;
  tfMap: Record<string, TFEntry>;
  scenariByTf: Record<string, string[]>;
  supports: SR[];
  resists: SR[];
  liquidity: ReturnType<typeof readLiquidity>;
}) {
  const { px, tfMap, scenariByTf, supports, resists, liquidity } = opts;

  const dirOf = (keys: string[]) => {
    let sc = 0;
    for (const k of keys) {
      const v = tfMap[k];
      if (!v) continue;
      const l = v.long ?? 0;
      const s = v.short ?? 0;
      const w = Math.max(l, s, 1);
      sc += w * (l - s);
    }
    if (sc > 0) return 'LONG';
    if (sc < 0) return 'SHORT';
    return 'NEUTRO';
  };

  const dBrevi = dirOf(TF_GROUPS.brevi);
  const dMedi = dirOf(TF_GROUPS.medi);
  const dLunghi = dirOf(TF_GROUPS.lunghi);

  const quadro = dominantFromTF(tfMap);

  const scenariBrevi: string[] = [];
  const scenariMedi: string[] = [];
  const scenariLunghi: string[] = [];

  for (const [rawK, arr] of Object.entries<any>(scenariByTf)) {
    const k = normTfKey(String(rawK));
    if (!Array.isArray(arr) || !arr.length) continue;
    const list = arr.map((x) => String(x));
    if (TF_GROUPS.brevi.includes(k)) scenariBrevi.push(...list);
    else if (TF_GROUPS.medi.includes(k)) scenariMedi.push(...list);
    else if (TF_GROUPS.lunghi.includes(k)) scenariLunghi.push(...list);
  }

  const { supports: supR, resists: resR } = ((): { supports: SR[]; resists: SR[] } => {
    const s = supports.slice().sort((a, b) => (b.forza ?? 0) - (a.forza ?? 0));
    const r = resists.slice().sort((a, b) => (b.forza ?? 0) - (a.forza ?? 0));
    return { supports: s, resists: r };
  })();
  const { bestS, bestR } = strongestSR(supR, resR);

  let mainText = '';

  const dirTxt = (() => {
    const pieces: string[] = [];
    pieces.push(`Contesto generale: bias ${quadro.dir}`);
    if (quadro.pct != null) pieces.push(`(forza ${quadro.pct.toFixed(1)}%)`);

    const dettagli: string[] = [];
    dettagli.push(`TF brevi: ${dBrevi}`);
    dettagli.push(`TF medi: ${dMedi}`);
    dettagli.push(`TF lunghi: ${dLunghi}`);

    return `${pieces.join(' ')}. ${dettagli.join(' · ')}.`;
  })();

  mainText += dirTxt + '\n';

  const srTxt = (() => {
    if (!Number.isFinite(px as number) || (!supR.length && !resR.length)) return '';
    const p = px as number;

    const nearSup = nearestBelow(p, supR);
    const nearRes = nearestAbove(p, resR);

    const parts: string[] = [];

    const describe = (label: string, row?: SR) => {
      if (!row || !Number.isFinite(row.mid as number)) return '';
      const mid = row.mid as number;
      const distPct = ((mid - p) / p) * 100;
      const distAbs = mid - p;
      const side = distAbs >= 0 ? 'sopra' : 'sotto';
      const forza =
        row.forza != null
          ? `forza ${row.forza.toFixed(1)}`
          : row.tf
            ? `TF ${row.tf}`
            : 'livello';
      return `${label} ${side} a ${fmtPrice(mid)} (${fmtPct(distPct)}, ${forza})`;
    };

    const sTxt = describe('Supporto principale', nearSup);
    const rTxt = describe('Resistenza principale', nearRes);

    if (sTxt) parts.push(sTxt);
    if (rTxt) parts.push(rTxt);

    if (!parts.length) return '';

    const bestParts: string[] = [];
    if (bestS?.mid != null) {
      bestParts.push(
        `Supporto più forte a ${fmtPrice(bestS.mid)} (forza ${bestS.forza?.toFixed(1) ?? 'n/d'
        })`,
      );
    }
    if (bestR?.mid != null) {
      bestParts.push(
        `Resistenza più forte a ${fmtPrice(bestR.mid)} (forza ${bestR.forza?.toFixed(1) ?? 'n/d'
        })`,
      );
    }

    let txt = `Livelli tecnici vicini al prezzo: ${parts.join(' · ')}.`;
    if (bestParts.length) txt += ` A distanza più ampia: ${bestParts.join(' · ')}.`;
    return txt;
  })();

  if (srTxt) {
    mainText += '\n' + srTxt + '\n';
  }

  const scenariTxt = (() => {
    const blocks: string[] = [];

    const mk = (label: string, list: string[]) => {
      if (!list.length) return '';
      const u = Array.from(new Set(list));
      return `${label}: ${u.join(', ')}.`;
    };

    const b = mk('Scenari attivi sui TF brevi', scenariBrevi);
    const m = mk('Scenari attivi sui TF medi', scenariMedi);
    const l = mk('Scenari attivi sui TF lunghi', scenariLunghi);

    if (b) blocks.push(b);
    if (m) blocks.push(m);
    if (l) blocks.push(l);

    if (!blocks.length) return '';
    return blocks.join('\n');
  })();

  if (scenariTxt) {
    mainText += '\n' + scenariTxt + '\n';
  }

  const poolTxt = (() => {
    if (!Number.isFinite(px as number)) return '';
    const p = px as number;

    const poolAbove = liquidity.strongestAbove;
    const poolBelow = liquidity.strongestBelow;

    const parts: string[] = [];

    const describePool = (
      label: string,
      pool?: LiquidityPoint & { src?: string },
    ) => {
      if (!pool?.price) return '';
      const distPct = ((pool.price - p) / p) * 100;
      const side = pool.price > p ? 'sopra' : 'sotto';
      const src = pool.src ? ` (${pool.src})` : '';
      return `${label} ${side} a ${fmtPrice(pool.price)} (${fmtPct(
        distPct,
      )}${src})`;
    };

    const aTxt = describePool('Pool di liquidità significativa', poolAbove);
    const bTxt = describePool('Pool di liquidità significativa', poolBelow);

    if (aTxt) parts.push(aTxt);
    if (bTxt) parts.push(bTxt);

    if (!parts.length) return '';

    return `Liquidità significativa: ${parts.join(' · ')}.`;
  })();

  if (poolTxt) {
    mainText += '\n' + poolTxt + '\n';
  }

  const groups = {
    brevi: { dir: dBrevi, scenari: scenariBrevi },
    medi: { dir: dMedi, scenari: scenariMedi },
    lunghi: { dir: dLunghi, scenari: scenariLunghi },
  };

  return { text: mainText.trim(), quadro, groups };
}

/* ----------------------- TF map resolver (2.0) ----------------------- */

function resolveTFMap(data?: Any, raw?: Any) {
  const d = (data ?? {}) as Any;
  const r = (raw ?? {}) as Any;

  const candidates: Record<string, any> = {
    'data.trend_tf_score': d.trend_tf_score,
    'data.risposte.trend_tf_score': d.risposte?.trend_tf_score,
    'riepilogo.trend_tf_score': r.trend_tf_score,
    'riepilogo.global.trend_tf_score': r.global?.trend_tf_score,
    'riepilogo.tfs': r.tfs,
    'data.tfScore': d.tfScore,
    'data.tf_score': d.tf_score,
    'data.trendPerTf': d.trendPerTf,
    'data.trend_per_tf': d.trend_per_tf,
  };

  let chosenKey: string | null = null;
  let chosenPayload: any = null;
  for (const [k, v] of Object.entries(candidates)) {
    if (v && typeof v === 'object' && Object.keys(v).length > 0) {
      chosenKey = k;
      chosenPayload = v;
      break;
    }
  }

  const tfMap = buildTFMap(chosenPayload ?? d ?? r ?? {});
  const tfSource = chosenKey ?? 'data/raw';
  const tfKeysRaw = chosenPayload && typeof chosenPayload === 'object'
    ? Object.keys(chosenPayload)
    : [];
  const tfKeysNorm = Object.keys(tfMap);

  return { tfMap, tfSource, tfKeysRaw, tfKeysNorm };
}

/* ----------------------- COMPONENTE REALE ----------------------- */
const TF_CLUSTER_MAP: Record<string, 'brevi' | 'medi' | 'lunghi'> = {
  // brevi
  '1m': 'brevi',
  '3m': 'brevi',
  '5m': 'brevi',
  '15m': 'brevi',
  '30m': 'brevi',
  '45m': 'brevi',
  '1h': 'brevi',
  // medi
  '2h': 'medi',
  '3h': 'medi',
  '4h': 'medi',
  '6h': 'medi',
  '8h': 'medi',
  '12h': 'medi',
  // lunghi
  '1d': 'lunghi',
  '3d': 'lunghi',
  '1w': 'lunghi',
  '1M': 'lunghi',
};

function getClusterForTf(tfKey: string): 'brevi' | 'medi' | 'lunghi' | undefined {
  const norm = normTfKey(tfKey);
  return TF_CLUSTER_MAP[norm];
}

function buildPregressoTextForTf(opts: {
  tfKey: string;
  tfMap: Record<string, TFEntry>;
  scenariByTf: Record<string, string[]>;
  gasMeta: { brevi?: GasClusterMeta; medi?: GasClusterMeta; lunghi?: GasClusterMeta };
  groups: { brevi: any; medi: any; lunghi: any };
  aiLang: Any;
}) {
  const { tfKey, tfMap, scenariByTf, gasMeta, groups, aiLang } = opts;

  const normTf = normTfKey(tfKey);

  const tfEntry = tfMap[normTf];
  const cluster = getClusterForTf(tfKey);
  const clusterMeta =
    (cluster === 'brevi' && gasMeta.brevi) ||
    (cluster === 'medi' && gasMeta.medi) ||
    (cluster === 'lunghi' && gasMeta.lunghi) ||
    undefined;
  const clusterGroup = cluster ? groups[cluster] : undefined;

  const dir = tfEntry?.direction ?? clusterGroup?.dir ?? 'NEUTRO';
  const longScore = tfEntry?.long ?? 0;
  const shortScore = tfEntry?.short ?? 0;
  const den = longScore + shortScore;
  const strength =
    den > 0 ? Math.round((Math.abs(longScore - shortScore) / den) * 100) : undefined;

  const scenari =
    scenariByTf[tfKey] ??
    scenariByTf[normTf] ??
    [];

  const scenariTxt = scenari.length
    ? `Scenari attivi: ${scenari.join(', ')}.`
    : '';

  const tfData = (aiLang as Any)[tfKey] ?? {};
  const riassuntoRaw =
    tfData?.riassunto?.full ??
    tfData?.riassunto?.medium ??
    tfData?.riassunto?.short ??
    tfData?.setup?.full ??
    tfData?.setup?.medium ??
    tfData?.setup?.short ??
    '';

  const parts: string[] = [];

  // Riga 1: bias su quel TF
  if (strength != null) {
    parts.push(`Bias dominante: ${dir} (forza ${strength}%).`);
  } else {
    parts.push(`Bias dominante: ${dir}.`);
  }

  // Riga 2: scenari (se ci sono)
  if (scenariTxt) parts.push(scenariTxt);

  // Riga 3: un estratto del pregresso gassoso del cluster, se c'è
  if (clusterMeta?.X || clusterMeta?.Y || clusterMeta?.Z) {
    const frag: string[] = [];
    if (clusterMeta.X) frag.push(`X: ${clusterMeta.X}`);
    if (clusterMeta.Y) frag.push(`Y: ${clusterMeta.Y}`);
    if (clusterMeta.Z) frag.push(`Z: ${clusterMeta.Z}`);
    parts.push(frag.join(' · '));
  }

  // Riga 4: eventuale testo del vecchio strategia_ai_language,
  // MA solo se non è il solito placeholder "Pensieri dominanti su ."
  const cleaned = riassuntoRaw.trim();
  const isPlaceholder = /^pensieri dominanti su\s*\.?$/i.test(cleaned);
  if (cleaned && !isPlaceholder) {
    parts.push(cleaned);
  }

  return parts.join('\n');
}

export default function SpiegazioneOverlay({
  title,
  data,
}: {
  title: string;
  data?: Any;
}) {
  const { tfs: _tfsRaw, global, raw } = readRiepilogo(data);
  const px = readPrice(data);
  const { supports, resists } = readSR(data, raw);
  const liquidity = readLiquidity(data, raw);
  const gasMeta = readGasMeta(data, raw);

  const scenariByTf = extractScenariByTf((data ?? {}) as Any, raw ?? {});

  // Linguaggio gassoso per timeframe (strategia_ai_language dal JSON 2.0)
  const aiLang: any =
    (data as any)?.strategia_ai_pacchetto?.strategia_ai_language ??
    (raw as any)?.strategia_ai_pacchetto?.strategia_ai_language ??
    (data as any)?.strategia_ai_language ??
    (raw as any)?.strategia_ai_language ??
    (data as any)?.riepilogo?.strategia_ai_language ??
    {};

  const aiLangTfs: string[] =
    Array.isArray((data as Any)?.timeframes) &&
      (data as Any)?.timeframes.length
      ? ((data as Any)?.timeframes as string[])
      : Object.keys(aiLang ?? {});

  // 👉 fallback: se i S/R non sono disponibili, usa i livelli della liquidità
  const supportsForCalc: SR[] = supports.length
    ? supports
    : liquidity.below.map((p) => ({
      mid: p.price,
      min: p.price,
      max: p.price,
      forza: p.forza,
      tf: '',
    }));

  const resistsForCalc: SR[] = resists.length
    ? resists
    : liquidity.above.map((p) => ({
      mid: p.price,
      min: p.price,
      max: p.price,
      forza: p.forza,
      tf: '',
    }));

  const { tfMap, tfSource, tfKeysRaw, tfKeysNorm } = resolveTFMap(data, raw);

  const { text, quadro, groups } = buildNarrativa({
    px,
    tfMap,
    scenariByTf: extractScenariByTf((data ?? {}) as Any, raw ?? {}),
    supports: supportsForCalc,
    resists: resistsForCalc,
    liquidity,
  });

  // Esposizione debug 2.0 su window (solo per ispezione da console)
  if (typeof window !== 'undefined') {
    (window as any).__SPIEGAZIONE__ = {
      tfSource,
      tfKeysRaw,
      tfKeysNorm,
      tfMap,
      groups,
      price: px,
      supports,
      resists,
      liquidity,
      trend_global: quadro,
      gasMeta,
    };
    if (qDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.info('[Spiegazione][DBG]', (window as any).__SPIEGAZIONE__);
    }
  }

  const overlayTitle = `🧠🧠🧠 ${title ?? 'Pregresso (da dove veniamo)'}`;

  const hasGasClusterMeta =
    gasMeta.brevi || gasMeta.medi || gasMeta.lunghi;

  const rows = [
    {
      key: 'brevi' as const,
      label: 'TF brevi (scalping/intraday)',
      meta: gasMeta.brevi,
    },
    {
      key: 'medi' as const,
      label: 'TF medi (swing/intermedio)',
      meta: gasMeta.medi,
    },
    {
      key: 'lunghi' as const,
      label: 'TF lunghi (strutturale)',
      meta: gasMeta.lunghi,
    },
  ];

  const conflict = {
    brevi: false,
    medi:
      !!groups.brevi?.dir &&
      !!groups.medi?.dir &&
      groups.brevi.dir !== groups.medi.dir ||
      !!groups.medi?.dir &&
      !!groups.lunghi?.dir &&
      groups.medi.dir !== groups.lunghi.dir,
    lunghi: false,
  };

  const formatXYZ = (meta?: GasClusterMeta) => {
    if (!meta) return '—';
    const parts: string[] = [];
    if (meta.X) parts.push(`X: ${meta.X}`);
    if (meta.Y) parts.push(`Y: ${meta.Y}`);
    if (meta.Z) parts.push(`Z: ${meta.Z}`);
    if (!parts.length && meta.extra) parts.push(meta.extra);
    return parts.length ? parts.join('\n') : '—';
  };

  return (
    <OverlayShell>
      <SafeDialogContent
        title={overlayTitle}
        description="Pregresso: da che tipo di movimento e di contesto arrivano i segnali attuali."
        className="w-[min(96vw,900px)] p-0 bg-zinc-900/95 text-white border border-white/10"
      >
        <DialogHeader className="px-5 py-3 border-b border-white/10">
          <DialogTitle className="text-lg md:text-xl">
            {overlayTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 text-sm leading-relaxed">
          {/* Testo principale: bias multi-TF + S/R + liquidità + scenari attivi */}
          <p className="whitespace-pre-line">{text}</p>

          {/* Mini tabella riassuntiva Bias + X/Y/Z per cluster (brevi/medi/lunghi) */}
          <div className="mt-4 rounded-xl bg-zinc-950/70 border border-white/10 overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Riepilogo multi-timeframe (Bias &amp; struttura gassosa)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] md:text-xs">
                <thead className="bg-zinc-900/90 text-zinc-300 border-t border-white/10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Cluster
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Bias
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Scenari attivi
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      X / Y / Z
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, label, meta }) => {
                    const g = groups[key];
                    const scenari = g?.scenari ?? [];
                    const scenariLabel =
                      scenari.length === 0
                        ? '—'
                        : scenari.length <= 3
                          ? scenari.join(', ')
                          : `${scenari.slice(0, 3).join(', ')} +${scenari.length - 3
                          }`;

                    const isConflict = conflict[key];

                    return (
                      <tr
                        key={key}
                        className={`border-t border-white/10 odd:bg-zinc-900/40 even:bg-zinc-900/20 ${isConflict ? 'bg-amber-900/20' : ''
                          }`}
                      >
                        <td className="px-3 py-2 align-top text-zinc-100">
                          {label}
                          {meta?.tf_ref && (
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              TF di riferimento: {meta.tf_ref}
                            </div>
                          )}
                        </td>
                        <td
                          className={`px-3 py-2 align-top text-zinc-100 ${isConflict ? 'text-amber-300' : ''
                            }`}
                        >
                          {g?.dir ?? '—'}
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-100">
                          {scenariLabel}
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-100 whitespace-pre-line">
                          {formatXYZ(meta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Blocchetto descrittivo X/Y/Z se abbiamo meta gassoso clusterizzato */}
          {hasGasClusterMeta && (
            <div className="mt-3 text-[11px] md:text-xs text-zinc-300">
              <div className="font-semibold text-zinc-400 mb-1">
                Struttura gassosa (X/Y/Z)
              </div>
              <p className="text-zinc-200">
                <strong>X</strong> descrive la sequenza/tempo del movimento,{' '}
                <strong>Y</strong> la posizione verticale nel range e rispetto a
                supporti/resistenze, e <strong>Z</strong> la profondità ciclica /
                convergenza tra timeframe. Le tre righe della tabella riassumono
                come questi assi si distribuiscono tra TF brevi, medi e lunghi.
              </p>
            </div>
          )}

          {/* Linguaggio gassoso per timeframe (pregresso 2.0) */}
          {aiLang && Object.keys(aiLang).length > 0 && (
            <div className="mt-4 rounded-xl bg-zinc-950/70 p-3 text-xs md:text-sm text-zinc-100">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Pregresso per timeframe (linguaggio gassoso)
              </div>
              <div className="space-y-2">
                {(aiLangTfs.length ? aiLangTfs : Object.keys(aiLang)).map((tfKey) => {
                  const testo = buildPregressoTextForTf({
                    tfKey,
                    tfMap,
                    scenariByTf,
                    gasMeta,
                    groups,
                    aiLang,
                  });

                  if (!testo) return null;

                  return (
                    <div
                      key={tfKey}
                      className="rounded-lg bg-zinc-900/80 px-3 py-2"
                    >
                      <div className="mb-1 text-[11px] font-semibold text-zinc-300">
                        TF {tfKey}
                      </div>
                      <div className="text-[12px] text-zinc-100 whitespace-pre-line">
                        {testo}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prezzo di riferimento */}
          {Number.isFinite(px as number) && (
            <p className="mt-3 text-xs text-white/60">
              Prezzo di riferimento:{' '}
              <span className="text-white/80">{fmtPrice(px as number)}</span>
            </p>
          )}

          {/* Conteggio S/R usati */}
          {supports.length + resists.length > 0 && (
            <p className="mt-1 text-[11px] text-white/40">
              S/R considerati: {supports.length} supporti, {resists.length}{' '}
              resistenze (merge completo dal pannello SR).
            </p>
          )}

          {/* Debug opzionale */}
          {qDebugEnabled() && (
            <pre className="mt-4 max-h-[280px] overflow-auto rounded-lg bg-black/60 p-3 text-[10px] leading-snug text-green-300">
              {JSON.stringify(
                {
                  global,
                  px,
                  groups,
                  tfSource,
                  gasMeta,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </SafeDialogContent>
    </OverlayShell>
  );
}
