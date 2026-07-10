'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { drawHeatmap, hitTestBucket, formatUsdCompact, type HeatmapPoint, type HeatmapBucket } from '@/lib/liquidationHeatmap';

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
  const heatmapBucketsRef = useRef<Map<string, HeatmapBucket>>(new Map());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: HeatmapBucket } | null>(null);

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

    // Liquidation heatmap — vedi cassandra-heatmap-liquidazione-spec.md.
    // Step 1 (canvas statico) + Step 2 (sync scroll/zoom) completi.
    //
    // Note dietro ai dettagli sotto (quattro bug reali trovati in produzione,
    // non ipotetici — ognuno rendeva la heatmap invisibile in modo diverso):
    // 1) canvas.getBoundingClientRect() invece di ref.current.clientWidth
    //    per dimensionare: misurare un ALTRO elemento in un istante scelto
    //    da noi può tornare una dimensione non ancora assestata.
    // 2) chart.timeScale().timeToCoordinate() torna null se il timestamp
    //    non corrisponde ESATTAMENTE a una barra esistente sulla serie (non
    //    interpola) — i punti vanno agganciati alla barra più vicina, vedi
    //    nearestBarTime in liquidationHeatmap.ts.
    // 3) z-index: un elemento posizionato senza z-index esplicito perde
    //    sempre contro un elemento con z-index esplicito, a prescindere
    //    dall'ordine nel DOM — Lightweight Charts assegna z-index ai propri
    //    canvas interni, il nostro va esplicitato (vedi JSX più sotto).
    // 4) sync scroll/zoom (Step 2): drawHeatmapLayer legge la scala CORRENTE
    //    ad ogni chiamata (timeToCoordinate/priceToCoordinate non sono
    //    memorizzati) — basta richiamarla ad ogni cambio di range visibile
    //    per restare sincronizzata, non serve ricalcolare il binning in un
    //    modo diverso. Coalescing su requestAnimationFrame perché l'evento
    //    di range può sparare più volte per frame durante un drag continuo.
    const drawHeatmapLayer = () => {
      const canvas = heatmapCanvasRef.current;
      if (!canvas || !ref.current) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!show.liquidationHeatmap || heatmapPoints.length === 0) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        heatmapBucketsRef.current = new Map();
        return;
      }
      const { buckets } = drawHeatmap(
        ctx, heatmapPoints, rect.width, rect.height,
        ohlcv.map(d => d.time),
        (timeSec) => chart.timeScale().timeToCoordinate(toTs(timeSec)),
        (price) => candles.priceToCoordinate(price),
      );
      heatmapBucketsRef.current = buckets;
    };
    // Disegno rimandato: chiamare timeToCoordinate/priceToCoordinate nello
    // stesso tick di fitContent() torna null per tutti i punti — il layout
    // interno della chart non è ancora pronto subito dopo la creazione/
    // fitContent. Verifichiamo direttamente che la conversione funzioni
    // davvero su un punto noto (l'ultima barra, sicuramente nel range
    // visibile dopo fitContent) prima di disegnare, riprovando per un
    // numero limitato di frame invece di indovinare un timing fisso.
    let cancelled = false;
    let rafId = 0;
    const lastBar = ohlcv[ohlcv.length - 1];
    const isChartReady = (): boolean => {
      if (!lastBar) return false;
      try {
        const x = chart.timeScale().timeToCoordinate(toTs(lastBar.time));
        const y = candles.priceToCoordinate(lastBar.close);
        return x !== null && y !== null;
      } catch {
        return false;
      }
    };
    const tryDraw = (attempt: number) => {
      if (cancelled) return;
      if (isChartReady() || attempt >= 30) {
        try {
          drawHeatmapLayer();
        } catch {
          // best-effort: un errore qui non deve rompere il resto del chart
        }
        return;
      }
      rafId = requestAnimationFrame(() => tryDraw(attempt + 1));
    };
    rafId = requestAnimationFrame(() => tryDraw(0));

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
      try {
        drawHeatmapLayer();
      } catch {
        // best-effort, vedi sopra
      }
    });
    ro.observe(ref.current);

    // Step 2 — sync scroll/zoom: ridisegna ad ogni cambio del range
    // visibile (pan, zoom, scroll orizzontale). Coalescing su rAF perché
    // l'evento può sparare più volte per frame durante un drag continuo —
    // un solo redraw per frame è più che sufficiente e molto più economico.
    let syncRafId = 0;
    const scheduleHeatmapRedraw = () => {
      if (syncRafId) return;
      syncRafId = requestAnimationFrame(() => {
        syncRafId = 0;
        try {
          drawHeatmapLayer();
        } catch {
          // best-effort, vedi sopra
        }
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleHeatmapRedraw);

    // Tooltip on-hover con la quantità stimata — il canvas ha pointerEvents
    // 'none' apposta (non deve mai bloccare crosshair/drag/zoom nativi del
    // chart), quindi il mousemove è agganciato al contenitore del chart
    // stesso: passa comunque attraverso il canvas trasparente agli eventi.
    const handleMouseMove = (e: MouseEvent) => {
      if (!show.liquidationHeatmap || !heatmapCanvasRef.current) {
        setTooltip(null);
        return;
      }
      const rect = heatmapCanvasRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const bucket = hitTestBucket(heatmapBucketsRef.current, px, py);
      setTooltip(bucket ? { x: px, y: py, bucket } : null);
    };
    const handleMouseLeave = () => setTooltip(null);
    ref.current.addEventListener('mousemove', handleMouseMove);
    ref.current.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      ref.current?.removeEventListener('mousemove', handleMouseMove);
      ref.current?.removeEventListener('mouseleave', handleMouseLeave);
      cancelled = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(syncRafId);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleHeatmapRedraw);
      ro.disconnect();
      chart.remove();
    };
  }, [ohlcv, show.volume, show.boxes, show.liquidationHeatmap, heatmapPoints, ema9d, ema21d, ema50d, ema200d, trendlines, srZones, boxData, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={ref} style={{ width: '100%', height, background: CT.void }} />
      <canvas
        ref={heatmapCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height, pointerEvents: 'none', zIndex: 10 }}
      />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: 'rgba(2,2,14,0.92)',
            border: `1px solid ${tooltip.bucket.side === 'long' ? CT.longBright : CT.shortBright}`,
            borderRadius: 4,
            padding: '4px 8px',
            fontFamily: CT.fontMono,
            fontSize: 11,
            color: CT.text,
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: tooltip.bucket.side === 'long' ? CT.longBright : CT.shortBright }}>
            {tooltip.bucket.side === 'long' ? 'Long liq' : 'Short liq'}
          </span>
          {' — '}{formatUsdCompact(tooltip.bucket.value_usd)}
          {' · '}{(tooltip.bucket.density * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
