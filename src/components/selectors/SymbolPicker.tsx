'use client';
import React from 'react';

const MAP: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
  XRP: 'XRPUSDT',
};

function normalizeSymbol(input: string): string {
  const s = (input || '').trim().toUpperCase();
  if (!s) return 'BTCUSDT';
  if (s.endsWith('USDT')) return s;
  if (MAP[s]) return MAP[s];
  // fallback: appiccica USDT
  return `${s}USDT`;
}

export default function SymbolPicker({
  value,
  onChange,
  onRefresh,
}: {
  value: string;
  onChange: (v: string) => void;
  onRefresh?: () => void;
}) {
  const [raw, setRaw] = React.useState<string>(value.replace('USDT', ''));

  React.useEffect(() => {
    // tieni in sync quando cambia dall'esterno
    setRaw(value.replace('USDT', ''));
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-white/60">symbol:</div>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value.toUpperCase())}
        onBlur={() => onChange(normalizeSymbol(raw))}
        className="input w-28"
        placeholder="BTC / ETH / SOL"
      />
      <button
        onClick={() => { onChange(normalizeSymbol(raw)); onRefresh?.(); }}
        className="btn h-8 px-2"
        title="Aggiorna analisi"
      >
        🔄
      </button>
    </div>
  );
}
