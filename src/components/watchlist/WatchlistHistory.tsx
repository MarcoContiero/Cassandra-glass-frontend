import styles from './WatchlistPanel.module.css';
import type { CoinSnapshots } from './WatchlistSnapshot';
import { biasState, biasText, chronologicalHistory, compareSnapshots, priceChange } from './history';

const date = (ts: number) => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const price = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('it-IT', { maximumSignificantDigits: 7 }).format(value);
const pct = (value: number | null) => value === null ? 'Non disponibile' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const count = (value: number, singular: string, plural: string) => `${value} ${value === 1 ? singular : plural}`;
const tfMinutes = (tf: string) => { const match = tf.match(/^(\d+)(m|h|d|w)$/); return match ? Number(match[1]) * ({m:1,h:60,d:1440,w:10080}[match[2]] ?? 1) : Infinity; };

export default function WatchlistHistory({ data }: { data: CoinSnapshots }) {
  const history = chronologicalHistory(data);
  if (history.length < 2) return <p className={styles.note}>La linea temporale sarà disponibile dal secondo rilevamento.</p>;
  const first = history[0], last = history[history.length - 1];
  const tfs = [...new Set(history.flatMap(s => Object.keys(s.bias)))].sort((a,b) => tfMinutes(a) - tfMinutes(b));
  const net = priceChange(first.price, last.price);
  return <section className={styles.history} aria-label="Evoluzione recente di Cassandra">
    <h3>Evoluzione recente</h3>
    <p className={styles.note}>{date(first.captured_at)} → {date(last.captured_at)} · {history.length} rilevamenti</p>
    <div className={styles.historyPrice}><span>Prezzo nello stesso intervallo</span><strong>{pct(net)}</strong><small>{price(first.price)} → {price(last.price)} USDT</small></div>
    <p className={styles.note}>Ogni punto è un’analisi salvata, dal più vecchio al più recente. Gli intervalli possono avere durate diverse.</p>
    <div className={styles.biasLegend}><span className={styles.long}>● Rialzista</span><span className={styles.short}>● Ribassista</span><span className={styles.neutral}>● Neutrale</span><span>○ Dato assente</span></div>
    <div className={styles.timelineScroll} tabIndex={0} role="region" aria-label="Linea temporale del bias per timeframe, scorribile">
      <table className={styles.timeline}><caption>Bias per timeframe e prezzo di ciascun rilevamento</caption><thead><tr><th scope="col">TF</th>{history.map(s => <th scope="col" key={s.captured_at}><time dateTime={new Date(s.captured_at).toISOString()}>{date(s.captured_at)}</time></th>)}</tr></thead>
        <tbody>{tfs.map(tf => <tr key={tf}><th scope="row">{tf}</th>{history.map(s => <td key={s.captured_at}><span className={`${styles.biasDot} ${styles[biasState(s.bias[tf])]}`} title={`${date(s.captured_at)} · ${tf}: ${biasText(s.bias[tf])}`}><span className={styles.srOnly}>{biasText(s.bias[tf])}</span>{biasState(s.bias[tf]) === 'missing' ? '○' : '●'}</span></td>)}</tr>)}
          <tr><th scope="row">USDT</th>{history.map(s => <td key={s.captured_at}>{price(s.price)}</td>)}</tr>
        </tbody></table>
    </div>
    <details className={styles.historyDetails}><summary>Esplora i cambiamenti tra due analisi</summary>
      <p className={styles.note}>Confronto dei primi 12 scenari per punteggio. Uscire dal riepilogo non significa essere invalidato.</p>
      {[...history].reverse().slice(0,-1).map(after => {
        const before = history[history.indexOf(after) - 1];
        const c = compareSnapshots(before, after);
        return <details key={after.captured_at} className={styles.historyStep}>
          <summary><span>{date(before.captured_at)} → {date(after.captured_at)}</span><span>Prezzo {pct(c.price_pct)} · {count(c.bias.length, 'cambio di bias', 'cambi di bias')} · {count(c.appeared.length, 'comparso', 'comparsi')} · {count(c.absent.length, 'uscito', 'usciti')} · {count(c.updated.length, 'aggiornato', 'aggiornati')}</span></summary>
          <p>{price(before.price)} → {price(after.price)} USDT</p>
          {c.bias.map(b => <p key={b.tf}><strong>{b.tf}</strong> · {biasText(b.before)} → {biasText(b.after)}</p>)}
          {c.appeared.map(s => <p key={'new'+s.key}>Comparso: {s.name} · {s.tf} · {biasText(s.direction)}</p>)}
          {c.absent.map(s => <p key={'out'+s.key}>Uscito dal riepilogo: {s.name} · {s.tf}</p>)}
          {c.updated.map(s => { const old = before.scenarios.find(p => p.key === s.key)!; return <div key={'update'+s.key}><p>Aggiornato: {s.name} · {s.tf}</p><ul>
            {old.score !== s.score && <li>Punteggio {old.score ?? '—'} → {s.score ?? '—'}</li>}
            {(['entry','stop','tp1'] as const).filter(k => old[k] !== s[k]).map(k => <li key={k}>{{entry:'Riferimento',stop:'Stop',tp1:'Primo obiettivo'}[k]} {price(old[k])} → {price(s[k])} USDT</li>)}
            {old.direction !== s.direction && <li>Direzione {biasText(old.direction)} → {biasText(s.direction)}</li>}
          </ul></div>; })}
          {!c.bias.length && !c.appeared.length && !c.absent.length && !c.updated.length && <p>Bias e scenari del riepilogo invariati.</p>}
        </details>;
      })}
    </details>
  </section>;
}
