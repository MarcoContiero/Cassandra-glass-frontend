'use client';
import React from 'react';


const ALL_TF = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','3d','1w','1M'] as const;
const PRESET_DEFAULT = ['15m','1h','4h','1d'] as const;

export default function TfPicker({
  value,
  onChange,
  onApply,
}: {
  value: string[];
  onChange: (tfs: string[]) => void;
  onApply?: () => void;
}) {
  const toggle = (tf: string) => {
    const set = new Set(value);
    if (set.has(tf)) set.delete(tf);
    else set.add(tf);
    onChange(Array.from(set));
  };

  const setPreset = (p: readonly string[]) => onChange([...p]);

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-white/60">TF:</div>
      <div className="flex flex-wrap gap-1">
        {ALL_TF.map((tf) => (
          <button
            key={tf}
            className={`px-2 py-1 rounded-md border text-xs transition ${
              value.includes(tf)
                ? 'bg-white/10 border-white/40'
                : 'border-white/20 hover:border-white/40'
            }`}
            onClick={() => toggle(tf)}
          >
            {tf}
          </button>
        ))}
        <button
          className="px-2 py-1 rounded-md border border-white/20 hover:border-white/40 text-xs ml-2"
          onClick={() => setPreset(PRESET_DEFAULT)}
          title="Preset consigliato"
        >
          Preset
        </button>
      </div>
      <button
        onClick={onApply}
        className="btn h-8"
        title="Applica"
      >
        Applica
      </button>
    </div>
  );
}
