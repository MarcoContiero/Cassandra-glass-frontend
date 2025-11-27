// src/lib/extractors.ts

/* ────────────────────────────── Utils base ────────────────────────────── */
export const pick = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  
  export function unwrapRisposte(r: any) {
    return (r?.risposte ?? r) ?? {};
  }
  
  /* ────────────────────────────── Tipi ──────────────────────────────────── */
  export type LiquidityItem = {
    price: number;
    tf?: string;
    fonte?: string;
    forza?: number; // forza della pool
  };
  
  /* ────────────────────────────── Helpers numerici ──────────────────────── */
  function toNum(x: unknown): number | null {
    if (x == null) return null;
    const n = Number(String(x).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  
  // minimo "nice" ≥ x dalla serie {1,2,5,10} * 10^k
  function nextNiceAtLeast(x: number): number {
    if (x <= 0) return 0;
    const pow = Math.pow(10, Math.floor(Math.log10(x)));
    const cands = [1, 2, 5, 10].map((m) => m * pow);
    for (const c of cands) if (c >= x) return c;
    return 10 * pow;
  }
  
  // step dinamico basato su 1% con bias verso 10^k
  function dynamicRoundStep(price: number): number {
    const onePct = Math.abs(price) * 0.01;
    if (onePct === 0) return 1;
    const nice = nextNiceAtLeast(onePct);
    const pow10 = Math.pow(10, Math.ceil(Math.log10(onePct)));
    return pow10 <= 2 * nice ? pow10 : nice;
  }
  
  function decimalsForStep(step: number): number {
    if (step >= 1) return 0;
    return Math.max(0, Math.ceil(-Math.log10(step)));
  }
  
  /* ────────────────────────────── Normalizzazione item ──────────────────── */
  function nrmItem(v: any, tf?: string, fonte?: string): LiquidityItem | null {
    if (v == null) return null;
  
    // numero semplice
    if (typeof v === 'number' || /^[\d.,-]+$/.test(String(v))) {
      const n = toNum(v);
      return Number.isFinite(n) ? { price: n as number, tf, fonte } : null;
    }
  
    // oggetto comune
    const p = toNum(v.price ?? v.prezzo ?? v.valore ?? v.livello ?? v.level);
    if (!Number.isFinite(p)) return null;
    const _tf = String(v.tf ?? v.timeframe ?? tf ?? '').trim() || undefined;
    const src =
      v.fonte ??
      v.source ??
      v.src ??
      v.tipo ??
      v.type ??
      (Array.isArray(v.tag) ? v.tag.join(', ') : v.tag) ??
      fonte;
  
    const rawForza =
      v.forza ?? v.strength ?? v.score ?? v.punteggio ?? v.weight ?? v.qty ?? v.amount;
    const forza = Number(rawForza);
  
    return {
      price: p as number,
      tf: _tf,
      fonte: src,
      ...(Number.isFinite(forza) ? { forza } : {}),
    };
  }
  
  function addMany(out: LiquidityItem[], arr: any, tf?: string, fonte?: string) {
    if (!arr) return;
    if (Array.isArray(arr)) {
      for (const v of arr) {
        const it = nrmItem(v, tf, fonte);
        if (it) out.push(it);
      }
    } else {
      const it = nrmItem(arr, tf, fonte);
      if (it) out.push(it);
    }
  }
  
  /* ────────────────────────────── Pesi per stima forza ─────────────────── */
  function srcWeight(fonte?: string): number {
    const s = (fonte ?? '').toUpperCase();
    if (s.includes('FVG')) return 3;
    if (s.includes('EQH') || s.includes('EQL') || s.includes('SWING')) return 3;
    if (s.includes('OB') || s.includes('ORDER') || s.includes('SUPPLY') || s.includes('DEMAND')) return 3;
    if (s.includes('VPVR') || s.includes('POC') || s.includes('VOLUME')) return 3;
    if (s.includes('SR')) return 2;
    if (s.includes('VWAP')) return 2;
    if (s.includes('ROUND')) return 1;
    return 1;
  }
  function tfWeight(tf?: string): number {
    const t = (tf ?? '').toLowerCase();
    if (/\b1w\b|weekly/.test(t)) return 3;
    if (/\b1d\b|daily/.test(t)) return 2;
    if (/\b4h\b/.test(t)) return 1.5;
    if (/\b1h\b/.test(t)) return 1.2;
    return 1; // 15m o sconosciuto
  }
  function ensureStrength(it: LiquidityItem): LiquidityItem {
    if (Number.isFinite(it.forza as number)) return it;
    const w = srcWeight(it.fonte) * tfWeight(it.tf);
    return { ...it, forza: w };
  }
  
  /* ────────────────────────────── Merge vicini + somma forza ───────────── */
  function groupMerge(items: LiquidityItem[], tol: number = 0.5): LiquidityItem[] {
    if (items.length === 0) return items;
    const sorted = [...items].sort((a, b) => a.price - b.price);
    const out: LiquidityItem[] = [];
    let cur = { ...ensureStrength(sorted[0]) } as LiquidityItem & {
      _src?: Set<string>;
      _tf?: Set<string>;
    };
    cur._src = new Set(cur.fonte ? [cur.fonte] : []);
    cur._tf = new Set(cur.tf ? [cur.tf] : []);
  
    for (let i = 1; i < sorted.length; i++) {
      const it = ensureStrength(sorted[i]);
      if (Math.abs(it.price - cur.price) <= tol) {
        cur.forza = (cur.forza ?? 0) + (it.forza ?? 0);
        cur._src!.add(it.fonte ?? '');
        cur._tf!.add(it.tf ?? '');
        cur.price = (cur.price + it.price) / 2; // media semplice
      } else {
        out.push({
          price: cur.price,
          forza: Math.round(cur.forza ?? 0),
          fonte: Array.from(cur._src!).filter(Boolean).join('/'),
          tf: Array.from(cur._tf!).filter(Boolean).join(', '),
        });
        cur = { ...it, _src: new Set(it.fonte ? [it.fonte] : []), _tf: new Set(it.tf ? [it.tf] : []) };
      }
    }
  
    out.push({
      price: cur.price,
      forza: Math.round(cur.forza ?? 0),
      fonte: Array.from(cur._src!).filter(Boolean).join('/'),
      tf: Array.from(cur._tf!).filter(Boolean).join(', '),
    });
  
    return out;
  }
  
  function uniqSort(items: LiquidityItem[]): LiquidityItem[] {
    // dedup + somma forza su prezzi vicini
    return groupMerge(items, 0.5).sort((a, b) => a.price - b.price);
  }
  
  /* ────────────────────────────── Riconoscimento "liquidità" in S/R ────── */
  function normText(s: string): string {
    return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function isLiquidityLikeText(t: string) {
    const x = normText(t);
    return /liquidit[aà]|liquidity|pool|equal\s*highs?|equal\s*lows?|eq\s*h|eq\s*l|sweep/.test(x);
  }
  function classifyNatureSR(l: any): string {
    const parts: string[] = [];
    const push = (v: unknown) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((x) => push(x));
      else parts.push(String(v));
    };
    push(l.tipo);
    push(l.type);
    push(l.source);
    push(l.src);
    push(l.origine);
    push(l.tag);
    push(l.pattern);
    push(l.scenario);
    push(l.note);
    return parts.join(' | ');
  }
  
  /* ────────────────────────────── Round dinamici 1% ─────────────────────── */
  function injectRoundLevels(
    above: LiquidityItem[],
    below: LiquidityItem[],
    price?: number | null,
    count: number = 6
  ) {
    if (!Number.isFinite(price as number)) return;
    const p = price as number;
    const step = dynamicRoundStep(p);
    const dp = decimalsForStep(step);
    const base = Math.floor(p / step) * step;
  
    // sotto
    for (let i = 0; i < count; i++) {
      const v = Number((base - i * step).toFixed(dp));
      if (v < p) below.push({ price: v, fonte: 'ROUND_1P', forza: 1 });
    }
    // sopra
    for (let i = 1; i <= count; i++) {
      const v = Number((base + i * step).toFixed(dp));
      if (v > p) above.push({ price: v, fonte: 'ROUND_1P', forza: 1 });
    }
  }
  
  /* ────────────────────────────── Filtra round legacy ───────────────────── */
  function isLegacyRound(fonte?: string): boolean {
    const s = (fonte ?? '').toUpperCase();
    if (!s.includes('ROUND')) return false;
    // teniamo solo i nuovi round dinamici "ROUND_1P"
    return !s.includes('ROUND_1P');
  }
  
  /* ────────────────────────────── EXTRACT: LIQUIDITÀ ────────────────────── */
  export function extractLiquidity(r: any): { sopra: LiquidityItem[]; sotto: LiquidityItem[] } {
    const x = unwrapRisposte(r);
    const outAbove: LiquidityItem[] = [];
    const outBelow: LiquidityItem[] = [];
  
    const candidate =
      pick(
        x,
        'zone_liquidita',
        'livelli_liquidita',
        'livelli_liquidità',
        'liquidity_levels',
        'liquidity',
        'pool_liquidita',
        'liquidity_per_tf',
        'liquidityByTf',
        'liquidity_by_tf'
      ) ?? {};
  
    // 1) { sopra/sotto } o { above/below }
    if (candidate?.sopra || candidate?.sotto || candidate?.above || candidate?.below) {
      addMany(outAbove, candidate.sopra ?? candidate.above, undefined, 'backend');
      addMany(outBelow, candidate.sotto ?? candidate.below, undefined, 'backend');
    }
  
    // 2) struttura per TF
    const perTf =
      candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? candidate
        : pick(x, 'liquidity_per_tf', 'liquidityByTf', 'liquidity_by_tf');
  
    if (perTf && typeof perTf === 'object' && !Array.isArray(perTf)) {
      for (const [tf, blocco] of Object.entries(perTf)) {
        if (!blocco) continue;
        if ((blocco as any).sopra || (blocco as any).sotto || (blocco as any).above || (blocco as any).below) {
          addMany(outAbove, (blocco as any).sopra ?? (blocco as any).above, tf, 'backend');
          addMany(outBelow, (blocco as any).sotto ?? (blocco as any).below, tf, 'backend');
        } else if (Array.isArray(blocco)) {
          for (const v of blocco) {
            const dir = (v?.dir ?? v?.direction ?? v?.side ?? '').toString().toLowerCase();
            if (dir.includes('abov') || dir === 'sopra') {
              const it = nrmItem(v, tf, 'backend');
              if (it) outAbove.push(it);
            } else if (dir.includes('bel') || dir === 'sotto') {
              const it = nrmItem(v, tf, 'backend');
              if (it) outBelow.push(it);
            }
          }
        }
      }
    }
  
    // 3) array piatto
    if (Array.isArray(candidate) && outAbove.length === 0 && outBelow.length === 0) {
      for (const v of candidate) {
        const dir = (v?.dir ?? v?.direction ?? v?.side ?? '').toString().toLowerCase();
        if (dir.includes('abov') || dir === 'sopra') {
          const it = nrmItem(v, undefined, 'backend');
          if (it) outAbove.push(it);
        } else if (dir.includes('bel') || dir === 'sotto') {
          const it = nrmItem(v, undefined, 'backend');
          if (it) outBelow.push(it);
        }
      }
    }
  
    // Fallback: deduci da Supporti/Resistenze con natura "liquidità"
    if (outAbove.length === 0 && outBelow.length === 0) {
      const prezzo = toNum(x.prezzo ?? x.price);
      const sup = Array.isArray(x.supporti) ? x.supporti : [];
      const res = Array.isArray(x.resistenze) ? x.resistenze : [];
  
      const consider = (arr: any[], dir: 'sotto' | 'sopra') => {
        for (const l of arr) {
          const p = toNum(l?.price ?? l?.prezzo ?? l?.valore);
          if (!Number.isFinite(p)) continue;
          if (Number.isFinite(prezzo)) {
            if (dir === 'sotto' && (p as number) >= (prezzo as number)) continue;
            if (dir === 'sopra' && (p as number) <= (prezzo as number)) continue;
          }
          const meta = classifyNatureSR(l);
          if (isLiquidityLikeText(meta)) {
            const it = nrmItem(l, l?.tf ?? l?.timeframe, 'SR: Pool di liquidità');
            if (it) (dir === 'sopra' ? outAbove : outBelow).push(it);
          }
        }
      };
      consider(res, 'sopra');
      consider(sup, 'sotto');
    }
  
    // ➤ Rimuovi round legacy (ROUND_100, ROUND_250, ...) e tieni solo ROUND_1P
    const filterLegacy = (arr: LiquidityItem[]) => arr.filter((it) => !isLegacyRound(it.fonte));
    const aboveNoLegacy = filterLegacy(outAbove);
    const belowNoLegacy = filterLegacy(outBelow);
    outAbove.splice(0, outAbove.length, ...aboveNoLegacy);
    outBelow.splice(0, outBelow.length, ...belowNoLegacy);
  
    // ➤ Round dinamici 1% attorno al prezzo corrente
    const prezzo = toNum(x.prezzo ?? x.price);
    injectRoundLevels(outAbove, outBelow, prezzo, 6); // cambia 6 per più/meno livelli
  
    // ➤ Dedup/merge e somma forza
    return {
      sopra: uniqSort(outAbove),
      sotto: uniqSort(outBelow),
    };
  }
  
  /* ────────────────────────────── Altri estrattori ──────────────────────── */
  export function extractExplain(r: any) {
    const x = unwrapRisposte(r);
    return {
      text: pick(x, 'explainText', 'spiegazione', 'explain', 'analysis_text') ?? '',
      motivi: pick(x, 'motivi', 'reasons', 'drivers') ?? [],
    };
  }
  
  export function extractStrategiaAI(r: any) {
    const x = unwrapRisposte(r);
    const arr = pick(x, 'strategia_ai', 'strategy_ai', 'strategia', 'ai_strategy', 'strategy', 'strategia_items');
    if (Array.isArray(arr)) return arr;
    if (Array.isArray(arr?.items)) return arr.items;
    return [];
  }
  
  export function extractEntries(r: any) {
    const x = unwrapRisposte(r);
    return pick(x, 'entries', 'entrate', 'valid_entries', 'signals') ?? [];
  }
  
  export function extractScenari(r: any) {
    const x = unwrapRisposte(r);
    return pick(x, 'scenari_per_tf', 'scenari', 'scenarios', 'scenari_attivi') ?? {};
  }
  
  export function extractMiddles(r: any) {
    const x = unwrapRisposte(r);
    return pick(x, 'middles', 'mid_levels', 'middle_levels', 'mezze', 'mezzi') ?? [];
  }
  