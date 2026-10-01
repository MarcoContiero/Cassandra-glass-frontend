 'use client';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import styles from './WatchlistPanel.module.css';
import WatchlistSnapshot, { type CoinSnapshots } from './WatchlistSnapshot';
import { WatchlistOverview, ObservationPlan, type Preferences, type Notice } from './WatchlistWorkspace';

export default function WatchlistPanel({ onOpenCoin, onPiziaContext }: {
  onOpenCoin: (coin: string) => void; onPiziaContext: (context: string) => void;
}) {
  const { user } = useUser();
  const [snapshots, setSnapshots] = useState<Record<string, CoinSnapshots>>({});
  const [settings, setSettings] = useState<Record<string, Preferences>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [coins, setCoins] = useState<string[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | null>(5);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setCoins([]); setSnapshots({}); setSettings({}); setNotices([]); setLoading(true); setError(''); busy.current = false;
    if (!user?.id) return () => { controller.abort(); generation.current++; };
    (async () => {
      try {
        const saved = await fetch('/api/user/watchlist', { cache: 'no-store', signal: controller.signal });
        if (!saved.ok) throw new Error('Impossibile caricare la watchlist. Riprova riaprendo la scheda.');
        const data = await saved.json();
        if (current !== generation.current) return;
        setCoins(data.coins); setLimit(data.limit); setAvailable(data.available_coins ?? []); setSnapshots(data.snapshots ?? {}); setSettings(data.settings ?? {}); setNotices(data.notices ?? []);
      } catch (e) {
        if (current === generation.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Errore di caricamento');
      } finally { if (current === generation.current) setLoading(false); }
    })();
    return () => { controller.abort(); generation.current++; };
  }, [user?.id, refreshVersion]);
  useEffect(() => {
    const context = coins.map(coin => {
      const latest = snapshots[coin]?.latest;
      return { coin, observation_plan: settings[coin] ?? null, latest: latest ? { captured_at: latest.captured_at, price: latest.price,
        bias: latest.bias, scenarios: latest.scenarios.slice(0, 3), scenario_count: latest.scenario_count,
        price_change_pct: latest.changes?.price_pct ?? null, bias_changes: latest.changes?.bias ?? [],
        scenario_changes: latest.changes ? { appeared: latest.changes.appeared.length,
          absent: latest.changes.absent.length, updated: latest.changes.updated.length } : null } : null };
    });
    onPiziaContext(`Watchlist personale. Snapshot orari delle analisi Cassandra, non dati tick in tempo reale. Le variazioni confrontano i primi 12 scenari per punteggio; assenza dal riepilogo non implica invalidazione. Non inventare dati se latest è null. Gli alert sono in-app e confrontano rilevamenti orari; un attraversamento non rileva tutti i tocchi introra. Concordanza = massimo dei bias LONG o SHORT sui 4 timeframe, non probabilità. Dati: ${JSON.stringify(context)}; ultimi avvisi: ${JSON.stringify(notices.slice(0,5))}`);
  }, [coins, snapshots, settings, notices, onPiziaContext]);
  async function save(next: string[], preferences?: Record<string, Preferences>) {
    if (busy.current || loading) return;
    busy.current = true; setSaving(true); setError('');
    const current = generation.current;
    try {
      const response = await fetch('/api/user/watchlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coins: next, ...(preferences ? {settings: preferences} : {}) }) });
      if (!response.ok) { const failure = await response.json().catch(()=>null); throw new Error(typeof failure?.detail === 'string' ? failure.detail : 'Salvataggio non riuscito. Le impostazioni precedenti sono state mantenute.'); }
      const data = await response.json();
      if (current === generation.current) { setCoins(data.coins); setLimit(data.limit); setSelected(''); setRefreshVersion(v => v + 1); }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Errore di salvataggio'); }
    finally { if (current === generation.current) { busy.current = false; setSaving(false); } }
  }
  const atLimit = limit !== null && coins.length >= limit;
  return <section className={styles.panel} aria-labelledby="watchlist-title">
    <div className={styles.heading}><span>IL TUO MERCATO</span><h1 id="watchlist-title">Watchlist</h1>
      <p>Le coin che vuoi seguire, raccolte in un unico posto. Apri Cassandra per approfondire il contesto di ciascuna.</p></div>
    <form className={styles.controls} onSubmit={e => { e.preventDefault(); if (!atLimit && selected && !coins.includes(selected)) void save([...coins, selected]); }}>
      <label htmlFor="watchlist-coin">Aggiungi una coin</label>
      <select id="watchlist-coin" value={selected} onChange={e => setSelected(e.target.value)} disabled={loading || saving || atLimit || !available.length}>
        <option value="">Scegli una coin</option>{available.filter(c => !coins.includes(c)).map(c => <option key={c}>{c}</option>)}
      </select><button disabled={!selected || loading || saving || atLimit}>Aggiungi</button>
    </form>
    <button disabled={loading || saving} onClick={() => setRefreshVersion(v => v + 1)}>Aggiorna riepilogo salvato</button>
    <p className={styles.note}>Snapshot al massimo ogni ora, dalle analisi periodiche già eseguite · Conservazione 7 giorni · Qui sono disponibili gli ultimi 12 rilevamenti. Il pulsante rilegge i dati salvati.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div role="status" className={styles.status}>{loading ? 'Caricamento…' : saving ? 'Salvataggio…' : error ? 'Controlla il messaggio di errore' : `${coins.length} / ${limit === null ? '∞' : limit} coin · Salvata sul tuo account`}</div>
    {!loading && atLimit && <p className={styles.note}>Hai raggiunto il limite del tuo piano. Rimuovi una coin per aggiungerne un’altra.</p>}
    {!loading && !coins.length && !error && <div className={styles.empty}>La tua watchlist è vuota. Aggiungi la prima coin per ritrovarla qui a ogni accesso.</div>}
    {!loading && coins.length > 0 && <WatchlistOverview coins={coins} snapshots={snapshots} notices={notices} onOpenCoin={onOpenCoin} />}
    <ul className={styles.grid}>{coins.map(coin => <li key={coin} className={styles.card}>
      <div><span className={styles.star} aria-hidden="true">★</span><strong>{coin}</strong></div>
      <WatchlistSnapshot data={snapshots[coin]} />
      <ObservationPlan coin={coin} data={snapshots[coin]} saved={settings[coin]} disabled={saving || loading} onSave={p=>void save(coins, {...settings, [coin]:p})} />
      <div className={styles.actions}><button onClick={() => onOpenCoin(coin)}>Apri analisi →</button>
        <button aria-label={`Rimuovi ${coin} dalla watchlist`} disabled={saving || loading} onClick={() => void save(coins.filter(c => c !== coin))}>Rimuovi</button></div>
    </li>)}</ul>
    <p className={styles.note}>La watchlist generale è indipendente dai filtri di Tifide e Agema.</p>
  </section>;
}
