import { useEffect, useState } from 'react';
import type { CoinSnapshots } from './WatchlistSnapshot';
import styles from './WatchlistPanel.module.css';
export interface Preferences {
  bias_alert: boolean; scenario_alert: boolean; level_alert: boolean; plan_alert: boolean;
  cooldown_minutes: number; level: number | null; tf: string; expected_bias: string;
  scenario_key: string; note: string;
}
export interface Notice { id: number; coin: string; captured_at: number; messages: string[]; }
const empty: Preferences = { bias_alert:false, scenario_alert:false, level_alert:false, plan_alert:false,
  cooldown_minutes:60, level:null, tf:'1h', expected_bias:'', scenario_key:'', note:'' };
const date = (ts: number) => new Date(ts).toLocaleString('it-IT', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function WatchlistOverview({ coins, snapshots, notices, onOpenCoin }: {
  coins: string[]; snapshots: Record<string,CoinSnapshots>; notices: Notice[]; onOpenCoin:(coin:string)=>void;
}) {
  const rows = coins.map(coin => {
    const s = snapshots[coin]?.latest;
    const values = Object.values(s?.bias ?? {}).map(v=>v.toUpperCase());
    const longs = values.filter(v=>v==='LONG').length, shorts = values.filter(v=>v==='SHORT').length;
    return { coin, s, longs, shorts, agreement:Math.max(longs,shorts), stale: !s || Date.now()-s.captured_at>7200000 };
  }).sort((a,b)=>Number(a.stale)-Number(b.stale) || b.agreement-a.agreement || a.coin.localeCompare(b.coin));
  return <div className={styles.overview}>
    <h2>Cosa è cambiato nel tuo mercato</h2>
    <p className={styles.note}>Confronto con il rilevamento precedente di ciascuna coin. Gli orari possono essere diversi.</p>
    {rows.map(({coin,s,stale}) => <p key={coin}><button onClick={()=>onOpenCoin(coin)}>{coin}</button>{' '}
      {!s ? 'In attesa di analisi' : <>{date(s.captured_at)}{stale?' · Dati da aggiornare':''} · {!s.changes ? 'Primo rilevamento' :
        `${s.changes.bias.length} cambi di bias · ${s.changes.appeared.length} scenari comparsi · ${s.changes.absent.length} usciti dal riepilogo · ${s.changes.updated.length} aggiornati`}</>}
    </p>)}
    <h2>Confronto delle conferme</h2>
    <p className={styles.note}>Conta i bias LONG/SHORT concordanti sui quattro timeframe. Non è una probabilità di successo. I bias neutrali o mancanti non sono conferme.</p>
    <div className={styles.tableWrap}><table><thead><tr><th>Coin</th><th>Rialzisti</th><th>Ribassisti</th><th>Concordanti</th><th>Conflitto</th><th>Rilevamento</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.coin}><td>{r.coin}</td><td>{r.s?r.longs:'—'}</td><td>{r.s?r.shorts:'—'}</td><td>{r.s?`${r.agreement}/4`:'—'}</td><td>{r.s?(r.longs&&r.shorts?'Sì':'No'):'—'}</td><td>{r.s?`${date(r.s.captured_at)}${r.stale?' · Da aggiornare':''}`:'In attesa'}</td></tr>)}</tbody></table></div>
    <h2>I tuoi avvisi</h2>
    <p className={styles.note}>Avvisi nella watchlist, generati dai riepiloghi periodici. I livelli sono confrontati tra prezzi rilevati: possono non rilevare tocchi e rientri tra due analisi.</p>
    {!notices.length?<p>Nessun avviso. Configura quelli che ti interessano nel piano di ogni coin.</p>:<ul className={styles.notices}>{notices.map(n=><li key={n.id}><strong>{n.coin} · {date(n.captured_at)}</strong>{n.messages.map((m,i)=><p key={i}>{m}</p>)}</li>)}</ul>}
  </div>;
}
export function ObservationPlan({ coin, data, saved, disabled, onSave }: {
  coin:string; data?:CoinSnapshots; saved?:Preferences; disabled:boolean; onSave:(p:Preferences)=>void;
}) {
  const [p,setP] = useState<Preferences>(saved??empty);
  useEffect(()=>setP(saved??empty),[saved,coin]);
  const latest=data?.latest;
  const update=(patch:Partial<Preferences>)=>setP(v=>({...v,...patch}));
  const scenario = latest?.scenarios.find(s=>s.key===p.scenario_key);
  const actual = latest?.bias[p.tf]?.toUpperCase();
  return <details className={styles.plan}><summary>Piano di osservazione e alert</summary>
    {saved && <div className={styles.planStatus}><strong>Condizioni del piano salvato</strong>
      {!latest?<p>Analisi non disponibile</p>:<>
        <p>Rilevato il {date(latest.captured_at)}{Date.now()-latest.captured_at>7200000?' · Dati da aggiornare':''}</p>
        {saved.scenario_key && <p>{latest.scenarios.some(s=>s.key===saved.scenario_key)?'Scenario presente nel riepilogo':'Scenario assente dal riepilogo: verifica l’analisi completa'}</p>}
        {saved.expected_bias && <p>{!['LONG','SHORT'].includes(latest.bias[saved.tf]?.toUpperCase())?'Bias non disponibile o neutrale':latest.bias[saved.tf]?.toUpperCase()===saved.expected_bias?'Bias coerente con il piano':'Bias diverso da quello atteso'}</p>}
        {saved.level!==null && <p>Livello osservato: {saved.level} USDT</p>}
        {saved.note && <p>{saved.note}</p>}
      </>}
    </div>}
    <form onSubmit={e=>{e.preventDefault();onSave(p);}}>
      <fieldset disabled={disabled}><legend>Condizioni per {coin}</legend>
      <label>Scenario da osservare<select value={p.scenario_key} onChange={e=>update({scenario_key:e.target.value})}><option value="">Nessuno</option>
        {p.scenario_key&&!scenario&&<option value={p.scenario_key}>Scenario salvato, ora assente dal riepilogo</option>}
        {latest?.scenarios.map(s=><option key={s.key} value={s.key}>{s.name} · {s.tf} · {s.direction}</option>)}</select></label>
      <label>Timeframe<select value={p.tf} onChange={e=>update({tf:e.target.value})}>{['15m','1h','4h','1d'].map(tf=><option key={tf}>{tf}</option>)}</select></label>
      <label>Bias atteso<select value={p.expected_bias} onChange={e=>update({expected_bias:e.target.value})}><option value="">Nessuno</option><option value="LONG">Rialzista</option><option value="SHORT">Ribassista</option></select></label>
      {p.expected_bias&&<p className={styles.note}>Bias rilevato su {p.tf}: {actual??'non disponibile'}</p>}
      <label>Livello di prezzo (USDT)<input type="number" step="any" min="0.000000000001" value={p.level??''} onChange={e=>update({level:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label>Nota personale<textarea maxLength={500} value={p.note} onChange={e=>update({note:e.target.value})}/></label>
      <legend>Avvisami quando</legend>
      {([['bias_alert','Cambia un bias'],['scenario_alert','Compare uno scenario nel riepilogo'],['level_alert','Il prezzo attraversa il livello'],['plan_alert','Cambiano le condizioni del piano']] as const).map(([key,label])=><label key={key} className={styles.check}><input type="checkbox" checked={p[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}</label>)}
      <label>Tempo minimo tra avvisi della coin<select value={p.cooldown_minutes} onChange={e=>update({cooldown_minutes:Number(e.target.value)})}>{[[60,'1 ora'],[240,'4 ore'],[720,'12 ore'],[1440,'24 ore']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      <button>Salva piano e alert</button>
      </fieldset>
    </form>
  </details>;
}
