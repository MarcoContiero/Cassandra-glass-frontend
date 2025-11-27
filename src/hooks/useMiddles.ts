// src/hooks/useMiddles.ts
import { useState } from 'react';
import type { MiddlesPayload } from '@/components/MiddleOverlay';
import { callAPI } from '@/lib/api';

export default function useMiddles(symbol: string, tfs: string[]) {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<MiddlesPayload | undefined>(undefined);

  async function open() {
    setShow(true);
    try {
      const q = new URLSearchParams();
      q.append('coin', symbol);
      tfs.forEach(tf => q.append('timeframes', tf));
      const json = await callAPI<MiddlesPayload>(`/api/middles?${q.toString()}`);
      setData(json); // niente JSON.parse
    } catch (e) {
      console.error('useMiddles/open', e);
      setData(undefined);
    }
  }

  function close() {
    setShow(false);
    setData(undefined);
  }

  return { show, data, open, close };
}
