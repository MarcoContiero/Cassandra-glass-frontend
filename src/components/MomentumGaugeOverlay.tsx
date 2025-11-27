
'use client';
import { useMemo } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

export default function MomentumGaugeOverlay({ result }: { result: any }) {
  const trend_tf_score = (result?.trend_tf_score ?? result?.risposte?.trend_tf_score) || {};
  const toScore = (tf: string) => {
    const s = trend_tf_score[tf] || {};
    const L = Number(s.long ?? s.L ?? 0);
    const S = Number(s.short ?? s.S ?? 0);
    const tot = Math.max(1, Math.abs(L) + Math.abs(S));
    const idx = Math.round(((L - S) / tot) * 50 + 50); // 0..100
    return { tf, idx, L, S };
  };
  const tfs = Object.keys(trend_tf_score);
  const arr = tfs.map(toScore).sort((a, b) => (a.idx - b.idx));

  const overlayTitle = "🌡️ Termometro d’Impulso";

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Indicatore di momentum/impulso con riepilogo e dettagli per il simbolo corrente."
      className="max-w-xl w-[95vw] p-0 bg-zinc-900/95 text-white"
    >
      <DialogHeader className="sticky top-0 z-10 bg-zinc-900/95 p-4 border-b border-white/10">
        <DialogTitle className="text-xl">{overlayTitle}</DialogTitle>
      </DialogHeader>
      <div className="p-5 space-y-3">
        <p className="text-sm opacity-80">Indice 0..100 (0 = short puro, 50 = neutro, 100 = long puro). Ordinati per intensità.</p>
        <ul className="space-y-1 text-sm">
          {arr.map(row => (
            <li key={row.tf} className="flex items-center justify-between">
              <span className="opacity-80">{row.tf}</span>
              <span className="font-semibold">{row.idx}</span>
            </li>
          ))}
        </ul>
      </div>
    </SafeDialogContent>
  );
}
