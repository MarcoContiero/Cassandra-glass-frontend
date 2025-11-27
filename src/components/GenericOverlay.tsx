'use client';

import type { ReactNode } from 'react';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = {
  title: string;
  data?: any;             // opzionale: usato solo come fallback debug
  className?: string;     // opzionale: se vuoi aggiungere padding extra ecc.
  children?: ReactNode;   // ⬅️ permette di passare contenuto custom (Accordion, liste, ecc.)
};

export default function GenericOverlay({ title, data, className, children }: Props) {
  return (
    <DialogContent className="max-w-4xl w-[96vw] p-0 bg-zinc-900/95 text-white">
      <DialogHeader className="p-4 border-b border-white/10">
        <DialogTitle className="text-xl">{title}</DialogTitle>
      </DialogHeader>

      <div className={`p-4 space-y-3 text-sm ${className ?? ''}`}>
        {children ? (
          children
        ) : (
          // Fallback di comodo per debug quando non passiamo children
          <pre className="whitespace-pre-wrap wrap-break-words text-white/80">
            {JSON.stringify(data ?? {}, null, 2)}
          </pre>
        )}
      </div>
    </DialogContent>
  );
}
