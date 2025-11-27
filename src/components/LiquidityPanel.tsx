'use client';

import React, { useMemo, useState } from "react";
import LiquidityOverlay from "./LiquidityOverlay";
import { DEFAULT_LIQ_CONTROLS, LiquidityControls } from "../lib/liquidityControls";
import { fetchAnalisiLight } from "../lib/analisiLight";

export function LiquidityPanel() {
  const [coin, setCoin] = useState("BTCUSDT");
  const [timeframes, setTimeframes] = useState<string[]>(["15m", "1h", "4h", "1d"]);
  const [ctrl, setCtrl] = useState<LiquidityControls>(DEFAULT_LIQ_CONTROLS);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await fetchAnalisiLight(coin, timeframes, ctrl)); }
    finally { setLoading(false); }
  };

  const liq = useMemo(() => (data?.liquidity ?? null), [data]);

  return (
    <div className="space-y-4">
      {/* riga comandi base */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border px-2 py-1 rounded"
          value={coin}
          onChange={e => setCoin(e.target.value)}
        />
        <button className="px-3 py-1 rounded bg-black text-white" onClick={load} disabled={loading}>
          {loading ? "..." : "Aggiorna"}
        </button>

        {/* forza minima rapida anche qui */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm opacity-70">Forza minima SR:</span>
          <input
            type="range" min={0} max={13} step={1}
            value={ctrl.levelsMinForza ?? 0}
            onChange={e => setCtrl(c => ({ ...c, levelsMinForza: Number(e.target.value) }))}
          />
          <div className="w-8 text-center tabular-nums">{ctrl.levelsMinForza}</div>
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white"
            onClick={load}
            disabled={loading}
          >
            Applica
          </button>
        </div>
      </div>

      {/* debug sintetico */}
      {data && (
        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
          {JSON.stringify({
            prezzo: data.prezzo,
            longshort: data.longshort,
            liquidity_summary: data.liquidity_summary,
            ui_params: (data.diagnostica || {}).ui_params,
            filtro_forza: ctrl.levelsMinForza
          }, null, 2)}
        </pre>
      )}

      <div>
        <button
          className="px-3 py-1.5 rounded bg-white border border-gray-300 shadow-sm hover:bg-gray-50"
          onClick={() => setShow(true)}
          disabled={!liq}
        >
          Apri livelli di liquidità
        </button>
      </div>

      {show && (
        <LiquidityOverlay
          liquidity={liq}
          minForza={ctrl.levelsMinForza ?? 0}
          onChangeMinForza={(v) => setCtrl(c => ({ ...c, levelsMinForza: v }))}
          onRefresh={load}
          onClose={() => setShow(false)}
        />
      )}
    </div>
  );
}

export default LiquidityPanel;
