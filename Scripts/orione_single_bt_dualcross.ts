/**
 * scripts/orione_single_bt_dualcross.ts
 *
 * Apertura SOLO quando si verificano **entrambi** i cross nella stessa direzione (EMA9↔EMA21 **e** EMA9↔SMA20),
 * non necessariamente nella stessa barra (configurabile via --open_window).
 * - Memorizza l'orario del **primo** cross (prima evidenza), l'orario del **secondo** cross (conferma),
 *   l'orario di **apertura** (in base a exec=next|close) e quello di **chiusura**.
 * - Chiusura: al verificarsi di **un solo** incrocio contrario (E21 OPPURE SMA20), oppure SL/TP/Trailing.
 * - Flip: se la chiusura è per incrocio contrario e nella stessa barra c'è anche un **segnale completo** opposto
 *   (entrambi i cross), allora chiude e **riapre** (flip). Se il segnale opposto è solo parziale, setta pending e attende.
 *
 * Sorgenti dati: Bybit / Binance / API locale (paginate)
 * Output: CSV + riga meta (versione + parametri usati)
 *
 * Esempio:
 *   node --loader ts-node/esm scripts/orione_single_bt_dualcross.ts --verbose \
 *     --exchange bybit --market perp --symbol ETH --limit 3000 \
 *     --open_window 0 --trail_arm 0.1 --trail_step 0.01 --sl 0.05 --tp 0.0 \
 *     --outfile ./bt_dualcross_bybit_perp_ETH.csv
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
  qty: number;           // size in coin
  slippage_bps: number;  // bps per lato
  exec: 'next' | 'close';
  side: 'both' | 'long' | 'short';
  // segnale
  open_window: number;   // n barre max tra i due cross (0 = stessa barra; -1 = senza limite)
  // risk mgmt
  sl_pct_price?: number;        // SL in % prezzo (es. 0.05 = 0.05%)
  tp_eq_pct?: number;           // TP in % equity (leva*move). Es 0.5 = +0.5% equity
  trail_arm_pct_price?: number; // attiva trailing a +X% prezzo (es 0.1)
  trail_step_pct_price?: number;// chiudi se drawdown da anchor ≥ Y% (es 0.01)
};

type Trade = {
  dir: Side;
  // segnali
  firstI: number; firstTs?: number; firstKind: 'E21'|'BB';
  secondI: number; secondTs?: number; secondKind: 'E21'|'BB';
  // esecuzione
  entryI: number; entryP: number; entryTs?: number;
  exitI: number;  exitP: number;  exitTs?: number;
  grossRet: number;
  pnlBeforeFees$: number; fees$: number; pnl$: number;
};

// ======== Math helpers ========
function emaArray(xs: number[], p: number): (number | undefined)[] {
  if (xs.length === 0) return [];
  const k = 2 / (p + 1);
  const out: (number | undefined)[] = new Array(xs.length).fill(undefined);
  if (xs.length < p) return out;
  let e = xs[p - 1];
  out[p - 1] = e;
  for (let i = p; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
function smaArray(xs: number[], p: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(xs.length).fill(undefined);
  if (xs.length < p) return out;
  let s = 0; for (let i = 0; i < p; i++) s += xs[i]; out[p - 1] = s / p;
  for (let i = p; i < xs.length; i++) { s += xs[i] - xs[i - p]; out[i] = s / p; }
  return out;
}
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
function crossIndices(a: (number|undefined)[], b: (number|undefined)[]): number[] {
  const idx: number[] = []; let prev: number | null = null;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]; const bi = b[i]; if (ai == null || bi == null) continue;
    const d = ai - bi; const s = sign(d); if (prev == null) { prev = s; continue; }
    if (s !== 0 && prev !== 0 && s !== prev) idx.push(i); prev = s;
  }
  return idx;
}

// ======== Backtest core ========
function runBacktest(closes: number[], times: number[], cfg: Config) {
  const ema9  = emaArray(closes, 9);
  const ema21 = emaArray(closes, 21);
  const sma20 = smaArray(closes, 20);

  const execOffset = cfg.exec === 'next' ? 1 : 0;
  const trades: Trade[] = [];

  type Pos = { dir: Side; entryI: number; entryP: number; trailActive?: boolean; trailAnchor?: number };
  let pos: Pos | null = null;

  // pending apertura dopo il primo dei due cross
  type Pending = { dir: Side; firstI: number; firstKind: 'E21'|'BB' };
  let pending: Pending | null = null;

  const windowCap = cfg.open_window; // 0 stessa barra, -1 illimitata

  const iStart = Math.max(21, execOffset);
  for (let i = iStart; i < closes.length - execOffset; i++) {
    const e9 = ema9[i]; const e21 = ema21[i]; const m20 = sma20[i];
    const e9p = ema9[i-1]; const e21p = ema21[i-1]; const m20p = sma20[i-1];
    if (e9 == null || e21 == null || m20 == null || e9p == null || e21p == null || m20p == null) continue;

    const crossUpE21 = (e9p <= e21p) && (e9 > e21);
    const crossDnE21 = (e9p >= e21p) && (e9 < e21);
    const crossUpBB  = (e9p <= m20p) && (e9 > m20);
    const crossDnBB  = (e9p >= m20p) && (e9 < m20);

    // determina cross di direzione
    const upAny = crossUpE21 || crossUpBB;
    const dnAny = crossDnE21 || crossDnBB;

    // === GESTIONE PENDING OPEN ===
    // se ho pending e ricevo conferma del secondo cross coerente → apri
    const confirmUp = pending && pending.dir === 1 && ((pending.firstKind === 'E21' && crossUpBB) || (pending.firstKind === 'BB' && crossUpE21));
    const confirmDn = pending && pending.dir === -1 && ((pending.firstKind === 'E21' && crossDnBB) || (pending.firstKind === 'BB' && crossDnE21));

    const withinWindow = (pending: Pending) => {
      if (windowCap < 0) return true; // illimitato
      return (i - pending.firstI) <= windowCap;
    };

    const execI = i + execOffset; if (execI >= closes.length) break;
    const px = closes[execI];

    const withSlip = (price: number, side: Side) => {
      if (cfg.slippage_bps <= 0) return price;
      const slip = price * (cfg.slippage_bps / 10_000);
      return side === 1 ? price + slip : price - slip;
    };

    // apertura se non ho posizione
    if (!pos) {
      // conferma pending
      if (pending && withinWindow(pending) && (confirmUp || confirmDn)) {
        const dir: Side = pending.dir;
        const ep = withSlip(px, dir);
        pos = { dir, entryI: execI, entryP: ep, trailActive: false };
        trades.push({
          dir,
          firstI: pending.firstI, firstTs: times[pending.firstI], firstKind: pending.firstKind,
          secondI: i, secondTs: times[i], secondKind: (confirmUp ? (pending.firstKind === 'E21' ? 'BB':'E21') : (pending.firstKind === 'E21' ? 'BB':'E21')),
          entryI: execI, entryP: ep, entryTs: times[execI],
          exitI: -1, exitP: 0, exitTs: undefined, // sarà riempito alla chiusura
          grossRet: 0, pnlBeforeFees$: 0, fees$: 0, pnl$: 0,
        });
        pending = null;
        continue;
      }
      // nessun pending → valuta primo cross della coppia
      if (upAny && (cfg.side === 'both' || cfg.side === 'long')) pending = { dir: 1, firstI: i, firstKind: crossUpE21 ? 'E21':'BB' };
      else if (dnAny && (cfg.side === 'both' || cfg.side === 'short')) pending = { dir: -1, firstI: i, firstKind: crossDnE21 ? 'E21':'BB' };
      continue;
    }

    // === POSIZIONE APERTA: trailing/SL/TP + chiusura per incrocio singolo ===
    // attiva/aggiorna trailing
    const armF  = (cfg.trail_arm_pct_price  ?? 0) / 100;
    const stepF = (cfg.trail_step_pct_price ?? 0) / 100;
    const slF   = (cfg.sl_pct_price         ?? 0) / 100;

    const moveFromEntry = (px / pos.entryP - 1) * pos.dir; // frazione
    if (!pos.trailActive && armF > 0 && moveFromEntry >= armF) { pos.trailActive = true; pos.trailAnchor = px; }
    if (pos.trailActive && pos.trailAnchor != null) {
      if (pos.dir === 1) { if (px > pos.trailAnchor) pos.trailAnchor = px; }
      else { if (px < pos.trailAnchor) pos.trailAnchor = px; }
    }

    let hitTrail = false;
    if (pos.trailActive && pos.trailAnchor != null && stepF > 0) {
      if (pos.dir === 1) { const dd = (pos.trailAnchor - px) / pos.trailAnchor; if (dd >= stepF) hitTrail = true; }
      else { const dd = (px - pos.trailAnchor) / pos.trailAnchor; if (dd >= stepF) hitTrail = true; }
    }

    const hitSL = slF > 0 ? (moveFromEntry <= -slF) : false;
    const hitTP = (cfg.tp_eq_pct ?? 0) > 0 ? ((moveFromEntry * cfg.leverage * 100) >= (cfg.tp_eq_pct as number)) : false;

    // chiusura per incrocio singolo contrario
    let exitOpp = false;
    if (pos.dir === 1) exitOpp = crossDnE21 || crossDnBB; else exitOpp = crossUpE21 || crossUpBB;

    if (exitOpp || hitTrail || hitSL || hitTP) {
      let exitP = px;
      if (cfg.slippage_bps > 0) { const s = exitP * (cfg.slippage_bps / 10_000); exitP = pos.dir === 1 ? exitP - s : exitP + s; }
      const grossRet = (exitP / pos.entryP - 1) * pos.dir;
      const notional$ = cfg.qty * pos.entryP * cfg.leverage;
      const pnlBeforeFees$ = notional$ * grossRet;
      const fees$ = notional$ * (cfg.fee_bps_round / 10_000);
      const pnl$ = pnlBeforeFees$ - fees$;

      // completa l'ultima trade aperta (l'ultima in trades deve essere quella aperta)
      for (let k = trades.length - 1; k >= 0; k--) {
        const t = trades[k];
        if (t.exitI === -1) { t.exitI = execI; t.exitTs = times[execI]; t.exitP = exitP; t.grossRet = grossRet; t.pnlBeforeFees$ = pnlBeforeFees$; t.fees$ = fees$; t.pnl$ = pnl$; break; }
      }

      // Flip solo se l'uscita è per incrocio opposto e in questa stessa barra c'è SEGNALE COMPLETO opposto
      let flipped = false;
      if (exitOpp) {
        // costruisci nuovo pending per direzione opposta e vedi se nella stessa barra c'è conferma completa
        const newDir: Side = pos.dir === 1 ? -1 : 1;
        const firstKind = (newDir === 1 ? (crossUpE21 ? 'E21' : 'BB') : (crossDnE21 ? 'E21' : 'BB')) as 'E21'|'BB';
        const hasFirst = newDir === 1 ? upAny : dnAny;
        const hasSecond = newDir === 1 ? ((firstKind === 'E21') ? crossUpBB : crossUpE21) : ((firstKind === 'E21') ? crossDnBB : crossDnE21);
        if (hasFirst && hasSecond) {
          // flip immediato
          const dir: Side = newDir; const ep = withSlip(px, dir);
          pos = { dir, entryI: execI, entryP: ep, trailActive: false };
          trades.push({ dir, firstI: i, firstTs: times[i], firstKind, secondI: i, secondTs: times[i], secondKind: (firstKind==='E21'?'BB':'E21'), entryI: execI, entryP: ep, entryTs: times[execI], exitI: -1, exitP: 0, grossRet:0, pnlBeforeFees$:0, fees$:0, pnl$:0 });
          flipped = true;
        } else if (hasFirst) {
          // set pending e attendi conferma successiva
          pending = { dir: newDir, firstI: i, firstKind };
          pos = null;
        } else {
          pos = null;
        }
      } else {
        pos = null;
      }

      if (!flipped) continue; else continue;
    }

    // se nel frattempo si verifica un cross singolo opposto (senza chiusura per SL/TP/Trail) non si fa nulla finché non scatta exitOpp
  }

  // chiusura forzata a fine serie
  if (pos) {
    const exitI = closes.length - 1; let exitP = closes[exitI];
    if (cfg.slippage_bps > 0) { const s = exitP * (cfg.slippage_bps / 10_000); exitP = pos.dir === 1 ? exitP - s : exitP + s; }
    const grossRet = (exitP / pos.entryP - 1) * pos.dir; const notional$ = cfg.qty * pos.entryP * cfg.leverage;
    const pnlBeforeFees$ = notional$ * grossRet; const fees$ = notional$ * (cfg.fee_bps_round / 10_000); const pnl$ = pnlBeforeFees$ - fees$;
    for (let k = trades.length - 1; k >= 0; k--) { const t = trades[k]; if (t.exitI === -1) { t.exitI = exitI; t.exitTs = times[exitI]; t.exitP = exitP; t.grossRet = grossRet; t.pnlBeforeFees$ = pnlBeforeFees$; t.fees$ = fees$; t.pnl$ = pnl$; break; } }
  }

  // stats
  let pnlSum = 0, maxDD = 0, eq = 0, wins = 0; const eqCurve: number[] = [];
  for (const t of trades) { pnlSum += t.pnl$; eq += t.pnl$; if (eq < maxDD) maxDD = eq; if (t.pnl$ > 0) wins++; eqCurve.push(eq); }
  const stats = { n: trades.length, win: wins, loss: trades.length - wins, winRate: trades.length ? +(wins * 100 / trades.length).toFixed(2) : 0, pnl$: +pnlSum.toFixed(6), maxDD$: +maxDD.toFixed(6) };
  return { trades, stats, equity: eqCurve };
}

// ======== Data fetch ========
function fetchWithTimeout(url: string, opts: any = {}, ms = 15000) { const ac = new AbortController(); const id = setTimeout(() => ac.abort(), ms); return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(id)); }
function writeFileEnsured(filePath: string, content: string) { const dir = path.dirname(filePath); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(filePath, content, 'utf8'); }

async function fetchSeries(symbol: string, limit: number, api?: string, market: string = 'spot', exchange: 'auto'|'binance'|'bybit'|'local' = 'auto') {
  symbol = symbol.toUpperCase(); let closes: number[] = [], times: number[] = [];
  const tryLocal = async () => { const u = `${api}?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${limit}&market=${market}`; if (VERBOSE) console.log('[fetch] local', u); const r = await fetchWithTimeout(u, { cache: 'no-store' as any }, 15000); if (!r.ok) throw new Error(`local api status ${r.status}`); const j = await r.json(); closes = Array.isArray(j.closes) ? j.closes : []; times  = Array.isArray(j.times)  ? j.times  : []; };
  const tryBinance = async () => { const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT'; const base = 'https://api.binance.com/api/v3/klines'; const want = limit; let collected: any[] = []; let endTime: number | undefined = undefined; while (collected.length < want) { const batch = Math.min(1000, want - collected.length); const qs = new URLSearchParams({ symbol: sym, interval: '1m', limit: String(batch), ...(endTime ? { endTime: String(endTime) } : {}) }); const url = `${base}?${qs}`; if (VERBOSE) console.log('[fetch] binance', url); const r = await fetchWithTimeout(url, {}, 15000); if (!r.ok) throw new Error(`binance status ${r.status}`); const j: any[] = await r.json(); if (!Array.isArray(j) || j.length === 0) break; collected = j.concat(collected); endTime = j[0][0] - 1; } const slice = collected.slice(-want); times = slice.map(row => row[0]); closes = slice.map(row => +row[4]); };
  const tryBybit = async () => { const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT'; const category = (market?.toLowerCase() === 'spot') ? 'spot' : 'linear'; const base = 'https://api.bybit.com/v5/market/kline'; const want = limit; let end: number | undefined = undefined; let collected: any[] = []; while (collected.length < want) { const batch = Math.min(200, want - collected.length); const qs = new URLSearchParams({ category, symbol: sym, interval: '1', limit: String(batch), ...(end ? { end: String(end) } : {}) }); const url = `${base}?${qs}`; if (VERBOSE) console.log('[fetch] bybit', url); const r = await fetchWithTimeout(url, {}, 15000); if (!r.ok) throw new Error(`bybit status ${r.status}`); const j: any = await r.json(); const list: any[] = j?.result?.list ?? []; if (!Array.isArray(list) || list.length === 0) break; collected = collected.concat(list); let minStart = +list[0][0]; for (const row of list) if (+row[0] < minStart) minStart = +row[0]; end = minStart - 1; } collected.sort((a, b) => (+a[0]) - (+b[0])); const slice = collected.slice(-want); times  = slice.map(r => +r[0]); closes = slice.map(r => +r[4]); };
  if (exchange === 'bybit') await tryBybit(); else if (exchange === 'binance') await tryBinance(); else if (exchange === 'local' || (api && api.length > 0)) { try { await tryLocal(); } catch (e) { if (VERBOSE) console.warn('[fetch] local failed, fallback binance:', (e as any)?.message || e); await tryBinance(); } } else { await tryBinance(); }
  const n = Math.min(closes.length, times.length); return { closes: closes.slice(0, n), times: times.slice(0, n) };
}

// ======== CSV ========
function toCSV(symbol: string, trades: Trade[]) {
  const rows: (string|number)[][] = [[
    'symbol','dir',
    'first_idx','first_at','first_kind',
    'second_idx','second_at','second_kind',
    'entry_idx','entry_at','entry_price',
    'exit_idx','exit_at','exit_price',
    'gross_ret_pct','pnl_before_fees$','fees$','pnl$'
  ]];
  for (const t of trades) {
    rows.push([
      symbol,
      t.dir === 1 ? 'long' : 'short',
      t.firstI,
      t.firstTs ? new Date(t.firstTs).toISOString() : '',
      t.firstKind,
      t.secondI,
      t.secondTs ? new Date(t.secondTs).toISOString() : '',
      t.secondKind,
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
    ]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

// ======== Main ========
async function main() {
  const symbol   = argVal('--symbol', 'ETH')!;
  const limit    = +(argVal('--limit', '1200')!);
  const fee      = +(argVal('--fee', '12')!);
  const lev      = +(argVal('--lev', '5')!);
  const qty      = +(argVal('--qty', '1')!);
  const slip     = +(argVal('--slip', '0')!);
  const exec     = (argVal('--exec', 'next')! as 'next'|'close');
  const side     = (argVal('--side', 'both')! as 'both'|'long'|'short');
  const api      = argVal('--api', 'http://localhost:3000/api/klines');
  const market   = argVal('--market', 'spot')!;
  const exchange = (argVal('--exchange', 'auto')! as 'auto'|'binance'|'bybit'|'local');
  const openWin  = +(argVal('--open_window', '0')!); // 0=same bar; -1=illimitato
  // risk switches
  const sl       = +(argVal('--sl', '0.05')!);     // % prezzo
  const tp       = +(argVal('--tp', '0')!);        // % equity
  const tArm     = +(argVal('--trail_arm', '0')!); // % prezzo
  const tStep    = +(argVal('--trail_step', '0')!);// % prezzo
  const outfile  = argVal('--outfile', './bt.csv');

  if (VERBOSE) console.log('[bt] start fetch');
  const { closes, times } = await fetchSeries(symbol, limit, api, market, exchange);
  if (VERBOSE) console.log(`[bt] fetched: closes=${closes.length} times=${times.length}`);
  if (!closes.length) throw new Error('Nessun dato di close');

  const cfg: Config = {
    fee_bps_round: fee, leverage: lev, qty, slippage_bps: slip, exec, side,
    open_window: openWin,
    sl_pct_price: sl, tp_eq_pct: tp,
    trail_arm_pct_price: tArm, trail_step_pct_price: tStep,
  };

  const { trades, stats } = runBacktest(closes, times, cfg);

  const meta = [
    '# orione_single_bt v1.2-dualcross',
    `# exchange=${exchange} market=${market} symbol=${symbol} limit=${limit}`,
    `# exec=${exec} side=${side} lev=${lev} feeRTbps=${fee} slipbps=${slip}`,
    `# open_window=${openWin} sl%=${sl} tp_eq%=${tp} trail_arm%=${tArm} trail_step%=${tStep}`,
  ].join('\n') + '\n';

  const csv = meta + toCSV(symbol, trades);
  const fname = outfile || `./bt_${symbol}_${Date.now()}.csv`;
  if (VERBOSE) console.log('[bt] writing CSV:', fname);
  writeFileEnsured(fname, csv);

  console.log(`\n=== ORIONE 1m BACKTEST — ${symbol} (${limit}m) ===`);
  console.log(`exchange=${exchange} market=${market} side=${side} exec=${exec} lev=${lev} feeRT=${fee}bps slip=${slip}bps qty=${qty}`);
  console.log(`open_window=${openWin} sl=${sl}% tp_eq=${tp}% trail_arm=${tArm}% trail_step=${tStep}%`);
  console.log(`trades=${stats.n} win%=${stats.winRate} pnl$=${stats.pnl$} maxDD$=${stats.maxDD$}`);
  console.log(`CSV: ${fname}`);
}

main().catch(err => { console.error(err); process.exit(1); });
