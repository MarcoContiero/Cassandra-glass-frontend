'use client';

import { Button } from '@/components/ui/button';
import type { QuestionKey } from '@/types';

type Props = {
  onDomanda?: (tipo: QuestionKey | 'middles' | 'strategia_ai' | 'box') => void;
};

const btn = 'w-full justify-start text-left bg-white text-zinc-900 hover:bg-zinc-100 border border-white/20 rounded-lg';

export default function Domande({ onDomanda }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Button onClick={() => onDomanda?.('longshort')} className={btn}>✍️ Long o Short?</Button>
      <Button onClick={() => onDomanda?.('entrate')} className={btn}>🎯 Ci sono entrate valide?</Button>

      <Button onClick={() => onDomanda?.('supporti')} className={btn}>🧱 Supporti/resistenze</Button>
      <Button onClick={() => onDomanda?.('scenari')} className={btn}>🧪 Scenari attivi</Button>

      <Button onClick={() => onDomanda?.('liquidita')} className={btn}>💧 Livelli liquidità</Button>
      <Button onClick={() => onDomanda?.('riepilogo_totale')} className={btn}>📊 Riepilogo totale</Button>

      <Button onClick={() => onDomanda?.('spiegazione')} className={btn}>🧠 Spiegazione</Button>
      <Button onClick={() => onDomanda?.('trigger_map')} className={btn}>🗺️ Mappa dei Trigger</Button>

      <Button onClick={() => onDomanda?.('momentum_gauge')} className={btn}>🌡️ Termometro d’Impulso</Button>
      <Button onClick={() => onDomanda?.('middles')} className={btn}>🧭 Middles</Button>

      <Button onClick={() => onDomanda?.('strategia_ai')} className={btn}>🤖 Strategia AI</Button>
      <Button onClick={() => onDomanda?.('box')} className={btn}>📦 Box</Button>
    </div>
  );
}
