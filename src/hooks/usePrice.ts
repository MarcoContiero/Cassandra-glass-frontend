// src/hooks/usePrice.ts
"use client";
import { useEffect, useRef, useState } from "react";

export function usePrice(symbol: string, opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 10000;
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function load() {
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error((j?.errors?.[0]) || `http ${res.status}`);
      setPrice(Number(j.price));
    } catch (e: any) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setPrice(null);
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [symbol, intervalMs]);

  return { price, loading, error, refresh: load };
}
