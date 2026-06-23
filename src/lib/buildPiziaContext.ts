/**
 * Estrae un riassunto testuale compatto dall'analisi Cassandra
 * da passare a Pizia come contesto.
 */
export function buildPiziaContextText(result: any): string {
  if (!result) return '';
  const lines: string[] = [];

  // Symbol + prezzo
  const symbol =
    result.symbol ||
    result.coin ||
    result._meta?.coin ||
    result._meta?.symbol ||
    '';
  const price =
    result.prezzo_corrente ??
    result.prezzo ??
    result.last_price ??
    result.price;
  if (symbol) lines.push(`Simbolo: ${symbol}`);
  if (price !== undefined && price !== null) lines.push(`Prezzo corrente: ${price}`);

  // Direzione sintetica e score
  const dir = result.direzione_sintetica || result.direzione;
  if (dir) lines.push(`Direzione sintetica: ${dir}`);
  const score = result.score_totale ?? result.score;
  if (score !== undefined && score !== null) lines.push(`Score totale: ${score}`);

  // Bias per TF
  const bias = result.bias_per_tf || result.trend_tf_score;
  if (bias && typeof bias === 'object') {
    const bLines = Object.entries(bias)
      .map(([tf, v]: [string, any]) => {
        if (v && typeof v === 'object') {
          const d = v.direzione || v.bias || v.label || '';
          const f = v.forza !== undefined ? ` ${v.forza}%` : '';
          return `  ${tf}: ${d}${f}`;
        }
        return `  ${tf}: ${v}`;
      })
      .filter(Boolean);
    if (bLines.length) lines.push('Bias per TF:\n' + bLines.join('\n'));
  }

  // Supporti/Resistenze (top 3 per lato)
  const sr = result.sr || result.supporti_resistenze || {};
  const supporti: any[] = Array.isArray(sr.supporti) ? sr.supporti.slice(0, 3) : [];
  const resistenze: any[] = Array.isArray(sr.resistenze) ? sr.resistenze.slice(0, 3) : [];
  if (supporti.length) {
    const vals = supporti.map((s: any) => s.price ?? s.level ?? s.value ?? s).join(', ');
    lines.push(`Supporti chiave: ${vals}`);
  }
  if (resistenze.length) {
    const vals = resistenze.map((r: any) => r.price ?? r.level ?? r.value ?? r).join(', ');
    lines.push(`Resistenze chiave: ${vals}`);
  }

  // Scenari attivi (top 3)
  const scenari: any[] = result.scenari_previsti || result.possibili_scenari || [];
  if (scenari.length) {
    const top = scenari.slice(0, 3).map((s: any) => {
      const nome = s.nome || s.scenario || s.type || s.classe || '';
      const side = s.side || s.direzione || s.direction || '';
      const rr = s.rr !== undefined ? ` RR:${s.rr}` : '';
      return `${nome}${side ? ` (${side})` : ''}${rr}`;
    }).join('; ');
    lines.push(`Scenari attivi: ${top}`);
  }

  // Strategia AI (prima voce significativa)
  const strat = result.strategia_ai;
  if (Array.isArray(strat) && strat.length) {
    const first = strat[0];
    const txt = first?.testo || first?.text || first?.narrativa || '';
    if (txt) lines.push(`Strategia AI: ${String(txt).slice(0, 200)}`);
  }

  // Ciclica (narrativa gassosa)
  const ciclica = result.ciclica;
  if (ciclica?.narrativa_gassosa) {
    lines.push(`Analisi ciclica: ${String(ciclica.narrativa_gassosa).slice(0, 400)}`);
  }

  // Longshort
  const ls = result.longshort;
  if (ls && typeof ls === 'object') {
    const lsLine = ls.sintesi || ls.label || ls.bias || ls.direzione || '';
    if (lsLine) lines.push(`Long/Short bias: ${lsLine}`);
  }

  // Alert (top 2)
  const alerts: any[] = result.alerts || [];
  if (alerts.length) {
    const top = alerts.slice(0, 2)
      .map((a: any) => a.messaggio || a.message || a.tipo || a.label || '')
      .filter(Boolean)
      .join('; ');
    if (top) lines.push(`Alert: ${top}`);
  }

  return lines.join('\n');
}
