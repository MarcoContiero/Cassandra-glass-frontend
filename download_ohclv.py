# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import csv
import time
from pathlib import Path
from typing import List, Tuple

from hyper_rest import _hl_rest_candles_rows

# (LABEL, HYPER_SYMBOL)
PAIRS: List[Tuple[str, str]] = [
    ("PENGU", "PENGU-USDC"),
]

TFS = ["1m"]

# quante barre vuoi: per “stanotte” meglio 1000-3000 a TF
LIMIT_BY_TF = {"1m": 1000}

OUT_DIR = Path("dump_orione_live")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def _hyper_to_coin_key(hyper: str) -> str:
    s = (hyper or "").strip()
    if not s:
        return ""
    if "-" in s:
        return s.split("-", 1)[0].strip()
    return s

async def dump_one(label: str, hyper: str, tf: str, end_ms: int) -> None:
    coin_key = _hyper_to_coin_key(hyper)
    if not coin_key:
        print(f"[SKIP] {label}: hyper='{hyper}' -> coin_key vuoto")
        return

    out = OUT_DIR / f"hl_rest_ohlcv_{coin_key}_{tf}.csv"
    limit = int(LIMIT_BY_TF.get(tf, 120))

    rows = await _hl_rest_candles_rows(
        coin_key=coin_key,
        tf=tf,
        limit=limit,
        end_ts_ms=end_ms,
    )

    with out.open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["label", "hyper", "coin_key", "tf", "timestamp", "open", "high", "low", "close", "volume"],
        )
        w.writeheader()
        for r in rows:
            w.writerow({
                "label": label,
                "hyper": hyper,
                "coin_key": coin_key,
                "tf": tf,
                "timestamp": int(r["timestamp"]),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r.get("volume", 0.0) or 0.0),
            })

    print(f"[OK] {label} ({coin_key}) tf={tf} rows={len(rows)} -> {out}")

async def main() -> None:
    end_ms = int(time.time() * 1000)
    for label, hyper in PAIRS:
        for tf in TFS:
            try:
                await dump_one(label, hyper, tf, end_ms)
            except Exception as e:
                print(f"[ERR] {label} ({hyper}) tf={tf}: {e}")

    print(f"[DONE] scritto in {OUT_DIR}")

if __name__ == "__main__":
    asyncio.run(main())