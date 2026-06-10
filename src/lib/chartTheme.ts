// Cassandra chart design tokens — fonte unica per tutti i componenti grafici
export const CT = {
  // Backgrounds
  void:    '#02020e',
  deep:    '#06060f',
  surface: '#0a0a1e',

  // Gold
  gold:       '#c9a84c',
  goldBright: '#e8c96a',
  goldDim:    '#7a6030',

  // Cyan
  cyan:    '#0abfbc',
  cyanDim: '#066b69',

  // Directions
  long:       '#2d7a4f',
  longBright: '#3da866',
  short:      '#7a2d2d',
  shortBright:'#a83d3d',

  // Text
  text:      '#c8c8e8',
  textDim:   '#5a5a8a',
  textFaint: '#1a1a3a',

  // Grid / borders
  grid:         'rgba(26,26,58,0.8)',
  panelBorder:  'rgba(201,168,76,0.12)',
  crosshair:    'rgba(201,168,76,0.3)',

  // Fonts
  fontMono:  "'JetBrains Mono', monospace",
  fontSerif: "'Cinzel', serif",
} as const;

/** Candlestick colors */
export const candleTheme = {
  upColor:         CT.longBright,
  downColor:       CT.shortBright,
  borderUpColor:   CT.longBright,
  borderDownColor: CT.shortBright,
  wickUpColor:     CT.longBright,
  wickDownColor:   CT.shortBright,
} as const;

/** EMA color map */
export const emaColors: Record<number, { color: string; lineWidth: number }> = {
  9:   { color: CT.goldBright, lineWidth: 1.5 },
  21:  { color: CT.cyan,       lineWidth: 1.5 },
  50:  { color: '#9a6abf',     lineWidth: 1.5 },
  99:  { color: '#4a6abf',     lineWidth: 1   },
  200: { color: '#bf4a4a',     lineWidth: 2   },
};

/** Trendline style based on touches (maps active boolean to style) */
export function trendlineStyle(kind: 'up' | 'down', active: boolean) {
  return {
    color:     kind === 'up' ? CT.longBright : CT.shortBright,
    lineWidth: active ? 2 : 1,
    lineStyle: active ? 0 : 2,   // 0 = Solid, 2 = Dashed
  } as const;
}
