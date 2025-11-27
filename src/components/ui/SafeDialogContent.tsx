// src/components/ui/SafeDialogContent.tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = {
  title: string | React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Wrapper "safe" per il contenuto dei dialog:
 * - NON crea un altro DialogContent (evita annidamento)
 * - lascia l'a11y al DialogHeader esterno
 * - nessun max-width di default
 */
const SafeDialogContent = React.forwardRef<HTMLDivElement, Props>(
  ({ title, description = 'Dialog content', className, children }, ref) => {
    return (
      <div ref={ref} data-safe-content className={cn('w-full max-w-none', className)}>
        {children}
      </div>
    );
  }
);

SafeDialogContent.displayName = 'SafeDialogContent';
export default SafeDialogContent;
