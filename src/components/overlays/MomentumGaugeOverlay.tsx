'use client';

import * as React from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

type Bias = 'LONG' | 'SHORT' | 'NEUTRO';
type Gauge = { tf: string; score: number; bias: Bias; source: string };

function buildFromTrendScore(data: any): Gauge[] {
  const tfs: string[] = Array.isArray(data?.timeframes) ? data.timeframes : [];
  const m = data?.trend_tf_score ?? {};
  const keys = tfs.length ? tfs : Object.keys(m ?? {});
  const out: Gauge[] = [];
  for (const tf of keys) {
    const x = m?.[tf];
    if (!x) continue;
    const score = Number(x.score ?? 0) || 0;
    const b = String(x.bias ?? '').toUpperCase();
    const bias: Bias = b === 'LONG' ? 'LONG' : b === 'SHORT' ? 'SHORT' : 'NEUTRO';
    out.push({ tf, score, bias, source: 'trend_tf_score' });
  }
  return out;
}

function buildFromLiquidity(data: any): Gauge | null {
  const lw = data?.liquidity_summary?.weights;
  if (!lw) return null;
  const up = Number(lw.up);
  const down = Number(lw.down);
  if (!Number.isFinite(up) || !Number.isFinite(down)) return null;
  const delta = up - down;
  const bias: Bias = delta >= 0 ? 'LONG' : 'SHORT';
  const tf = (Array.isArray(data?.timeframes) && data.timeframes[0]) || '—';
  return { tf, score: Math.round(delta * 100) / 100, bias, source: 'liquidity_summary' };
}

export default function MomentumGaugeOverlay({
  title,
  data,
}: {
  title: string;
  data: any;
}) {
  // priorità: momentum diretto → trend_tf_score → liquidity_summary
  const gauges = React.useMemo<Gauge[]>(() => {
    const direct: any[] = Array.isArray(data?.momentum) ? data.momentum : [];
    if (direct.length) {
      return direct
        .map<Gauge>((x) => {
          const b = String(x.bias ?? '').toUpperCase();
          const bias: Bias = b === 'LONG' ? 'LONG' : b === 'SHORT' ? 'SHORT' : 'NEUTRO';
          return {
            tf: String(x.tf ?? x.timeframe ?? '—'),
            score: Number(x.score ?? 0) || 0,
            bias,
            source: 'momentum',
          };
        })
        .filter((g) => !!g.tf);
    }
    const fromTrend = buildFromTrendScore(data);
    if (fromTrend.length) return fromTrend;
    const one = buildFromLiquidity(data);
    return one ? [one] : [];
  }, [data]);

  const overlayTitle = String(title ?? "🌡️ Termometro d’Impulso");

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Indicatore di momentum/impulso per il simbolo corrente."
      className="max-w-2xl w-[96vw] p-0 bg-zinc-900/95 text-white"
    >
      <DialogHeader className="p-4 border-b border-white/10">
        <DialogTitle className="text-xl">{overlayTitle}</DialogTitle>
      </DialogHeader>
      <div className="p-4">
        {!gauges.length ? (
          <div className="text-white/70">Nessun dato momentum disponibile.</div>
        ) : (
          <div className="space-y-3">
            {gauges.map((g, i) => {
              const pct = Math.max(0, Math.min(100, Math.round(Math.abs(g.score))));
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-semibold">{g.tf}</div>
                    <div className="opacity-70">{g.source}</div>
                  </div>
                  <div className="h-3 w-full bg-white/10 rounded">
                    <div
                      className={`h-3 rounded ${g.bias === 'SHORT'
                        ? 'bg-red-500'
                        : g.bias === 'LONG'
                          ? 'bg-emerald-500'
                          : 'bg-zinc-400'
                        }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs opacity-80">
                    Bias: {g.bias} • Score: {g.score}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SafeDialogContent>
  );
}
