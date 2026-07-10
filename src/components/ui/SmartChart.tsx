'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type UTCTimestamp,
  type ISeriesApi,
  type LineWidth,
} from 'lightweight-charts';
import { CT, candleTheme, emaColors, trendlineStyle } from '@/lib/chartTheme';
import {
  computeEMA,
  findPivots,
  buildTrendlines,
  buildSRZones,
  type OHLCV,
} from '@/lib/chartCompute';
import { drawHeatmap, type HeatmapPoint } from '@/lib/liquidationHeatmap';

export interface ShowFlags {
  ema9: boolean; ema21: boolean; ema50: boolean; ema200: boolean;
  volume: boolean; trendlines: boolean; srZones: boolean; boxes: boolean;
  liquidationHeatmap: boolean;
}

export interface BoxLayer {
  top: number;
  bottom: number;
  active: boolean;
}

const toTs = (t: number) => t as UTCTimestamp;

export default function SmartChart({
  ohlcv,
  height = 420,
  show,
  minTouches = 2,
  boxData = [],
  heatmapPoints = [],
}: {
  ohlcv: OHLCV[];
  height?: number;
  show: ShowFlags;
  minTouches?: number;
  boxData?: BoxLayer[];
  heatmapPoints?: HeatmapPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);

  const ema9d   = useMemo(() => show.ema9   ? computeEMA(ohlcv, 9)   : [], [ohlcv, show.ema9]);
  const ema21d  = useMemo(() => show.ema21  ? computeEMA(ohlcv, 21)  : [], [ohlcv, show.ema21]);
  const ema50d  = useMemo(() => show.ema50  ? computeEMA(ohlcv, 50)  : [], [ohlcv, show.ema50]);
  const ema200d = useMemo(() => show.ema200 ? computeEMA(ohlcv, 200) : [], [ohlcv, show.ema200]);

  const pivots = useMemo(
    () => (show.trendlines || show.srZones) ? findPivots(ohlcv) : [],
    [ohlcv, show.trendlines, show.srZones],
  );

  const trendlines = useMemo(
    () => show.trendlines ? buildTrendlines(ohlcv, pivots, minTouches) : [],
    [ohlcv, pivots, show.trendlines, minTouches],
  );

  const srZones = useMemo(
    () => show.srZones ? buildSRZones(ohlcv, pivots) : [],
    [ohlcv, pivots, show.srZones],
  );

  useEffect(() => {
    if (!ref.current || ohlcv.length === 0) return;

    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: CT.void },
        textColor: CT.textDim,
        fontFamily: CT.fontMono,
      },
      grid: {
        vertLines: { color: CT.grid },
        horzLines: { color: CT.grid },
      },
      crosshair: {
        vertLine: { color: CT.crosshair, style: LineStyle.Dashed, width: 1 },
        horzLine: { color: CT.crosshair, style: LineStyle.Dashed, width: 1 },
      },
      rightPriceScale: { borderColor: CT.panelBorder },
      timeScale:       { borderColor: CT.panelBorder, secondsVisible: false },
    });

    // Candlestick
    const candles = chart.addSeries(CandlestickSeries, {
      priceLineVisible: true,
      ...candleTheme,
    }) as ISeriesApi<'Candlestick'>;
    candles.setData(ohlcv.map(d => ({
      time: toTs(d.time), open: d.open, high: d.high, low: d.low, close: d.close,
    })));

    // SR Zones as horizontal price lines
    for (const z of srZones) {
      const col = z.kind === 'support' ? CT.longBright : CT.shortBright;
      candles.createPriceLine({
        price: z.top, color: col, lineStyle: LineStyle.Dashed, lineWidth: 1,
        axisLabelVisible: false, title: '',
      });
      candles.createPriceLine({
        price: z.bottom, color: col, lineStyle: LineStyle.Dotted, lineWidth: 1,
        axisLabelVisible: false, title: '',
      });
    }

    // Boxes (ATR-based consolidation zones)
    if (show.boxes) {
      for (const box of boxData) {
        const colTop    = box.active ? CT.gold         : 'rgba(201,168,76,0.3)';
        const colBottom = box.active ? CT.goldDim      : 'rgba(201,168,76,0.18)';
        const wTop      = box.active ? 2 as LineWidth  : 1 as LineWidth;
        candles.createPriceLine({
          price: box.top, color: colTop, lineStyle: LineStyle.Solid, lineWidth: wTop,
          axisLabelVisible: box.active, title: box.active ? 'BOX' : '',
        });
        candles.createPriceLine({
          price: box.bottom, color: colBottom, lineStyle: LineStyle.Dashed, lineWidth: 1 as LineWidth,
          axisLabelVisible: false, title: '',
        });
      }
    }

    // Volume histogram
    if (show.volume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
      }) as ISeriesApi<'Histogram'>;
      volSeries.setData(ohlcv.map(d => ({
        time: toTs(d.time),
        value: d.volume ?? 0,
        color: (d.close >= d.open) ? 'rgba(45,122,79,0.25)' : 'rgba(122,45,45,0.25)',
      })));
      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        visible: false,
      });
    }

    // EMA lines
    const emaSeries: [number, typeof ema9d][] = [
      [9, ema9d], [21, ema21d], [50, ema50d], [200, ema200d],
    ];
    for (const [period, pts] of emaSeries) {
      if (!pts.length) continue;
      const style = emaColors[period];
      const s = chart.addSeries(LineSeries, {
        color: style.color,
        lineWidth: style.lineWidth as LineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }) as ISeriesApi<'Line'>;
      s.setData(pts.map(p => ({ time: toTs(p.time), value: p.value })));
    }

    // Trendlines
    for (const tl of trendlines) {
      const style = trendlineStyle(tl.kind, tl.active);
      const s = chart.addSeries(LineSeries, {
        color: style.color,
        lineWidth: style.lineWidth as LineWidth,
        lineStyle: style.lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }) as ISeriesApi<'Line'>;
      s.setData([
        { time: toTs(tl.x1), value: tl.y1 },
        { time: toTs(tl.x2), value: tl.y2 },
      ]);
    }

    chart.timeScale().fitContent();

    // Liquidation heatmap — Step 1 (statico, vedi cassandra-heatmap-liquidazione-spec.md):
    // disegnata una volta sulla scala corrente, NON risincronizzata su
    // pan/zoom del grafico (arriverà nello Step 2). Si ridisegna solo su
    // resize per non lasciare il canvas con dimensioni obsolete.
    const drawHeatmapLayer = () => {
      const canvas = heatmapCanvasRef.current;
      if (!canvas || !ref.current) return;
      const w = ref.current.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!show.liquidationHeatmap || heatmapPoints.length === 0) {
        ctx.clearRect(0, 0, w, height);
        return;
      }
      drawHeatmap(
        ctx, heatmapPoints, w, height,
        ohlcv.map(d => d.time),
        (timeSec) => chart.timeScale().timeToCoordinate(toTs(timeSec)),
        (price) => candles.priceToCoordinate(price),
      );
    };
    // Disegno rimandato: chiamare timeToCoordinate/priceToCoordinate nello
    // stesso tick di fitContent() torna null per tutti i punti — il layout
    // interno della chart non è ancora pronto subito dopo la creazione/
    // fitContent (gotcha noto di Lightweight Charts: toggle e disclaimer
    // funzionavano, ma zero celle disegnate — sintomo esatto di questo
    // problema, non di dati mancanti). Un singolo evento/rAF non è bastato
    // in produzione — invece di indovinare un timing, verifichiamo
    // direttamente che la conversione funzioni davvero su un punto noto
    // (l'ultima barra, sicuramente nel range visibile dopo fitContent)
    // prima di disegnare, riprovando per un numero limitato di frame.
    let cancelled = false;
    let rafId = 0;
    const lastBar = ohlcv[ohlcv.length - 1];
    const isChartReady = (): boolean => {
      if (!lastBar) return false;
      const x = chart.timeScale().timeToCoordinate(toTs(lastBar.time));
      const y = candles.priceToCoordinate(lastBar.close);
      return x !== null && y !== null;
    };
    const tryDraw = (attempt: number) => {
      if (cancelled) return;
      if (isChartReady() || attempt >= 30) {
        drawHeatmapLayer();
        return;
      }
      rafId = requestAnimationFrame(() => tryDraw(attempt + 1));
    };
    rafId = requestAnimationFrame(() => tryDraw(0));

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
      drawHeatmapLayer();
    });
    ro.observe(ref.current);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      chart.remove();
    };
  }, [ohlcv, show.volume, show.boxes, show.liquidationHeatmap, heatmapPoints, ema9d, ema21d, ema50d, ema200d, trendlines, srZones, boxData, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={ref} style={{ width: '100%', height, background: CT.void }} />
      <canvas
        ref={heatmapCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}
