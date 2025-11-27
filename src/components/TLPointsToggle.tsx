// src/components/TLPointsToggle.tsx
'use client';

import type { PointsFilter } from '@/lib/tlFilter';
import { PF_VALUES } from '@/lib/tlFilter';

type Props = {
  value: PointsFilter;
  onChange: (v: PointsFilter) => void;
  disabled?: boolean;
};

export default function TLPointsToggle({ value, onChange, disabled }: Props) {
  const base =
    'px-2 py-1 text-xs rounded-md border transition-all disabled:opacity-50 disabled:pointer-events-none';
  const onCls =
    'bg-white/10 border-green-400 text-green-400';
  const offCls =
    'bg-transparent border-white/20 text-white/80 hover:border-green-500 hover:text-green-400';

  const labels: Record<PointsFilter, string> = {
    '2+': '2 punti',
    '3': '3 punti',
    '>3': '>3 punti',
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Filtro trendline per numero tocchi">
      <span className="text-xs text-white/60">Filtra TL:</span>
      {PF_VALUES.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`${base} ${value === opt ? onCls : offCls}`}
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
          disabled={disabled}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}
