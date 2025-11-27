// src/lib/ranges/adapter.ts
import { RangeBox, RangeType } from "@/types/range";

/* ---------- helpers ---------- */
function toMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v < 1_000_000_000_000 ? v * 1000 : v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n < 1_000_000_000_000 ? n * 1000 : n;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.getTime();
}
function toIso(v: any): string | undefined {
  const ms = toMs(v);
  return ms ? new Date(ms).toISOString() : undefined;
}
function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------- adapter ---------- */
export function adaptBackendBoxToRanges(
  res: any,
  symbol: string,
  timeframe: string
): RangeBox[] {
  const list = Array.isArray(res?.boxes) ? res.boxes : Array.isArray(res) ? res : [];

  return (list as any[])
    .map((b: any, i: number) => {
      // livelli
      const top = toNum(b?.top ?? b?.box?.top);
      const bottom = toNum(b?.bottom ?? b?.box?.bottom);
      if (top == null || bottom == null) return null;

      const width = Math.abs(top - bottom);
      const mid = (top + bottom) / 2;

      // tipo (PRESERVATO) e stato
      const type = (b?.type ?? "standard") as RangeType; // ⬅️ non riconvertire in "multitouch"
      const statusFromBackend: string | undefined = b?.status;
      const active =
        b?.active === true || statusFromBackend === "active" || b?.closed === false;

      // data forti + fallback
      const start_ts_ms =
        b?.start_ts_ms ??
        toMs(b?.start_time_iso) ??
        toMs(b?.start_time) ??
        toMs(b?.anchor_time) ??
        toMs(b?.box?.anchor_time) ??
        null;

      const end_ts_ms =
        b?.end_ts_ms ??
        toMs(b?.end_time_iso) ??
        toMs(b?.end_time) ??
        toMs(b?.active_until_time) ??
        toMs(b?.box?.active_until_time) ??
        null;

      const start_time_iso = start_ts_ms ? new Date(start_ts_ms).toISOString() : b?.start_time_iso;
      const end_time_iso = end_ts_ms ? new Date(end_ts_ms).toISOString() : b?.end_time_iso;

      const createdAt = start_time_iso ?? toIso(b?.createdAt); // usato per sort/fallback
      const updatedAt = end_time_iso ?? toIso(b?.updatedAt);

      // tagging/meta/eventi
      const tags: string[] = Array.isArray(b?.tags) ? b.tags.slice() : [];
      const events: any[] = Array.isArray(b?.events) ? b.events : [];
      const meta = {
        touchesTop: b?.touchesTop ?? b?.meta?.touchesTop,
        touchesBottom: b?.touchesBottom ?? b?.meta?.touchesBottom,
        strength: b?.strength ?? b?.score ?? b?.meta?.strength,
        ...b?.meta,
      };

      // id
      const id: string =
        String(
          b?.id ??
          (b?.start_index != null && b?.end_index != null
            ? `${b.start_index}-${b.end_index}`
            : `${symbol}-${timeframe}-${i}`)
        );

      // sotto-oggetto per header
      const anchor_index = b?.box?.anchor_index ?? b?.anchor_index ?? undefined;
      const anchor_time =
        b?.box?.anchor_time ?? b?.anchor_time ?? start_time_iso ?? undefined;

      const active_until_index =
        b?.box?.active_until_index ?? b?.active_until_index ?? undefined;
      const active_until_time =
        b?.box?.active_until_time ??
        b?.active_until_time ??
        end_time_iso ??
        undefined;

      const out: any = {
        id,
        symbol,
        timeframe,
        type,                                // ⬅️ resta quello del backend
        status: active ? "active" : "closed",
        active,
        top,
        bottom,
        width,
        mid,

        tags,
        events,
        meta,

        // date che la UI usa nella catena di fallback
        start_ts_ms: start_ts_ms ?? undefined,
        start_time_iso,
        end_ts_ms: end_ts_ms ?? undefined,
        end_time_iso,
        createdAt,
        updatedAt,

        box: {
          top, bottom, width, mid,
          anchor_index,
          anchor_time,
          active_until_index,
          active_until_time,
        },
      };

      return out as RangeBox;
    })
    .filter(Boolean) as RangeBox[];
}
