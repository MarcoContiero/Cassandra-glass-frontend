//ChartWithTrendlines.tsx

'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts';

type OHLC = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Trendline = { x1: number; y1: number; x2: number; y2: number; kind: 'up' | 'down'; active: boolean };
type TrendlinesPayload = { uptrend: Trendline[]; downtrend: Trendline[] };

/** Ora il backend fornisce SECONDi: non dividere più per 1000 */
const toTs = (s: number) => Math.round(s) as UTCTimestamp;

export default function ChartWithTrendlines({
  data,
  height = 480,
}: {
  data: { ohlcv: OHLC[]; trendlines: TrendlinesPayload };
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const candleData = useMemo<CandlestickData<UTCTimestamp>[]>(() => {
    const rows = (data?.ohlcv ?? [])
      .filter(d => Number.isFinite(d.time) && Number.isFinite(d.open) && Number.isFinite(d.high) && Number.isFinite(d.low) && Number.isFinite(d.close))
      .map(d => ({
        time: toTs(d.time), // <-- seconds in, seconds out
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number)); // safety
    return rows;
  }, [data?.ohlcv]);

  const lines = useMemo(() => {
    const arr = [
      ...(data?.trendlines?.uptrend ?? []),
      ...(data?.trendlines?.downtrend ?? []),
    ];
    return arr.map(l => ({
      points: [
        { time: toTs(l.x1), value: l.y1 } as LineData<UTCTimestamp>,
        { time: toTs(l.x2), value: l.y2 } as LineData<UTCTimestamp>,
      ],
      kind: (l.kind === 'up' ? 'up' : 'down') as 'up' | 'down',
      active: !!l.active,
    }));
  }, [data?.trendlines]);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#e5e7eb' },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: true } },
      crosshair: { mode: 1 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      priceLineVisible: false,
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    }) as ISeriesApi<'Candlestick'>;

    candleSeries.setData(candleData);

    const lineSeries: ISeriesApi<'Line'>[] = [];
    for (const l of lines) {
      const s = chart.addSeries(LineSeries, {
        priceLineVisible: false,
        lineWidth: l.active ? 2 : 1,
        lineStyle: l.active ? LineStyle.Solid : LineStyle.Dotted,
        color: l.kind === 'up' ? (l.active ? '#26a69a' : '#7fbfba') : (l.active ? '#ef5350' : '#f29aa0'),
      }) as ISeriesApi<'Line'>;
      s.setData(l.points);
      lineSeries.push(s);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      lineSeries.forEach(s => chart.removeSeries(s));
      chart.removeSeries(candleSeries);
      chart.remove();
    };
  }, [candleData, lines, height]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
