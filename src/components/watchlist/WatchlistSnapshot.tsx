import styles from './WatchlistPanel.module.css';
export interface Scenario {
  key: string; tf: string; name: string; direction: string; score: number | null;
  entry: number | null; stop: number | null; tp1: number | null;
}
export interface Snapshot {
  captured_at: number; price: number | null; bias: Record<string, string>;
  scenarios: Scenario[]; scenario_count: number; truncated: boolean;
  changes: { price_pct: number | null; bias: {tf: string; before: string; after: string}[];
    appeared: Scenario[]; absent: Scenario[]; updated: Scenario[] } | null;
}
export interface CoinSnapshots { latest: Snapshot | null; history: Snapshot[]; }
const date = (ts: number) => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const price = (value: number | null) => value === null ? 'Non disponibile' : new Intl.NumberFormat('it-IT', { maximumSignificantDigits: 7 }).format(value);
const biasLabel = (value: string) => ({long: 'rialzista', short: 'ribassista', LONG: 'rialzista', SHORT: 'ribassista', neutral: 'neutrale'}[value] ?? value);
function Changes({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.changes;
  if (!c) return <p>Primo rilevamento disponibile: confronto non ancora disponibile.</p>;
  return <div className={styles.changes}>
    {c.price_pct !== null && <p>Prezzo: {c.price_pct > 0 ? '+' : ''}{c.price_pct.toFixed(2)}% dal rilevamento precedente</p>}
    {c.bias.map(b => <p key={b.tf}>{b.tf}: {biasLabel(b.before)} → {biasLabel(b.after)}</p>)}
    {c.appeared.map(s => <p key={'new'+s.key}>Comparso: {s.name} · {s.tf} · {s.direction}</p>)}
    {c.absent.map(s => <p key={'absent'+s.key}>Non più nel riepilogo: {s.name} · {s.tf}</p>)}
    {c.updated.map(s => <p key={'changed'+s.key}>Punteggio o livelli aggiornati: {s.name} · {s.tf}</p>)}
    {!c.bias.length && !c.appeared.length && !c.absent.length && !c.updated.length && <p>Bias e scenari del riepilogo invariati.</p>}
  </div>;
}
export default function WatchlistSnapshot({ data }: { data?: CoinSnapshots }) {
  const latest = data?.latest;
  if (!latest) return <p className={styles.note}>In attesa della prima analisi periodica. Puoi già aprire l’analisi completa.</p>;
  const stale = Date.now() - latest.captured_at > 2 * 60 * 60 * 1000;
  return <div className={styles.snapshot}>
    <div className={styles.price}>{price(latest.price)} <span>USDT</span></div>
    <p className={styles.note}>Rilevato il {date(latest.captured_at)}{stale ? ' · Dati da aggiornare' : ''}</p>
    <div className={styles.bias}>{Object.entries(latest.bias).map(([tf,b]) => <span key={tf}>{tf} · {biasLabel(b)}</span>)}</div>
    <h3>Scenari Cassandra</h3>
    {!latest.scenarios.length ? <p>Nessuno scenario nel riepilogo di questa analisi.</p> : latest.scenarios.slice(0,3).map(s => <div key={s.key} className={styles.scenario}>
      <strong>{s.name || 'Scenario'} · {s.tf} · {s.direction}</strong>
      <span>Punteggio {s.score ?? '—'} · Ingresso {price(s.entry)} · Stop {price(s.stop)}</span>
    </div>)}
    {(latest.scenarios.length > 3 || latest.truncated) && <p className={styles.note}>{latest.scenario_count} scenari complessivi · mostrati i primi 3 per punteggio</p>}
    <h3>Variazioni dall’analisi precedente</h3><Changes snapshot={latest} />
    <details className={styles.history}><summary>Storico recente ({data?.history.length ?? 0} rilevamenti)</summary>
      {data?.history.map(s => <div key={s.captured_at}><h4>{date(s.captured_at)} · {price(s.price)} USDT</h4><Changes snapshot={s} /></div>)}
    </details>
  </div>;
}
