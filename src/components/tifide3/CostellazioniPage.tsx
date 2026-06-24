'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import TierConstellation, { getTierTotal } from './TierConstellation';

// ── Tipi ──────────────────────────────────────────────────────────────────

type Tier = 'orione' | 'argonauta' | 'agema';

type Stella = {
  id: string;
  coin: string;
  pattern: string;
  tf: string;
  btcRegime: string; // '' | 'bull' | 'bear'
  thirdToken: boolean;
};

type LiveSignal = {
  ts_ms: number;
  coin: string;
  scenario: string;
  side: string;
  tf?: string;
  trigger_price?: number | null;
};

type BarStats = { p25: number | null; p50: number | null; p75: number | null; n: number };
type StatsResult = {
  ok: boolean;
  n: number;
  bar10: BarStats;
  bar20: BarStats;
  bar30: BarStats;
  source?: string;
  note?: string;
  error?: string;
};

// ── Costanti ──────────────────────────────────────────────────────────────

const COINS = [
  'BTC','SOL','ETH','DOGE','ADA','LTC','XRP','HYPE','WIF','OP',
  'LINK','AVAX','APT','ARB','AAVE','ATOM','CRV','TAO','UNI','PEPE',
  'SUI','SEI','TON','INJ','NEAR','LDO','JUP','ENA','ONDO','ZEC','WLD',
  'FARTCOIN','XLM','RENDER','AERO','SKY',
];

const PATTERNS = [
  { value: 'engulfing_bull',       label: 'Engulfing rialzista' },
  { value: 'engulfing_bear',       label: 'Engulfing ribassista' },
  { value: 'hammer',               label: 'Hammer' },
  { value: 'shooting_star',        label: 'Shooting Star' },
  { value: 'morning_star',         label: 'Morning Star' },
  { value: 'evening_star',         label: 'Evening Star' },
  { value: 'three_white_soldiers', label: 'Three White Soldiers' },
  { value: 'three_black_crows',    label: 'Three Black Crows' },
  { value: 'tweezer_bottom',       label: 'Tweezer Bottom' },
  { value: 'tweezer_top',          label: 'Tweezer Top' },
  { value: 'harami_bull',          label: 'Harami rialzista' },
  { value: 'harami_bear',          label: 'Harami ribassista' },
  { value: 'dark_cloud',           label: 'Dark Cloud Cover' },
];

const TF_OPTIONS = ['15m', '1h', '4h', '1d'];

const TIER_NAMES: Record<Tier, string> = {
  orione:    'Croce del Sud',
  argonauta: 'Cigno',
  agema:     'Sagittario',
};

const LS_KEY = 'cassandra_costellazioni_stelle';

// ── Helpers ───────────────────────────────────────────────────────────────

function loadStelle(): Stella[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStelle(s: Stella[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function patternLabel(v: string) {
  return PATTERNS.find(p => p.value === v)?.label ?? v;
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Stili condivisi ───────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  padding: '5px 9px',
  outline: 'none',
  width: '100%',
};

const labelSt: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.3em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-dim)',
  display: 'block',
  marginBottom: '3px',
};

const panelSt: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeaderSt: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border)',
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.35em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-dim)',
  flexShrink: 0,
};

// ── Componente principale ─────────────────────────────────────────────────

export default function CostellazioniPage() {
  const { user } = useUser();

  // Tier da Clerk metadata — default: orione
  const tier: Tier = (() => {
    const m = user?.publicMetadata?.tier as string | undefined;
    if (m === 'agema') return 'agema';
    if (m === 'argonauta') return 'argonauta';
    return 'orione';
  })();

  const tierTotal = getTierTotal(tier);

  // Stelle salvate
  const [stelle, setStelle] = useState<Stella[]>([]);
  useEffect(() => { setStelle(loadStelle()); }, []);

  // Form nuova stella
  const [coin, setCoin] = useState('BTC');
  const [pattern, setPattern] = useState('engulfing_bull');
  const [tf, setTf] = useState('1h');
  const [btcRegime, setBtcRegime] = useState('');
  const [thirdToken, setThirdToken] = useState(false);

  // Stats storiche
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch stats quando cambiano i filtri
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStats(null);

    const params = new URLSearchParams({ coin, pattern, btc_regime: btcRegime });
    if (thirdToken) params.set('has_third', 'true');

    fetch(`/api/tifide/stats?${params}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setStats(data as StatsResult); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });

    return () => { cancelled = true; };
  }, [coin, pattern, btcRegime, thirdToken]);

  // Segnali live
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [sigLoading, setSigLoading] = useState(false);
  const sigTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSignals = useCallback(async () => {
    setSigLoading(true);
    try {
      const res = await fetch('/api/orione2/matches?limit=40');
      if (res.ok) {
        const data = await res.json();
        const rows: LiveSignal[] = Array.isArray(data?.matches) ? data.matches : [];
        setSignals(rows);
      }
    } catch { /* ignore */ }
    finally { setSigLoading(false); }
  }, []);

  useEffect(() => {
    fetchSignals();
    sigTimer.current = setInterval(fetchSignals, 30_000);
    return () => { if (sigTimer.current) clearInterval(sigTimer.current); };
  }, [fetchSignals]);

  // Filtro segnali per stelle configurate (match su coin)
  const matchedSignals = signals.filter(sig => {
    if (stelle.length === 0) return true;
    const sigCoin = sig.coin?.replace(/USDT$/i, '').replace(/USDT$/i, '');
    return stelle.some(s => sigCoin === s.coin);
  });

  function addStella() {
    if (stelle.length >= tierTotal) return;
    const already = stelle.some(
      s => s.coin === coin && s.pattern === pattern && s.tf === tf,
    );
    if (already) return;
    const next = [
      ...stelle,
      { id: uid(), coin, pattern, tf, btcRegime, thirdToken },
    ];
    setStelle(next);
    saveStelle(next);
  }

  function removeStella(id: string) {
    const next = stelle.filter(s => s.id !== id);
    setStelle(next);
    saveStelle(next);
  }

  const canAdd = stelle.length < tierTotal;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: '12px',
      height: 'calc(100vh - 80px)',
      color: 'var(--color-text)',
    }}>

      {/* ── SINISTRA: configurazione + backtest (span 2 righe) ──────────── */}
      <div style={{ ...panelSt, gridRow: '1 / 3', overflowY: 'auto' }}>
        <div style={panelHeaderSt}>Configura stella</div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

          {/* Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelSt}>Coin</label>
              <select value={coin} onChange={e => setCoin(e.target.value)} style={inputSt}>
                {COINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Timeframe</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {TF_OPTIONS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTf(t)}
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-mono)', fontSize: '10px',
                      letterSpacing: '0.1em',
                      background: tf === t ? 'var(--color-void)' : 'var(--color-surface)',
                      color: tf === t ? 'var(--color-gold)' : 'var(--color-text-dim)',
                      border: `1px solid ${tf === t ? 'var(--color-gold-dim)' : 'var(--color-border)'}`,
                      padding: '5px 0',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={labelSt}>Pattern</label>
            <select value={pattern} onChange={e => setPattern(e.target.value)} style={inputSt}>
              {PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelSt}>BTC Regime</label>
              <select value={btcRegime} onChange={e => setBtcRegime(e.target.value)} style={inputSt}>
                <option value="">Qualsiasi</option>
                <option value="bull">Rialzista</option>
                <option value="bear">Ribassista</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ ...labelSt, marginBottom: '6px' }}>Third token</label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                fontFamily: 'var(--font-mono)', fontSize: '10px',
                color: 'var(--color-text)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={thirdToken}
                  onChange={e => setThirdToken(e.target.checked)}
                  style={{ accentColor: 'var(--color-gold)' }}
                />
                Richiesto
              </label>
            </div>
          </div>

          {/* Distribuzione storica */}
          <div style={{
            border: '1px solid var(--color-border)',
            padding: '12px',
            background: 'rgba(201,168,76,0.03)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <span style={labelSt}>Distribuzione storica</span>
              {statsLoading && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', opacity: 0.5 }}>
                  …
                </span>
              )}
              {stats?.n != null && !statsLoading && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', opacity: 0.5 }}>
                  {stats.n} occ.
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)', lineHeight: 1.8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '4px', marginBottom: '4px' }}>
                {['', 'p25', 'p50', 'p75'].map(h => (
                  <span key={h} style={{ fontSize: '9px', color: 'var(--color-text-dim)' }}>{h}</span>
                ))}
              </div>
              {([10, 20, 30] as const).map(bar => {
                const bs = stats?.[`bar${bar}` as 'bar10' | 'bar20' | 'bar30'];
                const hasData = bs && bs.n > 0;
                const fmt = (v: number | null) =>
                  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
                const colorFor = (v: number | null) =>
                  v == null ? 'var(--color-text-dim)'
                  : v > 0 ? 'var(--color-long-bright, #4a9)'
                  : v < 0 ? 'var(--color-short-bright, #a44)'
                  : 'var(--color-text-dim)';
                return (
                  <div key={bar} style={{
                    display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr',
                    gap: '4px', padding: '3px 0',
                    borderTop: '1px solid var(--color-border)',
                    opacity: statsLoading ? 0.35 : hasData ? 1 : 0.4,
                    transition: 'opacity 200ms',
                  }}>
                    <span style={{ color: 'var(--color-text)' }}>{bar} barre</span>
                    <span style={{ color: colorFor(bs?.p25 ?? null) }}>{fmt(bs?.p25 ?? null)}</span>
                    <span style={{ color: colorFor(bs?.p50 ?? null), fontWeight: hasData ? 500 : 400 }}>
                      {fmt(bs?.p50 ?? null)}
                    </span>
                    <span style={{ color: colorFor(bs?.p75 ?? null) }}>{fmt(bs?.p75 ?? null)}</span>
                  </div>
                );
              })}
              {stats?.note && !statsLoading && (
                <div style={{ marginTop: '6px', fontSize: '9px', color: 'rgba(201,168,76,0.45)', fontStyle: 'italic' }}>
                  {stats.note}
                </div>
              )}
              {!statsLoading && (stats == null || stats.n === 0) && (
                <div style={{ marginTop: '6px', fontSize: '9px', color: 'rgba(201,168,76,0.35)', fontStyle: 'italic' }}>
                  {stats?.error ?? 'Nessun dato per questa combinazione.'}
                </div>
              )}
            </div>
          </div>

          {/* Bottone aggiungi */}
          <button
            onClick={addStella}
            disabled={!canAdd}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              letterSpacing: '0.25em', textTransform: 'uppercase',
              background: canAdd ? 'var(--color-void)' : 'transparent',
              color: canAdd ? 'var(--color-gold)' : 'var(--color-text-dim)',
              border: `1px solid ${canAdd ? 'rgba(201,168,76,0.4)' : 'var(--color-border)'}`,
              padding: '9px',
              cursor: canAdd ? 'pointer' : 'not-allowed',
              opacity: canAdd ? 1 : 0.4,
              transition: 'opacity 200ms',
            }}
          >
            {canAdd ? '+ Aggiungi stella' : `Costellazione completa (${tierTotal}/${tierTotal})`}
          </button>

          {/* Lista stelle salvate */}
          {stelle.length > 0 && (
            <div>
              <div style={{ ...labelSt, marginBottom: '6px' }}>Le tue stelle</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {stelle.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    border: '1px solid var(--color-border)',
                    padding: '7px 10px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    <span style={{ color: 'var(--color-gold)', opacity: 0.7, fontSize: '8px', flexShrink: 0 }}>
                      ★ {i + 1}
                    </span>
                    <span style={{ flex: 1, color: 'var(--color-text)' }}>
                      {s.coin} · {patternLabel(s.pattern)} · {s.tf}
                      {s.btcRegime && <span style={{ color: 'var(--color-text-dim)' }}> · {s.btcRegime}</span>}
                      {s.thirdToken && <span style={{ color: 'var(--color-text-dim)' }}> · 3T</span>}
                    </span>
                    <button
                      onClick={() => removeStella(s.id)}
                      style={{
                        background: 'transparent', border: 'none',
                        color: 'var(--color-text-dim)', cursor: 'pointer',
                        fontSize: '11px', padding: '0 2px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: '9px',
            color: 'var(--color-text-dim)', lineHeight: 1.6,
            borderTop: '1px solid var(--color-border)', paddingTop: '10px',
            marginTop: 'auto',
          }}>
            Le distribuzioni storiche mostrano il comportamento passato del pattern — non garantiscono risultati futuri.
          </p>
        </div>
      </div>

      {/* ── DESTRA ALTO: costellazione ───────────────────────────────────── */}
      <div style={panelSt}>
        <div style={panelHeaderSt}>
          La tua costellazione — {TIER_NAMES[tier]}
        </div>
        <div style={{ flex: 1, position: 'relative', padding: '12px', minHeight: 0 }}>
          <TierConstellation
            tier={tier}
            starsUsed={stelle.length}
            showNames
            style={{ height: '100%' }}
          />
        </div>
      </div>

      {/* ── DESTRA BASSO: segnali live ───────────────────────────────────── */}
      <div style={panelSt}>
        <div style={{
          ...panelHeaderSt,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Segnali in corso</span>
          <span style={{ opacity: 0.5, fontSize: '8px' }}>
            {sigLoading ? '…' : `${matchedSignals.length} match`}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {matchedSignals.length === 0 ? (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--color-text-dim)', padding: '14px',
              opacity: 0.5,
            }}>
              {stelle.length === 0
                ? 'Configura almeno una stella per vedere i segnali corrispondenti.'
                : 'Nessun segnale recente per le stelle configurate.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Ora', 'Coin', 'Pattern', 'Dir', 'Prezzo'].map(h => (
                    <th key={h} style={{
                      fontFamily: 'var(--font-mono)', fontSize: '8px',
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: 'var(--color-text-dim)', fontWeight: 400,
                      padding: '6px 10px', textAlign: 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchedSignals.slice(0, 30).map((s, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(201,168,76,0.06)',
                      fontFamily: 'var(--font-mono)', fontSize: '10px',
                    }}
                  >
                    <td style={{ padding: '5px 10px', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
                      {fmtTime(s.ts_ms)}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--color-gold)' }}>
                      {s.coin?.replace('USDT', '')}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--color-text)' }}>
                      {patternLabel(s.scenario)}
                    </td>
                    <td style={{
                      padding: '5px 10px',
                      color: s.side === 'long'
                        ? 'var(--color-long-bright, #4a9)'
                        : 'var(--color-short-bright, #a44)',
                    }}>
                      {s.side === 'long' ? 'rialzista' : 'ribassista'}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--color-text-dim)' }}>
                      {s.trigger_price != null
                        ? Number(s.trigger_price).toLocaleString('it-IT', { maximumFractionDigits: 4 })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
