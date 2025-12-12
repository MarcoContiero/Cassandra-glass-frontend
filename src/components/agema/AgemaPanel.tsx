'use client';

import React, { useEffect, useState } from 'react';

type Direzione = 'LONG' | 'SHORT';

export interface AgemaRow {
  symbol: string;              // es. LINKUSDT
  coin: string;                // es. LINK
  prezzo: number;
  punteggio: number;           // score totale Agema
  faseCiclica: string;         // es. "mid_down", "zona re-entry"
  zonaReentry: string;         // es. "13–14"
  tpSintetico?: string;        // es. "TP ~14.2" o "TP1 13.9 / TP2 14.24"
  tempoCiclico?: string;       // es. "re-entry 22–51h"
  direzione: Direzione;        // LONG o SHORT prevalente
  bestEntryDistance?: string;  // es. "0.02 dal best setup"
  bestEntryPrice?: number;     // entry Strategia AI più vicina
  bestEntryTf?: string;        // es. "1h breve"
  bestEntryScore?: number;     // es. 9
}

interface AgemaResponse {
  updated_at: string;
  threshold: number;
  rows: AgemaRow[];
}

export default function AgemaPanel() {
  const [data, setData] = useState<AgemaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchAgema() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/agema', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} – ${txt || 'errore sconosciuto'}`);
      }
      const json = (await res.json()) as AgemaResponse;
      setData(json);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAgema();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Agema</h2>
          <p className="text-sm text-zinc-400">
            Classifica delle coin attualmente più interessanti secondo Cassandra
            (ciclica + Strategia AI).
          </p>
          {data?.updated_at && (
            <p className="mt-1 text-xs text-zinc-500">
              Ultimo aggiornamento: {data.updated_at}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgema}
            className="px-3 py-1 rounded-lg border border-white/10 text-xs bg-white/5 hover:bg-white/10"
          >
            Aggiorna
          </button>
          {data && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10">
              Mostra solo punteggio &gt;= {data.threshold}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
          Caricamento classifica…
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          Errore nel caricamento di Agema: {error}
        </div>
      )}

      {/* Tabella */}
      {data && data.rows.length > 0 && (
        <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/40">
          <table className="w-full text-xs md:text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-black/70 backdrop-blur">
              <tr className="text-zinc-300">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Coin</th>
                <th className="px-3 py-2 text-right font-medium">Prezzo</th>
                <th className="px-3 py-2 text-center font-medium">Score</th>
                <th className="px-3 py-2 text-left font-medium">Fase ciclica</th>
                <th className="px-3 py-2 text-left font-medium">Zona re-entry</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">
                  TP / Roadmap
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Strategia AI (best)
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => {
                const isLong = row.direzione === 'LONG';
                const dirLabel = isLong ? 'LONG' : 'SHORT';
                const dirColor = isLong ? 'text-emerald-300' : 'text-red-300';
                const dirBg = isLong ? 'bg-emerald-500/10' : 'bg-red-500/10';
                return (
                  <tr
                    key={row.symbol}
                    className="border-t border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-3 py-2 text-zinc-500 align-top">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col">
                        <span className="font-semibold tracking-tight">
                          {row.coin}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {row.symbol}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-top font-mono tabular-nums">
                      {row.prezzo.toLocaleString('it-IT', {
                        maximumFractionDigits: 6,
                      })}
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-semibold ${dirBg} ${dirColor}`}
                      >
                        {dirLabel} · {row.punteggio}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">{row.faseCiclica}</span>
                        {row.tempoCiclico && (
                          <span className="text-[11px] text-zinc-500">
                            {row.tempoCiclico}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-xs">{row.zonaReentry}</span>
                    </td>
                    <td className="px-3 py-2 align-top hidden md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        {row.tpSintetico && (
                          <span className="text-xs">{row.tpSintetico}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.bestEntryPrice ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs">
                            Entry {row.bestEntryPrice.toLocaleString('it-IT', {
                              maximumFractionDigits: 6,
                            })}{' '}
                            ({row.bestEntryDistance})
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {row.bestEntryTf} · score {row.bestEntryScore}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-500">
                          Nessuna entry forte vicino al prezzo.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && data && data.rows.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
          Nessuna coin supera la soglia attuale di Agema.
        </div>
      )}
    </div>
  );
}