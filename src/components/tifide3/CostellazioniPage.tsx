'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import TierConstellation, { getTierTotal } from './TierConstellation';

// ── Tipi ──────────────────────────────────────────────────────────────────

type Tier = 'orione' | 'argonauta' | 'agema' | 'galassia';

type Stella = {
  id: string;
  coin: string;
  pattern: string;
  tf: string;
  side: string;       // 'LONG' | 'SHORT' | ''
  btcRegime: string;  // '' | 'bull' | 'bear'
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

type BarStats = {
  p25: number | null; p50: number | null; p75: number | null;
  n: number; wr: number | null; pf: number | null;
};
type StatsResult = {
  ok: boolean;
  n: number;
  bar10: BarStats;
  bar20: BarStats;
  bar30: BarStats;
  source?: string;
  note?: string;
  error?: string;
  low_n?: boolean;
};

type SummaryRow = {
  coin: string; pattern: string; tf: string; side: string;
  btc_score: number; n: number;
  wr10: number | null; pf10: number | null; med10: number | null;
  wr20: number | null; pf20: number | null; med20: number | null;
  wr30: number | null; pf30: number | null; med30: number | null;
};

// ── Costanti ──────────────────────────────────────────────────────────────

const COINS = [
  'BTC','SOL','ETH','DOGE','ADA','LTC','XRP','HYPE','WIF','OP',
  'LINK','AVAX','APT','ARB','AAVE','ATOM','CRV','TAO','UNI','PEPE',
  'SUI','SEI','TON','INJ','NEAR','LDO','JUP','ENA','ONDO','ZEC','WLD',
  'FARTCOIN','XLM','RENDER','AERO','SKY',
];

const PATTERNS = [
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
  { value: 'dark_cloud_cover',     label: 'Dark Cloud Cover' },
  { value: 'piercing_line',        label: 'Piercing Line' },
];

const TF_OPTIONS = ['1m', '3m', '5m'];

const SIDE_OPTIONS: { value: string; label: string }[] = [
  { value: '',      label: 'Tutti' },
  { value: 'LONG',  label: 'Rialzista' },
  { value: 'SHORT', label: 'Ribassista' },
];

const TIER_NAMES: Record<Tier, string> = {
  orione:    'Croce del Sud',
  argonauta: 'Cigno',
  agema:     'Sagittario',
  galassia:  'Galassia',
};

const LS_KEY = 'cassandra_costellazioni_stelle';

const SORT_OPTIONS = [
  { value: 'wr10',  label: 'WR 10b' },
  { value: 'wr20',  label: 'WR 20b' },
  { value: 'wr30',  label: 'WR 30b' },
  { value: 'pf10',  label: 'PF 10b' },
  { value: 'pf20',  label: 'PF 20b' },
  { value: 'pf30',  label: 'PF 30b' },
  { value: 'n',     label: 'N occ.' },
];

type NumOp = '>' | '>=' | '<' | '<=';
type ColKey = 'n' | 'btc_score' | 'wr10' | 'pf10' | 'wr20' | 'pf20' | 'wr30' | 'pf30';
type AdvFilters = {
  coins: string[];
  patterns: string[];
  tfs: string[];
  dirs: string[];
  num: Record<ColKey, { op: NumOp | ''; val: string }>;
};

const NUM_COLS: { key: ColKey; label: string; pct?: boolean }[] = [
  { key: 'n',         label: 'N' },
  { key: 'btc_score', label: 'BTC' },
  { key: 'wr10',      label: 'WR10', pct: true },
  { key: 'pf10',      label: 'PF10' },
  { key: 'wr20',      label: 'WR20', pct: true },
  { key: 'pf20',      label: 'PF20' },
  { key: 'wr30',      label: 'WR30', pct: true },
  { key: 'pf30',      label: 'PF30' },
];

function initAdvFilters(): AdvFilters {
  const num = {} as AdvFilters['num'];
  for (const c of NUM_COLS) num[c.key] = { op: '', val: '' };
  return { coins: [], patterns: [], tfs: [], dirs: [], num };
}

function applyAdvFilters(rows: SummaryRow[], f: AdvFilters): SummaryRow[] {
  return rows.filter(r => {
    if (f.coins.length > 0 && !f.coins.includes(r.coin)) return false;
    if (f.patterns.length > 0 && !f.patterns.includes(r.pattern)) return false;
    if (f.tfs.length > 0 && !f.tfs.includes(r.tf)) return false;
    if (f.dirs.length > 0 && !f.dirs.includes(r.side)) return false;
    for (const c of NUM_COLS) {
      const { op, val } = f.num[c.key];
      if (!op || val === '') continue;
      const rv = r[c.key] as number | null;
      if (rv == null) return false;
      const fv = parseFloat(val);
      if (isNaN(fv)) continue;
      if (op === '>'  && !(rv >  fv)) return false;
      if (op === '>=' && !(rv >= fv)) return false;
      if (op === '<'  && !(rv <  fv)) return false;
      if (op === '<=' && !(rv <= fv)) return false;
    }
    return true;
  });
}

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

function uid() { return Math.random().toString(36).slice(2, 10); }

function patternLabel(v: string) {
  return PATTERNS.find(p => p.value === v)?.label ?? v;
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function colorPct(v: number | null | undefined) {
  if (v == null) return 'var(--color-text-dim)';
  return v > 0 ? 'var(--color-long-bright, #4a9)' : v < 0 ? 'var(--color-short-bright, #a44)' : 'var(--color-text-dim)';
}

function colorWr(wr: number | null | undefined) {
  if (wr == null) return 'var(--color-text-dim)';
  if (wr >= 65) return 'var(--color-long-bright, #4a9)';
  if (wr <= 45) return 'var(--color-short-bright, #a44)';
  return 'var(--color-text)';
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
  const { user, isLoaded: clerkLoaded } = useUser();

  const tier: Tier = (() => {
    const m = user?.publicMetadata?.tier as string | undefined;
    if (m === 'galassia') return 'galassia';
    if (m === 'agema') return 'agema';
    if (m === 'argonauta') return 'argonauta';
    return 'orione';
  })();

  const tierTotal = getTierTotal(tier);

  const [stelle, setStelle] = useState<Stella[]>([]);
  useEffect(() => { setStelle(loadStelle()); }, []);

  // Form nuova stella
  const [coin, setCoin] = useState('BTC');
  const [pattern, setPattern] = useState('hammer');
  const [tf, setTf] = useState('1m');
  const [side, setSide] = useState<'LONG' | 'SHORT' | ''>('LONG');
  const [btcRegime, setBtcRegime] = useState('');
  const [thirdToken, setThirdToken] = useState(false);

  // Stats storiche
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [statsErrMsg, setStatsErrMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // Stats aggregate costellazione
  type CostellStats = {
    n: number;
    wr10: number | null; pf10: number | null;
    wr20: number | null; pf20: number | null;
    wr30: number | null; pf30: number | null;
  };
  const [costellStats, setCostellStats] = useState<CostellStats | null>(null);
  const [costellStatsLoading, setCostellStatsLoading] = useState(false);

  useEffect(() => {
    if (!clerkLoaded) return;
    let cancelled = false;
    setStatsLoading(true);
    setStats(null);
    setStatsError(false);
    setStatsErrMsg('');

    const params = new URLSearchParams({ coin, pattern, btc_regime: btcRegime, tf, side });
    if (thirdToken) params.set('has_third', 'true');

    const backendBase = (process.env.NEXT_PUBLIC_BACKEND_BASE || '').replace(/\/+$/, '');
    const url = backendBase
      ? `${backendBase}/api/tifide/stats?${params}`
      : `/api/tifide/stats?${params}`;

    const attemptFetch = async (attemptsLeft: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50_000);
      try {
        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const bodyText = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${bodyText.slice(0, 200)}`);
        let data: StatsResult;
        try {
          data = JSON.parse(bodyText);
        } catch {
          throw new Error(`body non-JSON [${r.status}]: ${bodyText.slice(0, 200)}`);
        }
        if (!cancelled) {
          setStats(data as StatsResult);
          setStatsError(false);
          setStatsErrMsg('');
          setStatsLoading(false);
        }
      } catch (err) {
        clearTimeout(timer);
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (attemptsLeft > 0) {
          await new Promise(res => setTimeout(res, 4000));
          if (!cancelled) await attemptFetch(attemptsLeft - 1);
        } else {
          setStats(null);
          setStatsError(true);
          setStatsErrMsg(msg);
          setStatsLoading(false);
        }
      }
    };

    attemptFetch(2);

    return () => { cancelled = true; };
  }, [coin, pattern, btcRegime, tf, side, thirdToken, retryKey, clerkLoaded]);

  // Fetch aggregato per tutte le stelle della costellazione
  useEffect(() => {
    if (!clerkLoaded || stelle.length === 0) {
      setCostellStats(null);
      return;
    }
    let cancelled = false;
    setCostellStatsLoading(true);
    const backendBase = (process.env.NEXT_PUBLIC_BACKEND_BASE || '').replace(/\/+$/, '');

    const fetchOne = async (s: Stella): Promise<StatsResult | null> => {
      try {
        const p = new URLSearchParams({ coin: s.coin, pattern: s.pattern, btc_regime: s.btcRegime, tf: s.tf, side: s.side });
        if (s.thirdToken) p.set('has_third', 'true');
        const url = backendBase ? `${backendBase}/api/tifide/stats?${p}` : `/api/tifide/stats?${p}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30_000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };

    Promise.all(stelle.map(fetchOne)).then(results => {
      if (cancelled) return;
      const valid = results.filter((r): r is StatsResult => r != null && r.ok && r.n > 0);
      if (valid.length === 0) { setCostellStats(null); setCostellStatsLoading(false); return; }
      const totalN = valid.reduce((s, r) => s + r.n, 0);
      const wAvg = (key: 'wr' | 'pf', bar: 10 | 20 | 30): number | null => {
        const bk = `bar${bar}` as 'bar10' | 'bar20' | 'bar30';
        let num = 0, den = 0;
        for (const r of valid) { const v = r[bk][key]; if (v != null) { num += r.n * v; den += r.n; } }
        return den > 0 ? num / den : null;
      };
      setCostellStats({
        n: totalN,
        wr10: wAvg('wr', 10), pf10: wAvg('pf', 10),
        wr20: wAvg('wr', 20), pf20: wAvg('pf', 20),
        wr30: wAvg('wr', 30), pf30: wAvg('pf', 30),
      });
      setCostellStatsLoading(false);
    });

    return () => { cancelled = true; };
  }, [stelle, clerkLoaded]);

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
        setSignals(Array.isArray(data?.matches) ? data.matches : []);
      }
    } catch { /* ignore */ }
    finally { setSigLoading(false); }
  }, []);

  useEffect(() => {
    fetchSignals();
    sigTimer.current = setInterval(fetchSignals, 30_000);
    return () => { if (sigTimer.current) clearInterval(sigTimer.current); };
  }, [fetchSignals]);

  // Toggle pannello destra-basso
  const [rightTab, setRightTab] = useState<'signals' | 'grid'>('signals');

  // Griglia summary
  const [gridRows, setGridRows] = useState<SummaryRow[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridFilters, setGridFilters] = useState({ coin: '', pattern: '', tf: '', side: '', sortBy: 'wr10' });
  const [gridLoaded, setGridLoaded] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvFilters>(initAdvFilters);
  const [showAdv, setShowAdv] = useState(false);

  const loadGrid = useCallback(async () => {
    setGridLoading(true);
    try {
      const p = new URLSearchParams({
        min_n: '30',
        sort_by: gridFilters.sortBy,
        limit: '150',
      });
      if (gridFilters.coin)    p.set('coin', gridFilters.coin);
      if (gridFilters.pattern) p.set('pattern', gridFilters.pattern);
      if (gridFilters.tf)      p.set('tf', gridFilters.tf);
      if (gridFilters.side)    p.set('side', gridFilters.side);
      const res = await fetch(`/api/tifide/summary?${p}`);
      if (res.ok) {
        const data = await res.json();
        setGridRows(data.rows ?? []);
        setGridLoaded(true);
      }
    } catch { /* ignore */ }
    finally { setGridLoading(false); }
  }, [gridFilters]);

  useEffect(() => {
    if (rightTab === 'grid') {
      loadGrid();
    }
  }, [rightTab, loadGrid]);

  // Filtro segnali per stelle configurate
  const matchedSignals = signals.filter(sig => {
    if (stelle.length === 0) return true;
    const sigCoin = sig.coin?.replace(/USDT$/i, '');
    return stelle.some(s => sigCoin === s.coin);
  });

  function addStella() {
    if (stelle.length >= tierTotal) return;
    const already = stelle.some(
      s => s.coin === coin && s.pattern === pattern && s.tf === tf && s.side === side,
    );
    if (already) return;
    const next = [...stelle, { id: uid(), coin, pattern, tf, side, btcRegime, thirdToken }];
    setStelle(next);
    saveStelle(next);
  }

  function addStellaFromGrid(row: SummaryRow) {
    if (stelle.length >= tierTotal) return;
    const already = stelle.some(s => s.coin === row.coin && s.pattern === row.pattern && s.tf === row.tf && s.side === row.side && s.btcRegime === '');
    if (already) return;
    const next = [...stelle, { id: uid(), coin: row.coin, pattern: row.pattern, tf: row.tf, side: row.side, btcRegime: '', thirdToken: false }];
    setStelle(next);
    saveStelle(next);
  }

  function scoreToBtcRegime(score: number): '' | 'bull' | 'bear' {
    if (score >= 3) return 'bull';
    if (score >= 0) return 'bear';
    return '';
  }

  function addStellaFromGridWithRegime(row: SummaryRow) {
    if (stelle.length >= tierTotal) return;
    const targetRegime = scoreToBtcRegime(row.btc_score);
    const already = stelle.some(s => s.coin === row.coin && s.pattern === row.pattern && s.tf === row.tf && s.side === row.side && s.btcRegime === targetRegime);
    if (already) return;
    const next = [...stelle, { id: uid(), coin: row.coin, pattern: row.pattern, tf: row.tf, side: row.side, btcRegime: targetRegime, thirdToken: false }];
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

          {/* Form — riga 1: coin + TF */}
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
                  <button key={t} onClick={() => setTf(t)} style={{
                    flex: 1, fontFamily: 'var(--font-mono)', fontSize: '10px',
                    letterSpacing: '0.1em',
                    background: tf === t ? 'var(--color-void)' : 'var(--color-surface)',
                    color: tf === t ? 'var(--color-gold)' : 'var(--color-text-dim)',
                    border: `1px solid ${tf === t ? 'var(--color-gold-dim)' : 'var(--color-border)'}`,
                    padding: '5px 0', cursor: 'pointer',
                  }}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Pattern */}
          <div>
            <label style={labelSt}>Pattern</label>
            <select value={pattern} onChange={e => setPattern(e.target.value)} style={inputSt}>
              {PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Side + BTC Regime */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelSt}>Direzione</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {SIDE_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => setSide(s.value as 'LONG' | 'SHORT' | '')} style={{
                    flex: 1, fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.05em',
                    background: side === s.value ? 'var(--color-void)' : 'var(--color-surface)',
                    color: side === s.value
                      ? (s.value === 'LONG' ? 'var(--color-long-bright, #4a9)' : s.value === 'SHORT' ? 'var(--color-short-bright, #a44)' : 'var(--color-gold)')
                      : 'var(--color-text-dim)',
                    border: `1px solid ${side === s.value ? 'var(--color-gold-dim)' : 'var(--color-border)'}`,
                    padding: '5px 2px', cursor: 'pointer',
                  }}>{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelSt}>BTC Regime</label>
              <select value={btcRegime} onChange={e => setBtcRegime(e.target.value)} style={inputSt}>
                <option value="">Qualsiasi</option>
                <option value="bull">Rialzista</option>
                <option value="bear">Ribassista</option>
              </select>
            </div>
          </div>

          {/* Third token */}
          <div>
            <label style={{ ...labelSt, marginBottom: '6px' }}>Third token</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={thirdToken} onChange={e => setThirdToken(e.target.checked)} style={{ accentColor: 'var(--color-gold)' }} />
              Richiesto
            </label>
          </div>

          {/* Distribuzione storica */}
          <div style={{ border: '1px solid var(--color-border)', padding: '12px', background: 'rgba(201,168,76,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={labelSt}>Distribuzione storica</span>
              {statsLoading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', opacity: 0.5 }}>…</span>}
              {stats?.n != null && !statsLoading && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', opacity: 0.5 }}>
                  {stats.n} occ.
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)', lineHeight: 1.8 }}>
              {/* Intestazione colonne */}
              <div style={{ display: 'grid', gridTemplateColumns: '55px 38px 40px 1fr 1fr 1fr', gap: '4px', marginBottom: '4px' }}>
                {['', 'WR', 'PF', 'p25', 'p50', 'p75'].map(h => (
                  <span key={h} style={{ fontSize: '9px', color: 'var(--color-text-dim)' }}>{h}</span>
                ))}
              </div>
              {([10, 20, 30] as const).map(bar => {
                const bs = stats?.[`bar${bar}` as 'bar10' | 'bar20' | 'bar30'];
                const hasData = bs && bs.n > 0;
                return (
                  <div key={bar} style={{
                    display: 'grid', gridTemplateColumns: '55px 38px 40px 1fr 1fr 1fr',
                    gap: '4px', padding: '3px 0',
                    borderTop: '1px solid var(--color-border)',
                    opacity: statsLoading ? 0.35 : hasData ? 1 : 0.4,
                    transition: 'opacity 200ms',
                  }}>
                    <span style={{ color: 'var(--color-text)' }}>{bar} barre</span>
                    <span style={{ color: colorWr(bs?.wr) }}>
                      {bs?.wr != null ? `${bs.wr.toFixed(0)}%` : '—'}
                    </span>
                    <span style={{ color: bs?.pf != null && bs.pf >= 1.5 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text-dim)' }}>
                      {bs?.pf != null ? bs.pf.toFixed(2) : '—'}
                    </span>
                    <span style={{ color: colorPct(bs?.p25) }}>{fmtPct(bs?.p25)}</span>
                    <span style={{ color: colorPct(bs?.p50), fontWeight: hasData ? 500 : 400 }}>{fmtPct(bs?.p50)}</span>
                    <span style={{ color: colorPct(bs?.p75) }}>{fmtPct(bs?.p75)}</span>
                  </div>
                );
              })}
              {/* Avviso campione ridotto — spec: mostrare sempre quando n<20 */}
              {!statsLoading && stats?.ok && stats.low_n && stats.n > 0 && (
                <div style={{
                  marginTop: '8px', padding: '6px 8px',
                  border: '1px solid rgba(201,168,76,0.25)',
                  background: 'rgba(201,168,76,0.04)',
                  fontSize: '9px', fontFamily: 'var(--font-mono)',
                  color: 'rgba(201,168,76,0.7)', lineHeight: 1.5,
                }}>
                  Campione ridotto (n={stats.n}) — i dati mostrati hanno scarsa significatività statistica.
                </div>
              )}
              {stats?.note && !statsLoading && (
                <div style={{ marginTop: '6px', fontSize: '9px', color: 'rgba(201,168,76,0.45)', fontStyle: 'italic' }}>
                  {stats.note}
                </div>
              )}
              {!statsLoading && statsError && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(201,168,76,0.5)', fontStyle: 'italic' }}>
                      Errore di connessione.
                    </span>
                    <button
                      onClick={() => setRetryKey(k => k + 1)}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.15em',
                        background: 'transparent', color: 'var(--color-gold)',
                        border: '1px solid rgba(201,168,76,0.3)', padding: '1px 7px',
                        cursor: 'pointer',
                      }}
                    >
                      Riprova
                    </button>
                  </div>
                  {statsErrMsg && (
                    <div style={{ fontSize: '8px', color: 'rgba(201,168,76,0.35)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                      {statsErrMsg}
                    </div>
                  )}
                </div>
              )}
              {!statsLoading && !statsError && (stats == null || stats.n === 0) && (
                <div style={{ marginTop: '6px', fontSize: '9px', color: 'rgba(201,168,76,0.35)', fontStyle: 'italic' }}>
                  {stats?.error ?? 'Nessun dato per questa combinazione.'}
                </div>
              )}
            </div>
          </div>

          {/* Bottone aggiungi */}
          <button onClick={addStella} disabled={!canAdd} style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            letterSpacing: '0.25em', textTransform: 'uppercase',
            background: canAdd ? 'var(--color-void)' : 'transparent',
            color: canAdd ? 'var(--color-gold)' : 'var(--color-text-dim)',
            border: `1px solid ${canAdd ? 'rgba(201,168,76,0.4)' : 'var(--color-border)'}`,
            padding: '9px', cursor: canAdd ? 'pointer' : 'not-allowed',
            opacity: canAdd ? 1 : 0.4, transition: 'opacity 200ms',
          }}>
            {canAdd ? '+ Aggiungi stella' : `Costellazione completa (${tierTotal === Infinity ? '∞' : `${tierTotal}/${tierTotal}`})`}
          </button>

          {/* Lista stelle salvate */}
          {stelle.length > 0 && (
            <div>
              <div style={{ ...labelSt, marginBottom: '6px' }}>Le tue stelle</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {stelle.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    border: '1px solid var(--color-border)', padding: '7px 10px',
                    fontSize: '10px', fontFamily: 'var(--font-mono)',
                  }}>
                    <span style={{ color: 'var(--color-gold)', opacity: 0.7, fontSize: '8px', flexShrink: 0 }}>★ {i + 1}</span>
                    <span style={{ flex: 1, color: 'var(--color-text)' }}>
                      {s.coin} · {patternLabel(s.pattern)} · {s.tf}
                      {s.side && <span style={{ color: s.side === 'LONG' ? 'var(--color-long-bright, #4a9)' : 'var(--color-short-bright, #a44)' }}> · {s.side === 'LONG' ? 'rialzista' : 'ribassista'}</span>}
                      {s.btcRegime && <span style={{ color: 'var(--color-text-dim)' }}> · {s.btcRegime}</span>}
                      {s.thirdToken && <span style={{ color: 'var(--color-text-dim)' }}> · 3T</span>}
                    </span>
                    <button onClick={() => removeStella(s.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: 'auto' }}>
            Le distribuzioni storiche mostrano il comportamento passato del pattern — non garantiscono risultati futuri.
          </p>
        </div>
      </div>

      {/* ── DESTRA ALTO: costellazione ───────────────────────────────────── */}
      <div style={panelSt}>
        <div style={panelHeaderSt}>La tua costellazione — {TIER_NAMES[tier]}</div>
        <div style={{ flex: 1, position: 'relative', padding: '12px', minHeight: 0 }}>
          <TierConstellation tier={tier} starsUsed={stelle.length} showNames style={{ height: '100%' }} />
        </div>
        {/* Performance aggregate delle stelle */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px', flexShrink: 0 }}>
          {stelle.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', textAlign: 'center', opacity: 0.5 }}>
              Aggiungi stelle per vedere le performance aggregate
            </div>
          ) : costellStatsLoading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', textAlign: 'center' }}>…</div>
          ) : costellStats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', rowGap: '3px' }}>
              {(['N', 'WR10', 'PF10', 'WR20', 'PF20', 'WR30', 'PF30'] as const).map(h => (
                <div key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.12em', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>{h}</div>
              ))}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text)' }}>{costellStats.n.toLocaleString('it-IT')}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: colorWr(costellStats.wr10) }}>{costellStats.wr10 != null ? `${costellStats.wr10.toFixed(0)}%` : '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: (costellStats.pf10 ?? 0) >= 1 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text)' }}>{costellStats.pf10 != null ? costellStats.pf10.toFixed(2) : '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: colorWr(costellStats.wr20) }}>{costellStats.wr20 != null ? `${costellStats.wr20.toFixed(0)}%` : '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: (costellStats.pf20 ?? 0) >= 1 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text)' }}>{costellStats.pf20 != null ? costellStats.pf20.toFixed(2) : '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: colorWr(costellStats.wr30) }}>{costellStats.wr30 != null ? `${costellStats.wr30.toFixed(0)}%` : '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: (costellStats.pf30 ?? 0) >= 1 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text)' }}>{costellStats.pf30 != null ? costellStats.pf30.toFixed(2) : '—'}</div>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', textAlign: 'center', opacity: 0.5 }}>Nessun dato disponibile</div>
          )}
        </div>
      </div>

      {/* ── DESTRA BASSO: segnali live | griglia ─────────────────────────── */}
      <div style={panelSt}>
        {/* Header con toggle tab */}
        <div style={{ ...panelHeaderSt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0' }}>
            {(['signals', 'grid'] as const).map(tab => (
              <button key={tab} onClick={() => setRightTab(tab)} style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em',
                textTransform: 'uppercase', border: 'none',
                background: rightTab === tab ? 'rgba(201,168,76,0.12)' : 'transparent',
                color: rightTab === tab ? 'var(--color-gold)' : 'var(--color-text-dim)',
                padding: '0 12px', cursor: 'pointer', height: '100%',
                borderBottom: rightTab === tab ? '1px solid var(--color-gold-dim)' : '1px solid transparent',
              }}>
                {tab === 'signals' ? 'Segnali' : 'Griglia'}
              </button>
            ))}
          </div>
          {rightTab === 'signals' && (
            <span style={{ opacity: 0.5, fontSize: '8px' }}>
              {sigLoading ? '…' : `${matchedSignals.length} match`}
            </span>
          )}
          {rightTab === 'grid' && (
            <button onClick={loadGrid} disabled={gridLoading} style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'transparent', border: '1px solid var(--color-border)', color: gridLoading ? 'var(--color-text-dim)' : 'var(--color-gold)', padding: '2px 8px', cursor: gridLoading ? 'default' : 'pointer' }}>
              {gridLoading ? '…' : 'Aggiorna'}
            </button>
          )}
        </div>

        {/* ── Segnali live ── */}
        {rightTab === 'signals' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {matchedSignals.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)', padding: '14px', opacity: 0.5 }}>
                {stelle.length === 0
                  ? 'Configura almeno una stella per vedere i segnali corrispondenti.'
                  : 'Nessun segnale recente per le stelle configurate.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Ora', 'Coin', 'Pattern', 'Dir', 'Prezzo'].map(h => (
                      <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)', fontWeight: 400, padding: '6px 10px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matchedSignals.slice(0, 30).map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(201,168,76,0.06)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                      <td style={{ padding: '5px 10px', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>{fmtTime(s.ts_ms)}</td>
                      <td style={{ padding: '5px 10px', color: 'var(--color-gold)' }}>{s.coin?.replace('USDT', '')}</td>
                      <td style={{ padding: '5px 10px', color: 'var(--color-text)' }}>{patternLabel(s.scenario)}</td>
                      <td style={{ padding: '5px 10px', color: s.side === 'long' ? 'var(--color-long-bright, #4a9)' : 'var(--color-short-bright, #a44)' }}>
                        {s.side === 'long' ? 'rialzista' : 'ribassista'}
                      </td>
                      <td style={{ padding: '5px 10px', color: 'var(--color-text-dim)' }}>
                        {s.trigger_price != null ? Number(s.trigger_price).toLocaleString('it-IT', { maximumFractionDigits: 4 }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Griglia WR/PF ── */}
        {rightTab === 'grid' && (() => {
          const displayRows = applyAdvFilters(gridRows, advFilters);

          const toggleCat = (field: 'coins' | 'patterns' | 'tfs' | 'dirs', val: string) =>
            setAdvFilters(f => {
              const cur = f[field];
              return { ...f, [field]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
            });

          const setNum = (col: ColKey, part: 'op' | 'val', v: string) =>
            setAdvFilters(f => ({ ...f, num: { ...f.num, [col]: { ...f.num[col], [part]: v } } }));

          const hasActiveAdv = advFilters.coins.length > 0 || advFilters.patterns.length > 0 ||
            advFilters.tfs.length > 0 || advFilters.dirs.length > 0 ||
            NUM_COLS.some(c => advFilters.num[c.key].op && advFilters.num[c.key].val !== '');

          const chipSt = (active: boolean, color?: string): React.CSSProperties => ({
            fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.05em',
            padding: '2px 5px', cursor: 'pointer', border: '1px solid',
            borderColor: active ? (color || 'rgba(201,168,76,0.5)') : 'var(--color-border)',
            background: active ? 'rgba(201,168,76,0.1)' : 'transparent',
            color: active ? (color || 'var(--color-gold)') : 'var(--color-text-dim)',
          });

          const opSt: React.CSSProperties = {
            ...inputSt, width: '34px', padding: '1px 2px', fontSize: '9px',
            textAlign: 'center' as const,
          };
          const valSt: React.CSSProperties = {
            ...inputSt, width: '38px', padding: '1px 3px', fontSize: '9px',
          };

          return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Filtri base */}
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
              <select value={gridFilters.sortBy} onChange={e => setGridFilters(f => ({ ...f, sortBy: e.target.value }))}
                style={{ ...inputSt, width: '90px', padding: '2px 4px', fontSize: '9px' }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={loadGrid} disabled={gridLoading} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em', background: 'var(--color-void)', color: 'var(--color-gold)', border: '1px solid rgba(201,168,76,0.3)', padding: '2px 10px', cursor: gridLoading ? 'default' : 'pointer', opacity: gridLoading ? 0.5 : 1 }}>
                {gridLoading ? '…' : 'Carica'}
              </button>
              <button onClick={() => setShowAdv(v => !v)} style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                background: showAdv || hasActiveAdv ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: hasActiveAdv ? 'var(--color-gold)' : 'var(--color-text-dim)',
                border: `1px solid ${hasActiveAdv ? 'rgba(201,168,76,0.4)' : 'var(--color-border)'}`,
                padding: '2px 8px', cursor: 'pointer',
              }}>
                {hasActiveAdv ? `Filtri (attivi)` : 'Filtri'}
              </button>
              {hasActiveAdv && (
                <button onClick={() => setAdvFilters(initAdvFilters)} style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'transparent', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)', padding: '2px 6px', cursor: 'pointer' }}>
                  ✕ reset
                </button>
              )}
              {gridLoaded && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', marginLeft: 'auto', opacity: 0.6 }}>
                  {displayRows.length}/{gridRows.length}
                </span>
              )}
            </div>

            {/* Pannello filtri avanzati */}
            {showAdv && (
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', background: 'rgba(201,168,76,0.02)', flexShrink: 0 }}>

                {/* Categorici */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
                  {/* Coin */}
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ ...labelSt, marginBottom: 0, width: '40px', flexShrink: 0 }}>Coin</span>
                    {COINS.map(c => (
                      <button key={c} onClick={() => toggleCat('coins', c)} style={chipSt(advFilters.coins.includes(c))}>
                        {c}
                      </button>
                    ))}
                  </div>
                  {/* Pattern */}
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ ...labelSt, marginBottom: 0, width: '40px', flexShrink: 0 }}>Pattern</span>
                    {PATTERNS.map(p => (
                      <button key={p.value} onClick={() => toggleCat('patterns', p.value)} style={chipSt(advFilters.patterns.includes(p.value))}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {/* TF + Dir */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      <span style={{ ...labelSt, marginBottom: 0, width: '40px', flexShrink: 0 }}>TF</span>
                      {TF_OPTIONS.map(t => (
                        <button key={t} onClick={() => toggleCat('tfs', t)} style={chipSt(advFilters.tfs.includes(t))}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      <span style={{ ...labelSt, marginBottom: 0, width: '24px', flexShrink: 0 }}>Dir</span>
                      <button onClick={() => toggleCat('dirs', 'LONG')} style={chipSt(advFilters.dirs.includes('LONG'), 'var(--color-long-bright, #4a9)')}>↑</button>
                      <button onClick={() => toggleCat('dirs', 'SHORT')} style={chipSt(advFilters.dirs.includes('SHORT'), 'var(--color-short-bright, #a44)')}>↓</button>
                    </div>
                  </div>
                </div>

                {/* Numerici */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {NUM_COLS.map(c => (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', minWidth: '28px' }}>{c.label}</span>
                      <select
                        value={advFilters.num[c.key].op}
                        onChange={e => setNum(c.key, 'op', e.target.value)}
                        style={opSt}
                      >
                        <option value="">—</option>
                        <option value=">">{'>'}</option>
                        <option value=">=">{'>='}</option>
                        <option value="<">{'<'}</option>
                        <option value="<=">{'<='}</option>
                      </select>
                      <input
                        type="number"
                        placeholder="—"
                        value={advFilters.num[c.key].val}
                        onChange={e => setNum(c.key, 'val', e.target.value)}
                        style={valSt}
                      />
                      {c.pct && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)' }}>%</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabella griglia */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              {!gridLoaded && !gridLoading && (
                <div style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)', opacity: 0.6 }}>
                  Premi Carica per caricare la griglia.
                </div>
              )}
              {gridLoading && (
                <div style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>Caricamento…</div>
              )}
              {!gridLoading && gridLoaded && displayRows.length === 0 && (
                <div style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)', opacity: 0.6 }}>Nessun risultato con i filtri attivi.</div>
              )}
              {!gridLoading && displayRows.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Coin', 'Pattern', 'TF', 'Dir', 'BTC', 'N', 'WR10', 'PF10', 'WR20', 'PF20', 'WR30', 'PF30', '+', '+BTC'].map(h => (
                        <th key={h} style={{ padding: '4px 4px', textAlign: 'left', color: 'var(--color-text-dim)', fontWeight: 400, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r, i) => {
                      const alreadyAdded = stelle.some(s => s.coin === r.coin && s.pattern === r.pattern && s.tf === r.tf && s.side === r.side && s.btcRegime === '');
                      const targetRegime = scoreToBtcRegime(r.btc_score);
                      const alreadyAddedWithRegime = stelle.some(s => s.coin === r.coin && s.pattern === r.pattern && s.tf === r.tf && s.side === r.side && s.btcRegime === targetRegime);
                      const isLong = r.side === 'LONG';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(201,168,76,0.05)', transition: 'background 150ms' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(201,168,76,0.04)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                          <td style={{ padding: '3px 5px 3px 4px', color: 'var(--color-gold)', whiteSpace: 'nowrap', minWidth: '28px' }}>{r.coin}</td>
                          <td style={{ padding: '3px 4px', color: 'var(--color-text)', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patternLabel(r.pattern)}</td>
                          <td style={{ padding: '3px 4px', color: 'var(--color-text-dim)' }}>{r.tf}</td>
                          <td style={{ padding: '3px 4px', fontSize: '11px', lineHeight: 1, color: isLong ? 'var(--color-long-bright, #4a9)' : 'var(--color-short-bright, #a44)' }}>
                            {isLong ? '↑' : '↓'}
                          </td>
                          <td style={{ padding: '3px 4px', color: 'var(--color-text-dim)' }}>{r.btc_score}</td>
                          <td style={{ padding: '3px 4px', color: 'var(--color-text-dim)' }}>{r.n}</td>
                          <td style={{ padding: '3px 4px', color: colorWr(r.wr10), fontWeight: 500 }}>
                            {r.wr10 != null ? `${r.wr10.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', color: r.pf10 != null && r.pf10 >= 1.5 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text-dim)' }}>
                            {r.pf10 != null ? r.pf10.toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', color: colorWr(r.wr20) }}>
                            {r.wr20 != null ? `${r.wr20.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', color: r.pf20 != null && r.pf20 >= 1.5 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text-dim)' }}>
                            {r.pf20 != null ? r.pf20.toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', color: colorWr(r.wr30) }}>
                            {r.wr30 != null ? `${r.wr30.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', color: r.pf30 != null && r.pf30 >= 1.5 ? 'var(--color-long-bright, #4a9)' : 'var(--color-text-dim)' }}>
                            {r.pf30 != null ? r.pf30.toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '3px 4px' }}>
                            <button
                              onClick={() => addStellaFromGrid(r)}
                              disabled={alreadyAdded || !canAdd}
                              title={alreadyAdded ? 'Già aggiunta (qualsiasi BTC)' : !canAdd ? 'Costellazione piena' : 'Aggiungi — qualsiasi BTC regime'}
                              style={{
                                background: 'transparent', border: '1px solid',
                                borderColor: alreadyAdded ? 'var(--color-border)' : 'rgba(201,168,76,0.3)',
                                color: alreadyAdded ? 'var(--color-text-dim)' : 'var(--color-gold)',
                                cursor: alreadyAdded || !canAdd ? 'default' : 'pointer',
                                padding: '1px 5px', fontSize: '9px', opacity: alreadyAdded || !canAdd ? 0.3 : 1,
                              }}
                            >
                              {alreadyAdded ? '✓' : '+'}
                            </button>
                          </td>
                          <td style={{ padding: '3px 4px' }}>
                            <button
                              onClick={() => addStellaFromGridWithRegime(r)}
                              disabled={alreadyAddedWithRegime || !canAdd}
                              title={alreadyAddedWithRegime ? `Già aggiunta (${targetRegime})` : !canAdd ? 'Costellazione piena' : `Aggiungi — solo BTC ${targetRegime} (score ${r.btc_score})`}
                              style={{
                                background: 'transparent', border: '1px solid',
                                borderColor: alreadyAddedWithRegime ? 'var(--color-border)' : targetRegime === 'bull' ? 'rgba(45,122,79,0.4)' : 'rgba(122,45,45,0.4)',
                                color: alreadyAddedWithRegime ? 'var(--color-text-dim)' : targetRegime === 'bull' ? 'var(--color-long-bright)' : 'var(--color-short-bright)',
                                cursor: alreadyAddedWithRegime || !canAdd ? 'default' : 'pointer',
                                padding: '1px 5px', fontSize: '9px', opacity: alreadyAddedWithRegime || !canAdd ? 0.3 : 1,
                              }}
                            >
                              {alreadyAddedWithRegime ? '✓' : '+'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
