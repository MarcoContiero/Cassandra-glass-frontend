"use client";

import { useMemo, useState } from "react";

type Props = {
  symbol: string;          // es. "ETHUSDT"
  timeframe: string;       // es. "1h", "4h", "1d"
  width?: number;          // px
  height?: number;         // px
  className?: string;
};

export default function ChartPreview({
  symbol,
  timeframe,
  width = 1100,
  height = 420,
  className = "",
}: Props) {
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // NB: /api/chart è una route locale già nel tuo progetto
  const src = useMemo(() => {
    const params = new URLSearchParams({
      symbol,
      tf: timeframe,
      w: String(width),
      h: String(height),
      theme: "dark",
      // forziamo refresh quando l'utente clicca "Aggiorna"
      _: String(nonce),
    });
    return `/api/chart?${params.toString()}`;
  }, [symbol, timeframe, width, height, nonce]);

  if (!symbol || !timeframe) return null;

  return (
    <div className={`w-full rounded-2xl bg-zinc-900/70 border border-zinc-800 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-zinc-300">
          Grafico • <span className="font-semibold">{symbol}</span> — {timeframe}
        </div>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            onClick={() => setNonce((n) => n + 1)}
            title="Ricarica immagine"
          >
            Aggiorna
          </button>
          <a
            href={src}
            download={`${symbol}_${timeframe}.png`}
            className="px-2 py-1 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
          >
            Scarica PNG
          </a>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-red-400">Impossibile caricare il grafico: {error}</div>
      ) : (
        <img
          src={src}
          alt={`Chart ${symbol} ${timeframe}`}
          className="w-full rounded-xl"
          onError={() => setError("endpoint /api/chart non disponibile")}
        />
      )}
    </div>
  );
}
