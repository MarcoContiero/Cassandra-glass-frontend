// src/lib/liquidityControls.ts
export type LiquidityScope = 'all' | 'filtered';
export type LiquiditySource = 'sr' | 'fvg' | 'swing' | 'round';

export interface LiquidityControls {
  bias?: boolean;       // attiva/li disattiva il bias di liquidità
  auto?: boolean;       // autotune dist_pct
  k?: number;           // “k” del bias
  n?: number;           // n zone per lato
  pct?: number;         // dist_pct manuale (se non dato -> auto)
  alpha?: number;       // alpha autotune
  mult?: number;        // mult autotune
  scope?: LiquidityScope;
  sources?: LiquiditySource[];

  /** NUOVO: forza minima per SR_RES / SR_SUP (filtra solo SR;
   * gli altri tipi restano invariati, come da logica BE) */
  levelsMinForza?: number;
}

export const DEFAULT_LIQ_CONTROLS: LiquidityControls = {
  bias: true,
  auto: true,
  k: 10,
  n: 10,
  alpha: 0.6,
  mult: 2.0,
  scope: 'all',
  sources: ['sr', 'fvg', 'swing', 'round'],
  levelsMinForza: 2, // default richiesto
};
