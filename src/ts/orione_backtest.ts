// src/ts/orione_backtest.ts

export type Trade = {
    dir: 1 | -1;                 // +1 long, -1 short
    entryI: number; exitI: number;
    entryP: number; exitP: number;
    sizeEq$: number;             // equity usato per questo trade (prima delle fee)
    notional$: number;           // esposizione = sizeEq$ * leverage
    grossRet: number;            // (exit/entry - 1) * dir (senza leva)
    pnlBeforeFees$: number;      // notional$ * grossRet
    fees$: number;               // round-trip su notional
    pnl$: number;                // pnl netto
  };
  
  export type BacktestParams = {
    closes: number[];
    leverage?: number;           // default 5
    fee_bps_round?: number;      // taker in+out, es. 12 = 0.12% round-trip
    startEquity?: number;        // $ iniziali, default 100
    position_fraction?: number;  // frazione di equity per trade (default 1 = tutto)
    minBars?: number;            // default 50
    allowLiquidation?: boolean;  // default false (blocca a 0)
  };
  
  export type BacktestResult = {
    trades: Trade[];
    equityCurve: number[];       // per-bar, allineata a closes
    stats: {
      n: number; win: number; loss: number;
      winRate: number; avgTrade$: number;
      pnl$: number; maxDD$: number; retPct: number;
    };
  };
  
  function emaSeries(cl: number[], p: number): number[] {
    const out: number[] = new Array(cl.length).fill(NaN);
    if (cl.length === 0) return out;
    const k = 2 / (p + 1);
    let e = cl[0];
    out[0] = e;
    for (let i = 1; i < cl.length; i++) {
      e = cl[i] * k + e * (1 - k);
      out[i] = e;
    }
    return out;
  }
  
  export function backtestOrione(params: BacktestParams): BacktestResult {
    const L = params.leverage ?? 5;
    const FRT = (params.fee_bps_round ?? 12) / 10_000;   // round-trip %
    const startEq = params.startEquity ?? 100;
    const frac = Math.min(1, Math.max(0, params.position_fraction ?? 1));
    const minBars = params.minBars ?? 50;
    const allowLiq = params.allowLiquidation ?? false;
  
    const closes = params.closes.slice();
    if (closes.length < minBars) {
      return { trades: [], equityCurve: new Array(closes.length).fill(startEq), stats: {n:0,win:0,loss:0,winRate:0,avgTrade$:0,pnl$:0,maxDD$:0,retPct:0} };
    }
  
    const e9  = emaSeries(closes, 9);
    const e21 = emaSeries(closes, 21);
  
    const signal = (i: number) => {
      const a = e9[i], b = e21[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
      return a > b ? 1 : -1;     // sempre a mercato
    };
  
    // primo indice con ema definite
    let i = 0; while (i < closes.length && (!Number.isFinite(e9[i]) || !Number.isFinite(e21[i]))) i++;
  
    let curDir: 1 | -1 | 0 = 0;
    let entryI = -1;
    let entryP = 0;
  
    let eq = startEq;
    const eqCurve: number[] = [];
    const trades: Trade[] = [];
  
    // per DD
    let peak = startEq, maxDD = 0;
  
    for (; i < closes.length; i++) {
      const s = signal(i) as 1 | -1 | 0;
      if (s === 0) { eqCurve.push(eq); continue; }
  
      if (curDir === 0) {
        // apertura iniziale
        curDir = s; entryI = i; entryP = closes[i];
      } else if (s !== curDir) {
        // chiusura/flip sul cross opposto
        const exitI = i;
        const exitP = closes[i];
  
        // dimensionamento "reale": uso la quota corrente di equity per il trade
        const sizeEq$ = eq * frac;
        const notional$ = sizeEq$ * L;
  
        const grossRet = ((exitP / entryP) - 1) * curDir; // senza leva
        const pnlBeforeFees$ = notional$ * grossRet;
        const fees$ = notional$ * FRT;                    // fee round-trip sul notional
        let pnl$ = pnlBeforeFees$ - fees$;
  
        if (!allowLiq && eq + pnl$ < 0) pnl$ = -eq;       // evita equity negativa
  
        trades.push({
          dir: curDir as 1|-1, entryI, exitI, entryP, exitP,
          sizeEq$, notional$, grossRet, pnlBeforeFees$, fees$, pnl$
        });
  
        eq = Math.max(0, eq + pnl$);
        peak = Math.max(peak, eq);
        maxDD = Math.max(maxDD, peak - eq);
  
        // flip: nuova direzione
        curDir = s; entryI = i; entryP = closes[i];
      }
  
      eqCurve.push(eq);
    }
  
    // mark-to-market finale (non chiudiamo realmente)
    if (curDir !== 0 && entryI >= 0 && entryI < closes.length - 1) {
      const exitI = closes.length - 1;
      const exitP = closes[exitI];
      const sizeEq$ = eq * frac;
      const notional$ = sizeEq$ * L;
      const grossRet = ((exitP / entryP) - 1) * curDir;
      const pnlBeforeFees$ = notional$ * grossRet;
      // niente fee perché non eseguiamo il close
      const pnl$ = pnlBeforeFees$;
      eq = Math.max(0, eq + pnl$);
      eqCurve[eqCurve.length - 1] = eq;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, peak - eq);
    }
  
    const pnl$ = +(eq - startEq).toFixed(2);
    const win  = trades.filter(t => t.pnl$ > 0).length;
    const loss = trades.filter(t => t.pnl$ < 0).length;
    const n    = trades.length;
  
    return {
      trades,
      equityCurve: eqCurve,
      stats: {
        n, win, loss,
        winRate: n ? +(win / n * 100).toFixed(2) : 0,
        avgTrade$: n ? +((trades.reduce((a,t)=>a+t.pnl$,0)) / n).toFixed(2) : 0,
        pnl$,
        maxDD$: +maxDD.toFixed(2),
        retPct: +((eq/startEq - 1)*100).toFixed(2),
      }
    };
  }
  