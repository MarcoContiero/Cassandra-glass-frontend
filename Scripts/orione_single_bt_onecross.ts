/**
 * scripts/orione_single_bt_onecross.ts
 *
 * Variante: APERTURA e CHIUSURA con **un solo incrocio** (EMA9 contro EMA21 **oppure** SMA20)
 * - Apertura long:  EMA9 incrocia **sopra** (up) E21 **o** SMA20
 * - Apertura short: EMA9 incrocia **sotto** (down) E21 **o** SMA20
 * - Chiusura: basta **un** incrocio contrario (up/down) su una delle due (E21 o SMA20)
 * - Flip: se nella stessa barra dopo la chiusura c'è anche un segnale opposto d'apertura, riapre
 *
 * Opzionali: SL (% prezzo) e TP (% equity, leverage-aware)
 * - --sl 2    => stop loss quando il prezzo va contro del 2%
 * - --tp 0.5  => take profit quando equity (leva*move prezzo) raggiunge +0.5%
 *   (mettere 0 per disattivare; default 0 = OFF)
 *
 * Sorgenti dati: Bybit / Binance / API locale (paginate)
 * Output: CSV + riga meta (versione + parametri usati)
 *
 * Esempio:
 *   node --loader ts-node/esm scripts/orione_single_bt_onecross.ts --verbose \
 *     --exchange bybit --market perp --symbol ETH --limit 3000 \
 *     --sl 0 --tp 0 \
 *     --outfile ./bt_onecross_bybit_perp_ETH.csv
 */

import * as fs from 'fs';
import * as path from 'path';

// ======== Verbose flag ========
const VERBOSE = process.argv.includes('--verbose');

// ======== CLI helpers ========
function argVal(name: string, def?: string) {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1] ?? def; // --name value
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq != null) return eq.slice(name.length + 1);            // --name=value (anche vuoto)
  return def;
}

// ======== Types ========

type Side = 1 | -1; // 1=long, -1=short

type Config = {
  fee_bps_round: number; // bps round‑trip
  leverage: number;      // leva
  qty: number;           // size in coin (quanto compri/vendi)
  slippage_bps: number;  // bps per lato
  exec: 'next' | 'close';
  side: 'both' | 'long' | 'short';
  // opzionali
  sl_pct_price?: number; // SL in % di prezzo (es. 2 = 2% contro)
  tp_eq_pct?: number;    // TP in % di equity (leva * move prezzo). Es. 0.5 = +0.5% equity
};

type Trade = {
  dir: Side;
  entryI: number; entryP: number; entryTs?: number;
  exitI: number;  exitP: number;  exitTs?: number;
  grossRet: number; // (exit/entry-1)*dir
  pnlBeforeFees$: number;
  fees$: number;
  pnl$: number;
  tagE21I?: number; tagE21Ts?: number; // ultimo cross E21 <= i
  tagBBI?: number;  tagBBTs?: number;  // ultimo cross BB  <= i
};

// ======== Math helpers ========
function emaArray(xs: number[], p: number): (number | undefined)[] {
  if (xs.length === 0) return [];
  const k = 2 / (p + 1);
  const out: (number | undefined)[] = new Array(xs.length).fill(undefined);
  if (xs.length < p) return out;
  let e = xs[p - 1];
  out[p - 1] = e;
  for (let i = p; i < xs.length; i++) {
    e = xs[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}
function smaArray(xs: number[], p: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(xs.length).fill(undefined);
  if (xs.length < p) return out;
  let s = 0;
  for (let i = 0; i < p; i++) s += xs[i];
  out[p - 1] = s / p;
  for (let i = p; i < xs.length; i++) {
    s += xs[i] - xs[i - p];
    out[i] = s / p;
  }
  return out;
}
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// Trova indici di incrocio (cambio segno) su y=a-b
function crossIndices(a: (number|undefined)[], b: (number|undefined)[]): number[] {
  const idx: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]; const bi = b[i];
    if (ai == null || bi == null) continue;
    const d = ai - bi; const s = sign(d);
    if (prev == null) { prev = s; continue; }
    if (s !== 0 && prev !== 0 && s !== prev) idx.push(i);
    prev = s;
  }
  return idx;
}

function lastLE(arr: number[], x: number) {
  let lo = 0, hi = arr.length - 1, ans: number | undefined = undefined;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// ======== Backtest core ========
function runBacktest(closes: number[], times: number[], cfg: Config) {
  const ema9  = emaArray(closes, 9);
  const ema21 = emaArray(closes, 21);
  const sma20 = smaArray(closes, 20);

  const crossE21 = crossIndices(ema9, ema21); // indici dove 9 incrocia 21
  const crossBB  = crossIndices(ema9, sma20); // indici dove 9 incrocia SMA20

  const execOffset = cfg.exec === 'next' ? 1 : 0;
  const trades: Trade[] = [];

  let pos: null | { dir: Side; entryI: number; entryP: number } = null;
  const iStart = Math.max(21, execOffset);

  for (let i = iStart; i < closes.length - execOffset; i++) {
    const e9 = ema9[i]; const e21 = ema21[i]; const m20 = sma20[i];
    const e9p = ema9[i-1]; const e21p = ema21[i-1]; const m20p = sma20[i-1];
    if (e9 == null || e21 == null || m20 == null || e9p == null || e21p == null || m20p == null) continue;

    // Cross su questa barra: basta uno dei due
    const crossUpE21  = (e9p <= e21p) && (e9 >  e21);
    const crossDnE21  = (e9p >= e21p) && (e9 <  e21);
    const crossUpBB   = (e9p <= m20p) && (e9 >  m20);
    const crossDnBB   = (e9p >= m20p) && (e9 <  m20);

    // *** APERTURA: basta un singolo cross (E21 OPPURE BB) ***
    let openWant: Side | 0 = 0;
    if ((crossUpE21 || crossUpBB) && (cfg.side === 'both' || cfg.side === 'long')) openWant = 1;
    if ((crossDnE21 || crossDnBB) && (cfg.side === 'both' || cfg.side === 'short')) openWant = -1;

    const execI = i + execOffset;
    if (execI >= closes.length) break;

    const withSlip = (price: number, side: Side) => {
      if (cfg.slippage_bps <= 0) return price;
      const slip = price * (cfg.slippage_bps / 10_000);
      return side === 1 ? price + slip : price - slip;
    };

    if (!pos) {
      if (openWant !== 0) {
        const ep = withSlip(closes[execI], openWant as Side);
        pos = { dir: openWant as Side, entryI: execI, entryP: ep };
      }
      continue;
    }

    // *** CHIUSURA: basta un incrocio contrario (E21 O BB) O SL/TP ***
    let exitOpp = false;
    if (pos.dir === 1) exitOpp = crossDnE21 || crossDnBB; else exitOpp = crossUpE21 || crossUpBB;

    // SL/TP opzionali
    const px = closes[execI];
    const moveFromEntry = (px / pos.entryP - 1) * pos.dir; // frazione, es 0.02 = +2%
    const hitSL = (cfg.sl_pct_price ?? 0) > 0 ? (moveFromEntry <= -(cfg.sl_pct_price! / 100)) : false;
    const hitTP = (cfg.tp_eq_pct ?? 0) > 0 ? ((moveFromEntry * cfg.leverage * 100) >= cfg.tp_eq_pct!) : false;

    if (exitOpp || hitSL || hitTP) {
      // chiusura
      let exitP = px;
      if (cfg.slippage_bps > 0) { const s = exitP * (cfg.slippage_bps / 10_000); exitP = pos.dir === 1 ? exitP - s : exitP + s; }
      const grossRet = (exitP / pos.entryP - 1) * pos.dir;
      const notional$ = cfg.qty * pos.entryP * cfg.leverage;
      const pnlBeforeFees$ = notional$ * grossRet;
      const fees$ = notional$ * (cfg.fee_bps_round / 10_000);
      const pnl$ = pnlBeforeFees$ - fees$;

      // Tag diagnostici
      const e21Pos = lastLE(crossE21, i); const tagE21Idx = e21Pos != null ? crossE21[e21Pos] : undefined;
      const bbPos  = lastLE(crossBB,  i); const tagBBIdx  = bbPos  != null ? crossBB[bbPos]  : undefined;

      trades.push({
        dir: pos.dir,
        entryI: pos.entryI, entryP: pos.entryP, entryTs: times[pos.entryI],
        exitI: execI, exitP, exitTs: times[execI],
        grossRet, pnlBeforeFees$, fees$, pnl$,
        tagE21I: tagE21Idx, tagE21Ts: tagE21Idx!=null ? times[tagE21Idx] : undefined,
        tagBBI: tagBBIdx,   tagBBTs:  tagBBIdx!=null ? times[tagBBIdx]  : undefined,
      });

      // flip solo se l'uscita è per incrocio opposto (non per SL/TP)
      if (openWant !== 0 && exitOpp) {
        const ep = withSlip(closes[execI], openWant as Side);
        pos = { dir: openWant as Side, entryI: execI, entryP: ep };
      } else {
        pos = null;
      }

      continue;
    }
  }

  // Chiudi eventuale posizione alla fine
  if (pos) {
    const exitI = closes.length - 1;
    let exitP = closes[exitI];
    if (cfg.slippage_bps > 0) { const s = exitP * (cfg.slippage_bps / 10_000); exitP = pos.dir === 1 ? exitP - s : exitP + s; }
    const grossRet = (exitP / pos.entryP - 1) * pos.dir;
    const notional$ = cfg.qty * pos.entryP * cfg.leverage;
    const pnlBeforeFees$ = notional$ * grossRet;
    const fees$ = notional$ * (cfg.fee_bps_round / 10_000);
    const pnl$ = pnlBeforeFees$ - fees$;
    trades.push({ dir: pos.dir, entryI: pos.entryI, entryP: pos.entryP, entryTs: times[pos.entryI], exitI, exitP, exitTs: times[exitI], grossRet, pnlBeforeFees$, fees$, pnl$ });
  }

  // Stats
  let pnlSum = 0, maxDD = 0, eq = 0, wins = 0; const eqCurve: number[] = [];
  for (const t of trades) { pnlSum += t.pnl$; eq += t.pnl$; if (eq < maxDD) maxDD = eq; if (t.pnl$ > 0) wins++; eqCurve.push(eq); }
  const stats = { n: trades.length, win: wins, loss: trades.length - wins, winRate: trades.length ? +(wins * 100 / trades.length).toFixed(2) : 0, pnl$: +pnlSum.toFixed(6), maxDD$: +maxDD.toFixed(6) };
  return { trades, stats, equity: eqCurve };
}

// ======== Data fetch ========
function fetchWithTimeout(url: string, opts: any = {}, ms = 15000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(id));
}
function writeFileEnsured(filePath: string, content: string) {
  const dir = path.dirname(filePath); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(filePath, content, 'utf8');
}

async function fetchSeries(
  symbol: string,
  limit: number,
  api?: string,
  market: string = 'spot',
  exchange: 'auto' | 'binance' | 'bybit' | 'local' = 'auto',
) {
  symbol = symbol.toUpperCase();
  let closes: number[] = [], times: number[] = [];

  const tryLocal = async () => {
    const u = `${api}?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${limit}&market=${market}`;
    if (VERBOSE) console.log('[fetch] local', u);
    const r = await fetchWithTimeout(u, { cache: 'no-store' as any }, 15000);
    if (!r.ok) throw new Error(`local api status ${r.status}`);
    const j = await r.json();
    closes = Array.isArray(j.closes) ? j.closes : [];
    times  = Array.isArray(j.times)  ? j.times  : [];
  };

  const tryBinance = async () => {
    const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const base = 'https://api.binance.com/api/v3/klines';
    const want = limit; let collected: any[] = []; let endTime: number | undefined = undefined;
    while (collected.length < want) {
      const batch = Math.min(1000, want - collected.length);
      const qs = new URLSearchParams({ symbol: sym, interval: '1m', limit: String(batch), ...(endTime ? { endTime: String(endTime) } : {}) });
      const url = `${base}?${qs}`;
      if (VERBOSE) console.log('[fetch] binance', url);
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) throw new Error(`binance status ${r.status}`);
      const j: any[] = await r.json();
      if (!Array.isArray(j) || j.length === 0) break;
      collected = j.concat(collected); // prepara ASC finale
      endTime = j[0][0] - 1;
    }
    const slice = collected.slice(-want);
    times = slice.map(row => row[0]);
    closes = slice.map(row => +row[4]);
  };

  const tryBybit = async () => {
    // Bybit v5: /v5/market/kline?category=spot|linear&symbol=BTCUSDT&interval=1&limit&end
    const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const category = (market?.toLowerCase() === 'spot') ? 'spot' : 'linear';
    const base = 'https://api.bybit.com/v5/market/kline';
    const want = limit; let end: number | undefined = undefined; let collected: any[] = [];
    while (collected.length < want) {
      const batch = Math.min(200, want - collected.length);
      const qs = new URLSearchParams({ category, symbol: sym, interval: '1', limit: String(batch), ...(end ? { end: String(end) } : {}) });
      const url = `${base}?${qs}`;
      if (VERBOSE) console.log('[fetch] bybit', url);
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) throw new Error(`bybit status ${r.status}`);
      const j: any = await r.json();
      const list: any[] = j?.result?.list ?? [];
      if (!Array.isArray(list) || list.length === 0) break;
      collected = collected.concat(list);
      let minStart = +list[0][0];
      for (const row of list) if (+row[0] < minStart) minStart = +row[0];
      end = minStart - 1;
    }
    collected.sort((a, b) => (+a[0]) - (+b[0]));
    const slice = collected.slice(-want);
    times  = slice.map(r => +r[0]);
    closes = slice.map(r => +r[4]);
  };

  if (exchange === 'bybit')      await tryBybit();
  else if (exchange === 'binance') await tryBinance();
  else if (exchange === 'local' || (api && api.length > 0)) {
    try { await tryLocal(); }
    catch (e) { if (VERBOSE) console.warn('[fetch] local failed, fallback binance:', (e as any)?.message || e); await tryBinance(); }
  } else { await tryBinance(); }

  const n = Math.min(closes.length, times.length);
  return { closes: closes.slice(0, n), times: times.slice(0, n) };
}

// ======== CSV ========
function toCSV(symbol: string, trades: Trade[]) {
  const rows: (string|number)[][] = [
    ['symbol','dir','entry_idx','entry_at','entry_price','exit_idx','exit_at','exit_price','gross_ret_pct','pnl_before_fees$','fees$','pnl$','tagE21_idx','tagE21_at','tagBB_idx','tagBB_at']
  ];
  for (const t of trades) {
    rows.push([
      symbol,
      t.dir === 1 ? 'long' : 'short',
      t.entryI,
      t.entryTs ? new Date(t.entryTs).toISOString() : '',
      +t.entryP.toFixed(8),
      t.exitI,
      t.exitTs ? new Date(t.exitTs).toISOString() : '',
      +t.exitP.toFixed(8),
      +(t.grossRet * 100).toFixed(5),
      +t.pnlBeforeFees$.toFixed(6),
      +t.fees$.toFixed(6),
      +t.pnl$.toFixed(6),
      t.tagE21I ?? '',
      t.tagE21Ts ? new Date(t.tagE21Ts).toISOString() : '',
      t.tagBBI ?? '',
      t.tagBBTs ? new Date(t.tagBBTs).toISOString() : '',
    ]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

// ======== Main ========
async function main() {
  // Preset default (sovrascrivibili da CLI)
  const symbol = argVal('--symbol', 'ETH')!;
  const limit = +(argVal('--limit', '1200')!);
  const fee = +(argVal('--fee', '12')!);
  const lev = +(argVal('--lev', '5')!);
  const qty = +(argVal('--qty', '1')!);
  const slip = +(argVal('--slip', '0')!);
  const exec = (argVal('--exec', 'next')! as 'next'|'close');
  const side = (argVal('--side', 'both')! as 'both'|'long'|'short');
  const api = argVal('--api', 'http://localhost:3000/api/klines');
  const market = argVal('--market', 'spot')!; // spot | perp/linear
  const exchange = (argVal('--exchange', 'auto')! as 'auto'|'binance'|'bybit'|'local');
  const tp = +(argVal('--tp', '0')!);   // % equity (leveraged), 0 = disattivo
  const sl = +(argVal('--sl', '0')!);   // % prezzo, 0 = disattivo
  const outfile = argVal('--outfile', './bt.csv');

  if (VERBOSE) console.log('[bt] start fetch');
  const { closes, times } = await fetchSeries(symbol, limit, api, market, exchange);
  if (VERBOSE) console.log(`[bt] fetched: closes=${closes.length} times=${times.length}`);
  if (!closes.length) throw new Error('Nessun dato di close');

  const cfg: Config = { fee_bps_round: fee, leverage: lev, qty, slippage_bps: slip, exec, side, sl_pct_price: sl, tp_eq_pct: tp };
  const { trades, stats } = runBacktest(closes, times, cfg);

  const meta = [
    '# orione_single_bt v1.1-onecross',
    `# exchange=${exchange} market=${market} symbol=${symbol} limit=${limit}`,
    `# exec=${exec} side=${side} lev=${lev} feeRTbps=${fee} slipbps=${slip} sl%=${sl} tp_eq%=${tp}`,
  ].join('\n') + '\n';
  
  const csv = meta + toCSV(symbol, trades);
  const fname = outfile || `./bt_${symbol}_${Date.now()}.csv`;
  if (VERBOSE) console.log('[bt] writing CSV:', fname);
  writeFileEnsured(fname, csv);

  console.log(`
=== ORIONE 1m BACKTEST — ${symbol} (${limit}m) ===`);
  console.log(`exchange=${exchange} market=${market} side=${side} exec=${exec} lev=${lev} feeRT=${fee}bps slip=${slip}bps qty=${qty} sl=${sl}% tp_eq=${tp}%`);
  console.log(`trades=${stats.n} win%=${stats.winRate} pnl$=${stats.pnl$} maxDD$=${stats.maxDD$}`);
  console.log(`CSV: ${fname}`);
}

main().catch(err => { console.error(err); process.exit(1); });
