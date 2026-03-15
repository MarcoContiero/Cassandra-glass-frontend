# backend/tifide3/backtest/analyze_csv_orione.py
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

import pandas as pd

from patterns import detect_pattern_indices

# supporta anche tf oltre 1/3/5m se in futuro li dumpi
TF_RE = re.compile(r"_(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d)\.csv$", re.IGNORECASE)

def infer_tf_from_name(p: Path) -> str:
    m = TF_RE.search(p.name)
    if m:
        return m.group(1).lower()
    for tf in ("1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"):
        if f"_{tf}" in p.stem.lower():
            return tf
    return "3m"

def infer_coin_from_name(p: Path) -> str:
    """
    Atteso: hl_rest_ohlcv_<COIN>_<TF>.csv
    Es: hl_rest_ohlcv_INJ_3m.csv -> INJ
        hl_rest_ohlcv_kSHIB_1m.csv -> KSHIB
    """
    stem = p.stem  # senza .csv
    parts = stem.split("_")
    # ["hl","rest","ohlcv","INJ","3m"]
    if len(parts) >= 5:
        return str(parts[3] or "").strip().upper()
    # fallback: token prima del tf
    tf = infer_tf_from_name(p)
    if stem.lower().endswith(f"_{tf}"):
        guess = stem[: -(len(tf) + 1)]
        return guess.split("_")[-1].upper()
    return p.name.split("_", 1)[0].upper()

def _find_timestamp_col(df: pd.DataFrame) -> Optional[str]:
    """
    Prova a trovare una colonna timestamp in ms.
    Supporta nomi comuni: timestamp, ts, time, t (case-insensitive).
    """
    cols = {c.lower().strip(): c for c in df.columns}
    for k in ("timestamp", "timestamp_ms", "ts", "ts_ms", "time", "t"):
        if k in cols:
            return cols[k]
    return None

def load_csv_ohlcv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    cols = {c.lower().strip(): c for c in df.columns}
    need = ["open", "high", "low", "close"]
    for k in need:
        if k not in cols:
            raise ValueError(f"{path.name}: manca colonna {k}")

    ts_col = _find_timestamp_col(df)

    # costruisci DF con colonne standard (timestamp opzionale)
    out_cols: List[str] = []
    if ts_col:
        out_cols.append(ts_col)
    out_cols += [cols["open"], cols["high"], cols["low"], cols["close"]]

    out = df[out_cols].copy()

    # rename standard
    if ts_col:
        out.rename(columns={ts_col: "timestamp"}, inplace=True)
        # normalizza in int (ms) se possibile
        try:
            out["timestamp"] = pd.to_numeric(out["timestamp"], errors="coerce").astype("Int64")
        except Exception:
            pass

    out.rename(
        columns={
            cols["open"]: "open",
            cols["high"]: "high",
            cols["low"]: "low",
            cols["close"]: "close",
        },
        inplace=True,
    )

    # ordina per timestamp se c'è
    if "timestamp" in out.columns:
        try:
            out = out.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
        except Exception:
            pass

    return out

def main():
    folder = Path("dump_orione_2026_b")   # ✅ la tua cartella attuale
    csvs = sorted(folder.glob("hl_rest_ohlcv_*.csv"))  # ✅ evita CSV "copia" / report / risultati
    if not csvs:
        raise SystemExit(f"Nessun CSV trovato in {folder.resolve()} (pattern: hl_rest_ohlcv_*.csv)")

    rows_summary: List[Dict[str, Any]] = []
    pattern_counts: Dict[str, int] = {}
    tf_counts: Dict[str, int] = {}

    out_jsonl = folder / "hits_raw.jsonl"
    out_events = folder / "hits_events.csv"

    events_rows: List[Dict[str, Any]] = []

    with out_jsonl.open("w", encoding="utf-8") as fjsonl:
        for p in csvs:
            coin = infer_coin_from_name(p)
            tf = infer_tf_from_name(p)

            df = load_csv_ohlcv(p)

            # NB: detect_pattern_indices tipicamente usa solo open/high/low/close
            # ma lasciamo timestamp in df per poter mappare idx -> ts_ms
            hits = detect_pattern_indices(df, timeframe=tf)

            total = len(hits)
            by_pat: Dict[str, int] = {}

            for h in hits:
                pat = str(h.get("pattern") or "").strip()
                idx = int(h.get("index") or -1)

                by_pat[pat] = by_pat.get(pat, 0) + 1
                pattern_counts[pat] = pattern_counts.get(pat, 0) + 1
                tf_counts[tf] = tf_counts.get(tf, 0) + 1

                ts_ms = None
                if "timestamp" in df.columns and 0 <= idx < len(df):
                    try:
                        v = df["timestamp"].iloc[idx]
                        ts_ms = int(v) if pd.notna(v) else None
                    except Exception:
                        ts_ms = None

                rec = {
                    "file": p.name,
                    "coin": coin,
                    "tf": tf,
                    "timestamp_ms": ts_ms,
                    **h,
                }

                fjsonl.write(json.dumps(rec, ensure_ascii=False) + "\n")

                events_rows.append({
                    "file": p.name,
                    "coin": coin,
                    "tf": tf,
                    "timestamp_ms": ts_ms,
                    "index": idx,
                    "pattern": pat,
                    "direction": h.get("direction"),
                    "strength": h.get("strength"),
                    "name": h.get("name"),
                })

            rows_summary.append({
                "coin": coin,
                "tf": tf,
                "file": p.name,
                "bars": int(len(df)),
                "has_timestamp": bool("timestamp" in df.columns),
                "hits_total": int(total),
                "hits_by_pattern": json.dumps(by_pat, ensure_ascii=False),
            })

    # summary per (coin,tf)
    summ = pd.DataFrame(rows_summary).sort_values(["coin", "tf"])
    summ.to_csv(folder / "hits_summary.csv", index=False)

    # top pattern
    top = sorted(pattern_counts.items(), key=lambda x: x[1], reverse=True)
    top_df = pd.DataFrame(top, columns=["pattern", "count"])
    top_df.to_csv(folder / "hits_top_patterns.csv", index=False)

    # events CSV
    if events_rows:
        pd.DataFrame(events_rows).to_csv(out_events, index=False)

    print("\n=== SUMMARY (top 15 pattern) ===")
    for pat, cnt in top[:15]:
        print(f"{cnt:6d}  {pat}")

    print("\nOutput:")
    print(" -", (folder / "hits_summary.csv").resolve())
    print(" -", (folder / "hits_top_patterns.csv").resolve())
    print(" -", (folder / "hits_raw.jsonl").resolve())
    if events_rows:
        print(" -", out_events.resolve())

if __name__ == "__main__":
    main()