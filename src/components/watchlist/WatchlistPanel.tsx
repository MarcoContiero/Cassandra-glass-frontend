 'use client';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import styles from './WatchlistPanel.module.css';

export default function WatchlistPanel({ onOpenCoin, onPiziaContext }: {
  onOpenCoin: (coin: string) => void; onPiziaContext: (context: string) => void;
}) {
  const { user } = useUser();
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
    setCoins([]); setLoading(true); setError(''); busy.current = false;
    if (!user?.id) return () => { controller.abort(); generation.current++; };
    (async () => {
      try {
        const [saved, config] = await Promise.all([
          fetch('/api/user/watchlist', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/config/coins', { cache: 'no-store', signal: controller.signal }),
        ]);
        if (!saved.ok || !config.ok) throw new Error('Impossibile caricare la watchlist. Riprova riaprendo la scheda.');
        const [data, options] = await Promise.all([saved.json(), config.json()]);
        if (current !== generation.current) return;
        setCoins(data.coins); setLimit(data.limit); setAvailable(options.coins);
      } catch (e) {
        if (current === generation.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Errore di caricamento');
      } finally { if (current === generation.current) setLoading(false); }
    })();
    return () => { controller.abort(); generation.current++; };
  }, [user?.id]);
  useEffect(() => {
    onPiziaContext(`Watchlist generale personale: ${coins.join(', ') || 'vuota'}. Nessuna analisi di mercato caricata in questa scheda: non dedurre prezzi o scenari dall’elenco.`);
  }, [coins, onPiziaContext]);
  async function save(next: string[]) {
    if (busy.current || loading) return;
    busy.current = true; setSaving(true); setError('');
    const current = generation.current;
    try {
      const response = await fetch('/api/user/watchlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coins: next }) });
      if (!response.ok) throw new Error('Salvataggio non riuscito. La watchlist precedente è stata mantenuta.');
      const data = await response.json();
      if (current === generation.current) { setCoins(data.coins); setLimit(data.limit); setSelected(''); }
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
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div role="status" className={styles.status}>{loading ? 'Caricamento…' : saving ? 'Salvataggio…' : error ? 'Controlla il messaggio di errore' : `${coins.length} / ${limit === null ? '∞' : limit} coin · Salvata sul tuo account`}</div>
    {!loading && atLimit && <p className={styles.note}>Hai raggiunto il limite del tuo piano. Rimuovi una coin per aggiungerne un’altra.</p>}
    {!loading && !coins.length && !error && <div className={styles.empty}>La tua watchlist è vuota. Aggiungi la prima coin per ritrovarla qui a ogni accesso.</div>}
    <ul className={styles.grid}>{coins.map(coin => <li key={coin} className={styles.card}>
      <div><span className={styles.star} aria-hidden="true">★</span><strong>{coin}</strong></div>
      <div className={styles.actions}><button onClick={() => onOpenCoin(coin)}>Apri analisi →</button>
        <button aria-label={`Rimuovi ${coin} dalla watchlist`} disabled={saving || loading} onClick={() => void save(coins.filter(c => c !== coin))}>Rimuovi</button></div>
    </li>)}</ul>
    <p className={styles.note}>La watchlist generale è indipendente dai filtri di Tifide e Agema.</p>
  </section>;
}
