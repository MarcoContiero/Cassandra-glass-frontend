'use client';
import * as React from 'react';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = { title?: string; children?: React.ReactNode; result?: any; symbol?: string; price?: number | string; };

function pickStrategyText(r: any): string | undefined {
  return (
    r?.strategia_ai?.testo ??
    r?.strategia_ai?.content ??
    r?.risposte?.strategia_ai?.testo ??
    r?.risposte?.strategia ??
    r?.strategyText ??
    undefined
  );
}

export default function StrategiaOverlay({ title = 'Strategia AI', children, result, symbol, price }: Props) {
  const [open, setOpen] = React.useState(true);
  const testo = pickStrategyText(result);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="hidden">open</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {testo ? <div className="whitespace-pre-wrap">{testo}</div> :
            (children ?? <div className="opacity-70">Nessun contenuto strategia disponibile.</div>)
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}
