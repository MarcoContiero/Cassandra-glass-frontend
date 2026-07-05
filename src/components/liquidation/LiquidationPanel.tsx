'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type ExchangeOI = { oi_usd: number; price: number };

type OIData = {
  coin: string;
  exchanges: Record<string, ExchangeOI>;
  total_oi_usd: number;
  price: number | null;
  ls_ratio: number | null;
  long_pct: number | null;
  short_pct: number | null;
};

type Liquidation = {
  ts_ms: number;
  type: 'long' | 'short' | '?';
  size: number;
  price: number;
  value_usd: number;
};

type LiqData = {
  coin: string;
  liquidations: Liquidation[];
  source: string;
  error?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const EXCHANGE_LABELS: Record<string, string> = {
  bybit: 'Bybit',
  hyperliquid: 'Hyperliquid',
  binance: 'Binance',
  okx: 'OKX',
};

const EXCHANGE_COLORS: Record<string, string> = {
  bybit:       '#E8AC30',
  hyperliquid: '#7B5CF5',
  binance:     '#F0B90B',
  okx:         '#3B7FE8',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  if (v >= 1) return v.toLocaleString('it-IT', { maximumFractionDigits: 3 });
  return v.toFixed(6);
}

function lsLabel(ratio: number | null): string {
  if (ratio == null) return '—';
  if (ratio > 1.15) return 'rialzista';
  if (ratio < 0.87) return 'ribassista';
  return 'neutro';
}

function lsColor(ratio: number | null): string {
  if (ratio == null) return 'var(--color-text-dim)';
  if (ratio > 1.15) return 'var(--color-long-bright, #4a9)';
  if (ratio < 0.87) return 'var(--color-short-bright, #a44)';
  return 'var(--color-text-dim)';
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const monoSm: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--color-text)',
};

const labelSt: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.3em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-dim)',
};

const cardSt: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  padding: '14px',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function OISection({ data }: { data: OIData | null }) {
  const exchanges = data ? Object.entries(data.exchanges) : [];
  const maxOI = exchanges.reduce((m, [, v]) => Math.max(m, v.oi_usd), 1);

  return (
    <div style={cardSt}>
      <div style={{ ...labelSt, marginBottom: '12px' }}>Open Interest</div>
      {!data ? (
        <div style={{ ...monoSm, color: 'var(--color-text-dim)', opacity: 0.5 }}>Caricamento…</div>
      ) : exchanges.length === 0 ? (
        <div style={{ ...monoSm, color: 'var(--color-text-dim)', opacity: 0.5 }}>Nessun dato disponibile</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {exchanges.map(([ex, v]) => {
            const pct = (v.oi_usd / maxOI) * 100;
            const color = EXCHANGE_COLORS[ex] || '#888';
            return (
              <div key={ex}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ ...monoSm, color: 'var(--color-text-dim)' }}>{EXCHANGE_LABELS[ex] || ex}</span>
                  <span style={{ ...monoSm, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(v.oi_usd)}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--color-void)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 400ms ease' }} />
                </div>
              </div>
            );
          })}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '4px',
          }}>
            <span style={{ ...labelSt }}>Totale</span>
            <span style={{ ...monoSm, color: 'var(--color-gold)', fontWeight: 600, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
              {fmtUSD(data.total_oi_usd)}
            </span>
          </div>
          {data.price && (
            <div style={{ ...monoSm, color: 'var(--color-text-dim)', fontSize: '9px', marginTop: '2px' }}>
              Prezzo Bybit: ${fmtPrice(data.price)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LSRatioSection({ data }: { data: OIData | null }) {
  const long = data?.long_pct ?? null;
  const short = data?.short_pct ?? null;
  const ratio = data?.ls_ratio ?? null;

  return (
    <div style={cardSt}>
      <div style={{ ...labelSt, marginBottom: '12px' }}>Long / Short Ratio</div>
      {!data || long == null ? (
        <div style={{ ...monoSm, color: 'var(--color-text-dim)', opacity: 0.5 }}>Caricamento…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Barra bicolore */}
          <div style={{ height: '8px', display: 'flex', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${long}%`, background: 'var(--color-long-bright, #2EB87A)', transition: 'width 400ms ease' }} />
            <div style={{ flex: 1, background: 'var(--color-short-bright, #a44)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ ...monoSm, color: 'var(--color-long-bright, #2EB87A)', fontVariantNumeric: 'tabular-nums' }}>
                {long?.toFixed(1)}% Long
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
              <span style={{ ...monoSm, color: 'var(--color-short-bright, #a44)', fontVariantNumeric: 'tabular-nums' }}>
                {short?.toFixed(1)}% Short
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid var(--color-border)', paddingTop: '8px',
          }}>
            <span style={labelSt}>Ratio L/S</span>
            <span style={{ ...monoSm, color: lsColor(ratio), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {ratio?.toFixed(3)} · {lsLabel(ratio)}
            </span>
          </div>
          <div style={{ ...monoSm, fontSize: '8px', color: 'rgba(255,255,255,0.2)', lineHeight: 1.4 }}>
            Fonte: Bybit · Account ratio 1h
          </div>
        </div>
      )}
    </div>
  );
}

function LiqFeed({ data, loading }: { data: LiqData | null; loading: boolean }) {
  const liqs = data?.liquidations ?? [];

  return (
    <div style={{ ...cardSt, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
      <div style={{ ...labelSt, padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        Liquidazioni recenti
        <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: '8px', fontSize: '8px', letterSpacing: '0.1em' }}>
          {loading ? '…' : `${liqs.length} eventi`}
        </span>
      </div>

      {liqs.length === 0 && !loading ? (
        <div style={{ padding: '14px', ...monoSm, color: 'var(--color-text-dim)', opacity: 0.5 }}>
          {data?.error ? `Errore: ${data.error}` : 'Nessuna liquidazione recente'}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Ora', 'Tipo', 'Quantità', 'Prezzo', 'Valore'].map(h => (
                  <th key={h} style={{ ...labelSt, padding: '5px 8px', textAlign: 'left', fontWeight: 400, letterSpacing: '0.15em', fontSize: '8px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liqs.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(201,168,76,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                  <td style={{ ...monoSm, padding: '4px 8px', color: 'var(--color-text-dim)', whiteSpace: 'nowrap', fontSize: '9px', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTime(l.ts_ms)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <span style={{
                      ...monoSm, fontSize: '9px', fontWeight: 600,
                      color: l.type === 'long' ? 'var(--color-short-bright, #a44)' : l.type === 'short' ? 'var(--color-long-bright, #2EB87A)' : 'var(--color-text-dim)',
                    }}>
                      {l.type === 'long' ? 'Long liq' : l.type === 'short' ? 'Short liq' : '?'}
                    </span>
                  </td>
                  <td style={{ ...monoSm, padding: '4px 8px', color: 'var(--color-text-dim)', fontSize: '9px', fontVariantNumeric: 'tabular-nums' }}>
                    {l.size.toFixed(3)}
                  </td>
                  <td style={{ ...monoSm, padding: '4px 8px', color: 'var(--color-text)', fontSize: '9px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    ${fmtPrice(l.price)}
                  </td>
                  <td style={{ ...monoSm, padding: '4px 8px', fontSize: '9px', fontVariantNumeric: 'tabular-nums',
                    color: l.value_usd >= 500_000 ? 'var(--color-gold)' : l.value_usd >= 100_000 ? 'var(--color-text)' : 'var(--color-text-dim)',
                  }}>
                    {fmtUSD(l.value_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const COINS_DEFAULT = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI', 'APT', 'INJ', 'HYPE'];

export default function LiquidationPanel() {
  const [coin, setCoin] = useState('BTC');
  const [oiData, setOIData] = useState<OIData | null>(null);
  const [liqData, setLiqData] = useState<LiqData | null>(null);
  const [liqLoading, setLiqLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const oiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liqTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOI = useCallback(async (c: string) => {
    try {
      const r = await fetch(`/api/oi/data?coin=${c}`);
      if (r.ok) {
        setOIData(await r.json());
        setLastUpdate(new Date());
      }
    } catch { /* ignore */ }
  }, []);

  const fetchLiq = useCallback(async (c: string) => {
    setLiqLoading(true);
    try {
      const r = await fetch(`/api/oi/liquidations?coin=${c}&limit=50`);
      if (r.ok) setLiqData(await r.json());
    } catch { /* ignore */ }
    finally { setLiqLoading(false); }
  }, []);

  useEffect(() => {
    setOIData(null);
    setLiqData(null);
    fetchOI(coin);
    fetchLiq(coin);

    if (oiTimer.current) clearInterval(oiTimer.current);
    if (liqTimer.current) clearInterval(liqTimer.current);

    oiTimer.current  = setInterval(() => fetchOI(coin),  60_000);
    liqTimer.current = setInterval(() => fetchLiq(coin), 15_000);

    return () => {
      if (oiTimer.current) clearInterval(oiTimer.current);
      if (liqTimer.current) clearInterval(liqTimer.current);
    };
  }, [coin, fetchOI, fetchLiq]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gridTemplateRows: '1fr',
      gap: '12px',
      height: 'calc(100vh - 80px)',
      color: 'var(--color-text)',
    }}>

      {/* ── Colonna sinistra: OI + LS ratio ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>

        {/* Header coin selector */}
        <div style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={labelSt}>Coin</span>
          <select
            value={coin}
            onChange={e => setCoin(e.target.value)}
            style={{
              background: 'var(--color-void)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '4px 8px',
              outline: 'none',
              flex: 1,
            }}
          >
            {COINS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {lastUpdate && (
            <span style={{ ...labelSt, fontSize: '8px', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              {lastUpdate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        <OISection data={oiData} />
        <LSRatioSection data={oiData} />

        {/* Disclaimer */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '8px',
          color: 'rgba(255,255,255,0.2)', lineHeight: 1.6,
          padding: '10px 14px',
          border: '1px solid var(--color-border)',
        }}>
          Dati OI aggregati da Bybit e Hyperliquid (stime su posizioni private). Probabilità di sweep calcolate su modello statistico — non garantiscono che il prezzo raggiunga quei livelli.
        </div>
      </div>

      {/* ── Colonna destra: feed liquidazioni ─── */}
      <LiqFeed data={liqData} loading={liqLoading} />
    </div>
  );
}
