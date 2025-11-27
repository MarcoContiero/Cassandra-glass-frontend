// src/handlers/handleDomanda.ts
import type { Dispatch, SetStateAction } from 'react';
import {
  unwrapRisposte,
  extractLiquidity,
  extractExplain,
  extractStrategiaAI,
  extractEntries,
  extractScenari,
  extractMiddles,
} from '@/lib/extractors';

export type OverlayKey =
  | 'supporti'
  | 'liquidita'
  | 'scenari'
  | 'entrate'
  | 'riepilogo'
  | 'longshort'
  | 'trigger_map'
  | 'momentum_gauge'
  | 'spiegazione'
  | 'middles'
  | 'strategia_ai'
  | 'box';

type Ctx = {
  result: any;
  setOverlayKey: (k: OverlayKey | null) => void;
  setOverlayTitle: Dispatch<SetStateAction<string>>;
  setOverlayData: Dispatch<SetStateAction<any>>;
  openMiddles: () => void;
};

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

export default function createDomandeHandler(ctx: Ctx) {
  return (rawKey: string) => {
    const key = String(rawKey).toLowerCase();
    const rr = unwrapRisposte(ctx.result);

    // 🔹 Middles (overlay dedicato separato)
    if (key.includes('middle')) {
      ctx.setOverlayTitle('🧭 Middles');
      // Se vuoi passare dati anche qui:
      ctx.setOverlayData({ items: extractMiddles(ctx.result) });
      ctx.setOverlayKey('middles');
      ctx.openMiddles();
      return;
    }

    // 🔹 Supporti/Resistenze (con liste; le zone sono calcolate dentro l’overlay)
    if (key.includes('support')) {
      ctx.setOverlayTitle('🛡️ Supporti/Resistenze');
      ctx.setOverlayData({
        supporti: Array.isArray(rr.supporti) ? rr.supporti : [],
        resistenze: Array.isArray(rr.resistenze) ? rr.resistenze : [],
      });
      ctx.setOverlayKey('supporti');
      return;
    }

    // 🔹 Livelli di liquidità
    if (key.includes('liquidit')) {
      const z = extractLiquidity(ctx.result); // { sopra: LiquidityItem[], sotto: LiquidityItem[] }
      ctx.setOverlayTitle('💧 Livelli di liquidità');
      ctx.setOverlayData(z);                   // <— niente .above/.below
      ctx.setOverlayKey('liquidita');
      return;
    }

    // 🔹 Scenari attivi
    if (key.includes('scenari')) {
      ctx.setOverlayTitle('🧪 Scenari attivi');
      ctx.setOverlayData({ scenari: extractScenari(ctx.result) });
      ctx.setOverlayKey('scenari');
      return;
    }

    // 🔹 Entrate valide
    if (key.includes('entrate') || key.includes('entries')) {
      ctx.setOverlayTitle('🎯 Entrate (entries)');
      ctx.setOverlayData({ entries: extractEntries(ctx.result) });
      ctx.setOverlayKey('entrate');
      return;
    }

    // 🔹 Riepilogo totale (passo tutto il payload risposte)
    if (key.includes('riepilogo')) {
      ctx.setOverlayTitle('📊 Riepilogo totale');
      ctx.setOverlayData(rr);
      ctx.setOverlayKey('riepilogo');
      return;
    }

    // 🔹 Long o Short?
    if (key.includes('long') || key.includes('short')) {
      ctx.setOverlayTitle('✍️ Long o Short?');
      ctx.setOverlayData({
        dominant: pick(rr, 'dominant', 'direzione'),
        tfScore: pick(rr, 'tfScore', 'trend_tf_score') ?? {},
      });
      ctx.setOverlayKey('longshort');
      return;
    }

    // 🔹 Mappa dei Trigger (2+2 filtrati nell’overlay)
    if (key.includes('trigger')) {
      ctx.setOverlayTitle('🗺️ Mappa dei Trigger');
      ctx.setOverlayData({
        supporti: Array.isArray(rr.supporti) ? rr.supporti : [],
        resistenze: Array.isArray(rr.resistenze) ? rr.resistenze : [],
        prezzo: pick(rr, 'prezzo', 'price'),
      });
      ctx.setOverlayKey('trigger_map');
      return;
    }

    // 🔹 Termometro d’Impulso
    if (key.includes('termometro') || key.includes('impulso') || key.includes('momentum')) {
      ctx.setOverlayTitle('🌡️ Termometro d’Impulso');
      ctx.setOverlayData({
        momentum: pick(rr, 'momentum', 'momentum_gauge'),
        tfScore: pick(rr, 'tfScore', 'trend_tf_score') ?? {},
      });
      ctx.setOverlayKey('momentum_gauge');
      return;
    }

    // 🔹 Spiegazione dell’analisi
    if (key.includes('spiegazione') || key.includes('explain')) {
      const ex = extractExplain(ctx.result);
      ctx.setOverlayTitle('🧠 Spiegazione dell’analisi');
      ctx.setOverlayData({ text: ex.text, motivi: ex.motivi });
      ctx.setOverlayKey('spiegazione');
      return;
    }

    // 🔹 Strategia AI
    if (key.includes('strateg')) {
      ctx.setOverlayTitle('🤖 Strategia AI');
      ctx.setOverlayData({ items: extractStrategiaAI(ctx.result) });
      ctx.setOverlayKey('strategia_ai');
      return;
    }

    // 🔹 Box (placeholder)
    if (key === 'box') {
      ctx.setOverlayTitle('📦 Box');
      ctx.setOverlayData(rr?.box ?? {});
      ctx.setOverlayKey('box');
      return;
    }

    // Fallback → Riepilogo
    ctx.setOverlayTitle('ℹ️ Dettagli');
    ctx.setOverlayData(rr);
    ctx.setOverlayKey('riepilogo');
  };
}
