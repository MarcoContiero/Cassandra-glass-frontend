/**
 * scripts/orione_single_bt.ts
 *
 * Backtest 1m stabile con:
 * - Apertura al SECONDO incrocio tra EMA9↔EMA21 e BB-mid (SMA20), anche su barre diverse e in qualsiasi ordine
 * - Uscita a segnale opposto OPPURE TP/SL/Trailing (intrabar con High/Low)
 * - Compounding opzionale: --cap (capitale iniziale) + --alloc (%) → qty dinamica; altrimenti qty fissa
 * - Trailing con OPZIONE DI ATTIVAZIONE: --trail_arm (in %) o --trail_arm_px (prezzo assoluto)
 * - CSV invariato + colonna finale: open_crossDist_bars
 * - Tutti i numeri in CSV/log troncati a 2 decimali (non arrotondati)
 */

import * as fs from 'fs';
import * as path from 'path';

// ======== Flags ========
const VERBOSE = process.argv.includes('--verbose');
const DEBUG_SIZING = process.argv.includes('--debug-sizing');

// ======== CLI helpers ========
function argVal(name: string, def?: string) {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1] ?? def;
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq != null) return eq.slice(name.length + 1);
  return def;
}

// ======== Types ========
type Side = 1 | -1; // 1=long, -1=short

type Config = {
  fee_bps_round: number; // bps round-trip
  leverage: number;      // leva
  qty: number;           // size in coin (usata se --cap=0)
  slippage_bps: number;  // bps per lato
  exec: 'next' | 'close';
  side: 'both' | 'long' | 'short';
  filter: 'none' | 'bb';
  // TP/SL/Trail (percentuali, es. 0.5 = 0,5%)
  tp_pct?: number;
  sl_pct?: number;
  trail_pct?: number;
  // Trailing activation (come sugli exchange)
  trail_arm_pct?: number;   // attiva trailing dopo X% di movimento dal prezzo d’ingresso (long su, short giù)
  trail_arm_price?: number; // attiva trailing quando il last raggiunge questo prezzo assoluto
  // Compounding
  capital_init?: number; // --cap
  alloc_pct?: number;    // --alloc%
};

type Trade = {
  dir: Side;
  entryI: number; entryP: number; entryTs?: number;
  exitI: number;  exitP: number;  exitTs?: number;
  grossRet: number; // (exit/entry-1)*dir
  pnlBeforeFees$: number;
  fees$: number;
  pnl$: number;
  tagE21I?: number; tagE21Ts?: number;
  tagBBI?: number;  tagBBTs?: number;
  openDistBars?: number; // distanza in barre tra primo e secondo incrocio che hanno aperto
};

// ======== Number formatting helpers (truncate, not round) ========
function trunc2(n: number): number { return Math.trunc(n * 100) / 100; }
function trunc2str(n: number): string { return isFinite(n) ? trunc2(n).toFixed(2) : ''; }

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

// Trova tutti gli indici di incrocio (cambio di segno) dell'array y[i]=a[i]-b[i]
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
  // ultimo valore in arr <= x, ritorna indice o undefined
  let lo = 0, hi = arr.length - 1, ans: number | undefined = undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// ======== Fetch helpers ========
function fetchWithTimeout(url: string, opts: any = {}, ms = 15000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(id));
}
function writeFileEnsured(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// Deduplica e normalizza ASC per timestamp (con High/Low)
function dedupAscHL(tRaw: number[], cRaw: number[], hRaw: number[], lRaw: number[]) {
  const map = new Map<number, {c:number,h:number,l:number}>(); // t -> {c,h,l}
  for (let i = 0; i < tRaw.length; i++) map.set(tRaw[i], { c: cRaw[i], h: hRaw[i], l: lRaw[i] });
  const ts = Array.from(map.keys()).sort((a,b)=>a-b);
  return {
    times: ts,
    closes: ts.map(t => map.get(t)!.c),
    highs:  ts.map(t => map.get(t)!.h),
    lows:   ts.map(t => map.get(t)!.l),
  };
}

async function fetchSeries(
  symbol: string,
  limit: number,
  api?: string,
  market: string = 'spot',
  exchange: 'auto' | 'binance' | 'bybit' | 'local' = 'auto',
) {
  symbol = symbol.toUpperCase();
  let closes: number[] = [], times: number[] = [], highs: number[] = [], lows: number[] = [];

  const tryLocal = async () => {
    const u = `${api}?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${limit}&market=${market}`;
    if (VERBOSE) console.log('[fetch] local', u);
    const r = await fetchWithTimeout(u, { cache: 'no-store' as any }, 15000);
    if (!r.ok) throw new Error(`local api status ${r.status}`);
    const j = await r.json();
    const arr: any[] = Array.isArray(j) ? j : (j.klines || j.data || j.result || []);
    times  = arr.map(row => +(row[0] ?? row.t));
    closes = arr.map(row => +(row[4] ?? row.c));
    highs  = arr.map(row => +(row[2] ?? row.h ?? row.c));
    lows   = arr.map(row => +(row[3] ?? row.l ?? row.c));
  };

  const tryBinance = async () => {
    const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const base = 'https://api.binance.com/api/v3/klines';
    const want = limit;
    let collected: any[] = [];
    let endTime: number | undefined = undefined;

    while (collected.length < want) {
      const batch = Math.min(1000, want - collected.length);
      const qs = new URLSearchParams({ symbol: sym, interval: '1m', limit: String(batch), ...(endTime ? { endTime: String(endTime) } : {}) });
      const url = `${base}?${qs}`;
      if (VERBOSE) console.log('[fetch] binance', url);
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) throw new Error(`binance status ${r.status}`);
      const j: any[] = await r.json();
      if (!Array.isArray(j) || j.length === 0) break;
      collected = j.concat(collected);         // ASC, scendo indietro con endTime
      endTime = j[0][0] - 1;
    }

    const slice = collected.slice(-want);
    const tRaw = slice.map(row => +row[0]);
    const cRaw = slice.map(row => +row[4]);
    const hRaw = slice.map(row => +row[2]);
    const lRaw = slice.map(row => +row[3]);
    const d = dedupAscHL(tRaw, cRaw, hRaw, lRaw);
    times  = d.times; closes = d.closes; highs = d.highs; lows = d.lows;
  };

  const tryBybit = async () => {
    // Bybit v5: /v5/market/kline?category=spot|linear&symbol=BTCUSDT&interval=1&limit&end
    const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const category = (market?.toLowerCase() === 'spot') ? 'spot' : 'linear';
    const base = 'https://api.bybit.com/v5/market/kline';

    const want = limit;
    let end: number | undefined = undefined;   // ms
    let collected: any[] = [];
    const seen = new Set<number>(); // dedup by timestamp

    while (collected.length < want) {
      const batch = Math.min(200, want - collected.length);
      const qs = new URLSearchParams({ category, symbol: sym, interval: '1', limit: String(batch), ...(end ? { end: String(end) } : {}) });
      const url = `${base}?${qs}`;
      if (VERBOSE) console.log('[fetch] bybit', url);
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) throw new Error(`bybit status ${r.status}`);
      const j: any = await r.json();
      let list: any[] = j?.result?.list ?? [];
      if (!Array.isArray(list) || list.length === 0) break;

      // Normalizza ad ASC
      const t0 = +list[0][0], tN = +list[list.length - 1][0];
      const asc = t0 < tN;
      if (!asc) list = list.slice().reverse();

      // De-dup e raccolta
      const fresh: any[] = [];
      for (const row of list) {
        const ts = +row[0];
        if (!seen.has(ts)) { seen.add(ts); fresh.push(row); }
      }
      collected = fresh.concat(collected);

      // Fai un passo indietro nel tempo
      const earliest = +list[0][0];
      end = earliest - 1;

      if (fresh.length === 0) break;
    }

    const slice = collected.slice(-want);
    const tRaw = slice.map(r => +r[0]);
    const cRaw = slice.map(r => +r[4]);
    const hRaw = slice.map(r => +r[2]);
    const lRaw = slice.map(r => +r[3]);
    const d = dedupAscHL(tRaw, cRaw, hRaw, lRaw);
    times  = d.times; closes = d.closes; highs = d.highs; lows = d.lows;
  };

  if (exchange === 'bybit')       await tryBybit();
  else if (exchange === 'binance') await tryBinance();
  else if (exchange === 'local' || (api && api.length > 0)) {
    try { await tryLocal(); }
    catch (e) { if (VERBOSE) console.warn('[fetch] local failed, fallback binance:', (e as any)?.message || e); await tryBinance(); }
  } else {
    await tryBinance();
  }

  // Fallback se mancano hi/lo
  if (!highs.length || !lows.length) {
    highs = closes.slice();
    lows  = closes.slice();
  }

  const n = Math.min(closes.length, times.length, highs.length, lows.length);
  return {
    closes: closes.slice(0, n).slice(-limit),
    times:  times.slice(0, n).slice(-limit),
    highs:  highs.slice(0, n).slice(-limit),
    lows:   lows.slice(0, n).slice(-limit),
  };
}

// ======== Backtest core ========
function runBacktest(closes: number[], times: number[], highs: number[], lows: number[], cfg: Config) {
  const ema9  = emaArray(closes, 9);
  const ema21 = emaArray(closes, 21);
  const sma20 = smaArray(closes, 20);

  const crossE21 = crossIndices(ema9, ema21);
  const crossBB  = crossIndices(ema9, sma20);

  const execOffset = cfg.exec === 'next' ? 1 : 0;
  const trades: Trade[] = [];

  // Compounding
  const compounding = (cfg.capital_init ?? 0) > 0;
  let capital = cfg.capital_init ?? 0; // equity corrente
  const alloc = Math.max(0, Math.min(100, cfg.alloc_pct ?? 100)) / 100;

  // Stato posizione
  let pos: null | {
    dir: Side; entryI: number; entryP: number;
    peak: number; trough: number;
    qtyCoin: number;
    openFirstI?: number; openSecondI?: number; openDistBars?: number;
    trailArmed?: boolean; // nuovo: trailing attivo?
  } = null;

  // Tracker incroci
  let lastE21Up = -1, lastE21Dn = -1, lastBBUp = -1, lastBBDn = -1;
  // Pendings per combinare i due incroci anche su barre diverse
  let pendLongE21Up = -1, pendLongBBUp = -1;
  let pendShortE21Dn = -1, pendShortBBDn = -1;

  const iStart = Math.max(21, execOffset);

  for (let i = iStart; i < closes.length - execOffset; i++) {
    const e9 = ema9[i]; const e21 = ema21[i]; const m20 = sma20[i];
    const e9p = ema9[i-1]; const e21p = ema21[i-1]; const m20p = sma20[i-1];
    if (e9 == null || e21 == null || m20 == null || e9p == null || e21p == null || m20p == null) continue;

    // Cross attuali su E21 e BB (SMA20)
    const crossUpE21 = (e9p <= e21p) && (e9 > e21);
    const crossDnE21 = (e9p >= e21p) && (e9 < e21);
    const crossUpBB  = (e9p <= m20p) && (e9 > m20);
    const crossDnBB  = (e9p >= m20p) && (e9 < m20);

    // aggiorna tracker
    if (crossUpE21) lastE21Up = i;
    if (crossDnE21) lastE21Dn = i;
    if (crossUpBB)  lastBBUp  = i;
    if (crossDnBB)  lastBBDn  = i;

    // pendings per logica del "secondo incrocio"
    if (crossUpE21) { pendLongE21Up = i; pendShortE21Dn = -1; pendShortBBDn = -1; }
    if (crossUpBB)  { pendLongBBUp  = i; pendShortE21Dn = -1; pendShortBBDn = -1; }
    if (crossDnE21) { pendShortE21Dn = i; pendLongE21Up = -1; pendLongBBUp = -1; }
    if (crossDnBB)  { pendShortBBDn  = i; pendLongE21Up = -1; pendLongBBUp = -1; }

    // *** APERTURA: SECONDO incrocio (i due possono arrivare su barre diverse) ***
    let openWant: Side | 0 = 0;
    let openFirstI: number | undefined; let openSecondI: number | undefined;
    // Long quando entrambi gli up-cross sono presenti; apri quando arriva il secondo
    if ((cfg.side === 'both' || cfg.side === 'long') && (crossUpE21 || crossUpBB)) {
      if (pendLongE21Up >= 0 && pendLongBBUp >= 0) {
        openWant = 1;
        openFirstI = Math.min(pendLongE21Up, pendLongBBUp);
        openSecondI = Math.max(pendLongE21Up, pendLongBBUp);
      }
    }
    // Short quando entrambi i down-cross sono presenti; apri quando arriva il secondo
    if (openWant === 0 && (cfg.side === 'both' || cfg.side === 'short') && (crossDnE21 || crossDnBB)) {
      if (pendShortE21Dn >= 0 && pendShortBBDn >= 0) {
        openWant = -1;
        openFirstI = Math.min(pendShortE21Dn, pendShortBBDn);
        openSecondI = Math.max(pendShortE21Dn, pendShortBBDn);
      }
    }

    const execI = i + execOffset;
    if (execI >= closes.length) break;

    const withSlip = (price: number, side: Side) => {
      const slipBps = (cfg.slippage_bps ?? 0);
      if (slipBps <= 0) return price;
      const slip = price * (slipBps / 10_000);
      return side === 1 ? price + slip : price - slip;
    };

    // ====== ENTRY ======
    if (!pos) {
      if (openWant !== 0) {
        const ep = withSlip(closes[execI], openWant as Side);
        const qtyCoin = (cfg.capital_init ?? 0) > 0
          ? Math.max(0, (capital * alloc) / ep)
          : (cfg.qty ?? 1);
        if (DEBUG_SIZING) console.log(`[size] entry @${ep} dir=${openWant} capital=${capital} alloc=${(alloc*100).toFixed(0)}% qty=${qtyCoin}`);
        pos = { dir: openWant as Side, entryI: execI, entryP: ep, peak: ep, trough: ep, qtyCoin,
                openFirstI: (openFirstI ?? execI), openSecondI: (openSecondI ?? execI),
                openDistBars: Math.max(0, (openSecondI ?? execI) - (openFirstI ?? execI)),
                trailArmed: false };

        // reset pendings dopo apertura
        pendLongE21Up = pendLongBBUp = pendShortE21Dn = pendShortBBDn = -1;
      }
      continue;
    }

    // ====== TP/SL/Trailing intrabar ======
    {
      const hi = highs[i], lo = lows[i];

      // aggiorna peak/trough
      if (pos.dir === 1) pos.peak = Math.max(pos.peak, hi);
      else               pos.trough = Math.min(pos.trough, lo);

      // --- Base SL/TP
      let baseSL: number | null = null;
      let TP: number | null = null;

      if ((cfg.sl_pct ?? 0) > 0) {
        baseSL = pos.dir === 1 ? pos.entryP * (1 - (cfg.sl_pct! / 100)) : pos.entryP * (1 + (cfg.sl_pct! / 100));
      }
      if ((cfg.tp_pct ?? 0) > 0) {
        TP = pos.dir === 1 ? pos.entryP * (1 + (cfg.tp_pct! / 100)) : pos.entryP * (1 - (cfg.tp_pct! / 100));
      }

      // --- Trailing activation (exchange-like)
      const trailPct = cfg.trail_pct ?? 0;
      const armPx = (cfg.trail_arm_price != null && isFinite(cfg.trail_arm_price))
        ? cfg.trail_arm_price
        : ((cfg.trail_arm_pct ?? 0) > 0
            ? (pos.dir === 1
                ? pos.entryP * (1 + (cfg.trail_arm_pct! / 100))
                : pos.entryP * (1 - (cfg.trail_arm_pct! / 100)))
            : undefined);

      // Se non specificato nulla, trailing è attivo subito
      if (trailPct > 0 && !pos.trailArmed) {
        if (armPx == null) {
          pos.trailArmed = true;
        } else {
          if (pos.dir === 1 && hi >= armPx) pos.trailArmed = true;
          if (pos.dir === -1 && lo <= armPx) pos.trailArmed = true;
        }
      }

      // --- Calcolo del trailing dinamico solo se "armed"
      let dynStop: number | null = null;
      if (trailPct > 0 && pos.trailArmed) {
        dynStop = pos.dir === 1 ? pos.peak * (1 - trailPct/100) : pos.trough * (1 + trailPct/100);
      }

      // stop effettivo = più stringente
      let stopEff: number | null = baseSL;
      if (dynStop != null) {
        stopEff = (stopEff == null)
          ? dynStop
          : (pos.dir === 1 ? Math.max(stopEff, dynStop) : Math.min(stopEff, dynStop));
      }

      // Priorità conservativa: SL/Trail prima, poi TP
      let exitPrice: number | null = null;
      if (stopEff != null) {
        if (pos.dir === 1 && lo <= stopEff) exitPrice = stopEff;
        if (pos.dir === -1 && hi >= stopEff) exitPrice = stopEff;
      }
      if (exitPrice == null && TP != null) {
        if (pos.dir === 1 && hi >= TP) exitPrice = TP;
        if (pos.dir === -1 && lo <= TP) exitPrice = TP;
      }

      if (exitPrice != null) {
        const execI2 = i; // intrabar
        const exitP = withSlip(exitPrice, (pos.dir * -1) as Side);
        const grossRet = (exitP / pos.entryP - 1) * pos.dir;

        const notional$ = pos.qtyCoin * pos.entryP * cfg.leverage;
        const pnlBeforeFees$ = grossRet * notional$;
        const fees$ = (cfg.fee_bps_round / 10_000) * notional$;
        const pnl$ = pnlBeforeFees$ - fees$;

        trades.push({
          dir: pos.dir,
          entryI: pos.entryI, entryP: pos.entryP, entryTs: times[pos.entryI],
          exitI: execI2, exitP, exitTs: times[execI2],
          grossRet, pnlBeforeFees$, fees$, pnl$,
          openDistBars: pos.openDistBars,
        });

        if (compounding) capital += pnl$;
        pos = null;
        continue;
      }
    }

    // ====== CHIUSURA a segnale contrario ======
    let exitOpp = false;
    if (pos.dir === 1) exitOpp = crossDnE21 || crossDnBB; // long -> chiudi su cross down E21 o BB
    else               exitOpp = crossUpE21 || crossUpBB; // short -> chiudi su cross up E21 o BB

    if (exitOpp) {
      const execI2 = i + execOffset;
      if (execI2 >= closes.length) break;

      let exitP = closes[execI2];
      const s = exitP * ((cfg.slippage_bps ?? 0) / 10_000);
      exitP = pos.dir === 1 ? exitP - s : exitP + s;

      const grossRet = (exitP / pos.entryP - 1) * pos.dir;
      const notional$ = pos.qtyCoin * pos.entryP * cfg.leverage;
      const pnlBeforeFees$ = grossRet * notional$;
      const fees$ = (cfg.fee_bps_round / 10_000) * notional$;
      const pnl$ = pnlBeforeFees$ - fees$;

      // Tag incroci
      const e21Pos = lastLE(crossE21, i); const tagE21Idx = e21Pos != null ? crossE21[e21Pos] : undefined;
      const bbPos  = lastLE(crossBB,  i); const tagBBIdx  = bbPos  != null ? crossBB[bbPos]  : undefined;

      trades.push({
        dir: pos.dir,
        entryI: pos.entryI, entryP: pos.entryP, entryTs: times[pos.entryI],
        exitI: execI2, exitP, exitTs: times[execI2],
        grossRet, pnlBeforeFees$, fees$, pnl$,
        tagE21I: tagE21Idx, tagE21Ts: tagE21Idx!=null ? times[tagE21Idx] : undefined,
        tagBBI: tagBBIdx,   tagBBTs:  tagBBIdx!=null ? times[tagBBIdx]   : undefined,
        openDistBars: pos.openDistBars,
      });

      if (compounding) capital += pnl$;

      // Re-open nella stessa barra solo se c'è il segnale completo opposto
      if (openWant !== 0) {
        const ep = withSlip(closes[execI2], openWant as Side);
        const qtyCoin = (cfg.capital_init ?? 0) > 0 ? Math.max(0, (capital * alloc) / ep) : (cfg.qty ?? 1);
        if (DEBUG_SIZING) console.log(`[size] REOPEN @${ep} dir=${openWant} capital=${capital} alloc=${(alloc*100).toFixed(0)}% qty=${qtyCoin}`);
        pos = { dir: openWant as Side, entryI: execI2, entryP: ep, peak: ep, trough: ep, qtyCoin,
                openFirstI: (openFirstI ?? execI2), openSecondI: (openSecondI ?? execI2),
                openDistBars: Math.max(0, (openSecondI ?? execI2) - (openFirstI ?? execI2)),
                trailArmed: false };
        pendLongE21Up = pendLongBBUp = pendShortE21Dn = pendShortBBDn = -1;
      } else {
        pos = null;
      }
      continue;
    }
  }

  // close finale
  if (pos) {
    const exitI = closes.length - 1;
    let exitP = closes[exitI];
    const slip = exitP * ((cfg.slippage_bps ?? 0) / 10_000);
    exitP = pos.dir === 1 ? exitP - slip : exitP + slip;

    const grossRet = (exitP / pos.entryP - 1) * pos.dir;
    const notional$ = pos.qtyCoin * pos.entryP * cfg.leverage;
    const pnlBeforeFees$ = grossRet * notional$;
    const fees$ = (cfg.fee_bps_round / 10_000) * notional$;
    const pnl$ = pnlBeforeFees$ - fees$;
    trades.push({
      dir: pos.dir,
      entryI: pos.entryI, entryP: pos.entryP, entryTs: times[pos.entryI],
      exitI, exitP, exitTs: times[exitI],
      grossRet, pnlBeforeFees$, fees$, pnl$,
      openDistBars: pos.openDistBars,
    });
    if ((cfg.capital_init ?? 0) > 0) capital += pnl$;
  }

  // stats
  let pnlSum = 0, maxDD = 0, eq = 0, wins = 0;
  const eqCurve: number[] = [];
  for (const t of trades) {
    pnlSum += t.pnl$;
    eq += t.pnl$;
    if (eq < maxDD) maxDD = eq;
    if (t.pnl$ > 0) wins++;
    eqCurve.push(eq);
  }
  const stats = {
    n: trades.length,
    win: wins,
    loss: trades.length - wins,
    winRate: trades.length ? +(wins * 100 / trades.length).toFixed(2) : 0,
    pnl$: +trunc2(pnlSum),
    maxDD$: +trunc2(maxDD),
    final_capital: (cfg.capital_init ?? 0) > 0 ? +trunc2(capital) : undefined,
  };

  return { trades, stats, equity: eqCurve };
}

// ======== CSV ========
function toCSV(symbol: string, trades: Trade[]) {
  const rows: (string|number)[][] = [
    ['symbol','dir','entry_idx','entry_at','entry_price','exit_idx','exit_at','exit_price','gross_ret_pct','pnl_before_fees$','fees$','pnl$','tagE21_idx','tagE21_at','tagBB_idx','tagBB_at','open_crossDist_bars']
  ];
  for (const t of trades) {
    rows.push([
      symbol,
      t.dir === 1 ? 'long' : 'short',
      t.entryI,
      t.entryTs ? new Date(t.entryTs).toISOString() : '',
      trunc2str(t.entryP),
      t.exitI,
      t.exitTs ? new Date(t.exitTs).toISOString() : '',
      trunc2str(t.exitP),
      trunc2str(t.grossRet * 100),
      trunc2str(t.pnlBeforeFees$),
      trunc2str(t.fees$),
      trunc2str(t.pnl$),
      t.tagE21I ?? '',
      t.tagE21Ts ? new Date(t.tagE21Ts).toISOString() : '',
      t.tagBBI ?? '',
      t.tagBBTs ? new Date(t.tagBBTs).toISOString() : '',
      (t.openDistBars != null ? trunc2str(t.openDistBars) : ''),
    ]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

// ======== Main ========
async function main() {
  const symbol = argVal('--symbol', 'ETH')!;
  const limit = +(argVal('--limit', '1200')!);
  const fee = +(argVal('--fee', '12')!);
  const lev = +(argVal('--lev', '5')!);
  const qty = +(argVal('--qty', '1')!);
  const slip = +(argVal('--slip', '0')!);
  const exec = (argVal('--exec', 'next')! as 'next'|'close');
  const side = (argVal('--side', 'both')! as 'both'|'long'|'short');
  const filter = (argVal('--filter', 'none')! as 'none'|'bb');
  const api = argVal('--api', 'http://localhost:3000/api/klines');
  const market = argVal('--market', 'spot')!;
  const exchange = (argVal('--exchange', 'auto')! as 'auto'|'binance'|'bybit'|'local');
  const outfile = argVal('--outfile', './bt.csv');
  // TP/SL/Trail
  const tpPct = +(argVal('--tp', '0')!);
  const slPct = +(argVal('--sl', '0')!);
  const trailPct = +(argVal('--trail', '0')!);
  // Trailing activation
  const trailArmPct = +(argVal('--trail_arm', '0')!);        // in %
  const trailArmPxRaw = argVal('--trail_arm_px');            // prezzo assoluto
  const trailArmPx = trailArmPxRaw != null ? +trailArmPxRaw : undefined;
  // Compounding
  const capInit = +(argVal('--cap', '0')!);
  const allocPct = +(argVal('--alloc', '100')!);

  if (VERBOSE) console.log('[bt] start fetch');
  const { closes, times, highs, lows } = await fetchSeries(symbol, limit, api, market, exchange);
  if (VERBOSE) console.log(`[bt] fetched: closes=${closes.length} hi/lo=${highs.length}/${lows.length}`);
  if (!closes.length) throw new Error('Nessun dato di close');

  const cfg: Config = {
    fee_bps_round: fee, leverage: lev, qty, slippage_bps: slip, exec, side, filter,
    tp_pct: tpPct, sl_pct: slPct, trail_pct: trailPct,
    trail_arm_pct: trailArmPct > 0 ? trailArmPct : undefined,
    trail_arm_price: (trailArmPx != null && isFinite(trailArmPx)) ? trailArmPx : undefined,
    capital_init: capInit > 0 ? capInit : undefined,
    alloc_pct: allocPct
  };
  const { trades, stats } = runBacktest(closes, times, highs, lows, cfg);

  const csv = toCSV(symbol, trades);
  const fname = outfile || `./bt_${symbol}_${Date.now()}.csv`;
  if (VERBOSE) console.log('[bt] writing CSV:', fname);
  fs.mkdirSync(path.dirname(fname), { recursive: true });
  fs.writeFileSync(fname, csv, 'utf8');

  console.log(`
=== ORIONE 1m BACKTEST — ${symbol} (${limit}m) ===`);
  console.log(`exchange=${exchange} market=${market} side=${side} filter=${filter} exec=${exec} lev=${lev} feeRT=${fee}bps slip=${slip}bps qty=${qty}`);
  console.log(`TP=${tpPct}% SL=${slPct}% TRAIL=${trailPct}%  |  trail_arm=${trailArmPct||0}%${trailArmPx?` actPx=${trailArmPx}`:''}  |  CAP=${capInit>0?capInit:0} alloc=${allocPct}%`);
  if (stats.final_capital != null) {
    const roi = (stats.final_capital - (capInit||0)) / Math.max(capInit||1,1) * 100;
    console.log(`Final capital: ${trunc2str(stats.final_capital)}$ (ROI ${trunc2str(roi)}%)`);
  }
  console.log(`trades=${stats.n} win%=${stats.winRate} pnl$=${trunc2str(stats.pnl$)} maxDD$=${trunc2str(stats.maxDD$)}`);
  console.log(`CSV: ${fname}`);
}

main().catch(err => { console.error(err); process.exit(1); });
