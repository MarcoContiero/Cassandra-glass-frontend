# tools/download_hl_ohlcv_range_multi.py
from __future__ import annotations

import asyncio
import csv
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple, Optional

from hyper_rest import _hl_rest_candles_rows

# ----------------------------
# CONFIG
# ----------------------------

# Range UTC: 2026-02-01 -> 2026-02-21 (inclusi)
START_UTC = "2026-03-10 09:30:00"
END_UTC   = "2026-03-10 12:30:59"

TFS = ["1m", "3m", "5m"]

# limit per request HL REST (se supporta 2000 meglio; altrimenti abbassa a 500/1000)
REQ_LIMIT = 2000

# micro-sleep per non martellare
RATE_SLEEP_SEC = 0.05

OUT_DIR = Path("dump_orione_2026_b")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------
# COINS (da tua lista: coin_key = parte prima del "-")
# ---------------------------------------------------------
HYPER_PAIRS: List[Tuple[str, str]] = [
    ("BTC", "BTC-USDC"),
    ("SOL", "SOL-USDC"),
    ("TAO", "TAO-USDC"),
    ("PEPE", "kPEPE-USDC"),
    ("SUI", "SUI-USDC"),
    ("HYPE", "HYPE-USDC"),
    ("AAVE", "AAVE-USDC"),
    ("OP", "OP-USDC"),
    ("INJ", "INJ-USDC"),
    ("ARB", "ARB-USDC"),
    ("SEI", "SEI-USDC"),
    ("TON", "TON-USDC"),
    ("DOGE", "DOGE-USDC"),
    ("WIF", "WIF-USDC"),
    ("PUMPFUN", "PUMP-USDC"),
    ("PENGU", "PENGU-USDC"),
    ("SHIBA", "kSHIB-USDC"),
    ("FLOKI", "kFLOKI-USDC"),
    ("UNI", "UNI-USDC"),
    ("ENA", "ENA-USDC"),
    ("APT", "APT-USDC"),
    ("ONDO", "ONDO-USDC"),
    ("ZEC", "ZEC-USDC"),
    ("BCH", "BCH-USDC"),
    ("WLD", "WLD-USDC"),
    ("FARTCOIN", "FARTCOIN-USDC"),
    ("JUP", "JUP-USDC"),
    ("LDO", "LDO-USDC"),
    ("CRV", "CRV-USDC"),
]

def _hyper_to_coin_key(hyper: str) -> str:
    s = (hyper or "").strip()
    if not s:
        return ""
    if "-" in s:
        return s.split("-", 1)[0].strip()
    return s

def _dt_utc_to_ms(s: str) -> int:
    # "YYYY-MM-DD HH:MM:SS" in UTC
    dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)

@dataclass
class Row:
    ts: int
    o: float
    h: float
    l: float
    c: float
    v: float

async def fetch_range_rows(*, coin_key: str, tf: str, start_ms: int, end_ms: int) -> List[Row]:
    """
    Scarica via HL REST andando all'indietro con end_ts_ms (cursor).
    Ritorna righe nel range [start_ms, end_ms], ordinate e dedup.
    """
    if not coin_key or not tf:
        return []

    cursor_end = int(end_ms)
    acc: Dict[int, Row] = {}

    # loop backward
    for _ in range(20000):  # hard safety
        rows = await _hl_rest_candles_rows(
            coin_key=coin_key,
            tf=tf,
            limit=int(REQ_LIMIT),
            end_ts_ms=int(cursor_end),
        )

        if not rows:
            break

        # rows sono dict con "timestamp/open/high/low/close/volume"
        min_ts_seen: Optional[int] = None
        for r in rows:
            try:
                ts = int(r["timestamp"])
            except Exception:
                continue

            if min_ts_seen is None or ts < min_ts_seen:
                min_ts_seen = ts

            if ts < start_ms:
                # siamo oltre l'inizio; continuiamo solo per capire se finiamo pagina
                pass

            if start_ms <= ts <= end_ms:
                try:
                    acc[ts] = Row(
                        ts=ts,
                        o=float(r["open"]),
                        h=float(r["high"]),
                        l=float(r["low"]),
                        c=float(r["close"]),
                        v=float(r.get("volume", 0.0) or 0.0),
                    )
                except Exception:
                    continue

        if min_ts_seen is None:
            break

        # se la pagina più vecchia è già sotto start_ms, possiamo chiudere
        if int(min_ts_seen) <= int(start_ms):
            break

        # avanti all'indietro
        cursor_end = int(min_ts_seen) - 1
        await asyncio.sleep(RATE_SLEEP_SEC)

    out = list(acc.values())
    out.sort(key=lambda x: x.ts)
    return out

async def dump_one(*, label: str, hyper: str, tf: str, start_ms: int, end_ms: int) -> None:
    coin_key = _hyper_to_coin_key(hyper)
    if not coin_key:
        print(f"[SKIP] {label} hyper='{hyper}' -> coin_key vuoto")
        return

    rows = await fetch_range_rows(coin_key=coin_key, tf=tf, start_ms=start_ms, end_ms=end_ms)
    out_path = OUT_DIR / f"hl_rest_ohlcv_{coin_key}_{tf}.csv"

    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["coin_key", "tf", "timestamp_ms", "open", "high", "low", "close", "volume"],
        )
        w.writeheader()
        for r in rows:
            w.writerow({
                "coin_key": coin_key,
                "tf": tf,
                "timestamp_ms": int(r.ts),
                "open": float(r.o),
                "high": float(r.h),
                "low": float(r.l),
                "close": float(r.c),
                "volume": float(r.v),
            })

    print(f"[OK] {label} ({coin_key}) tf={tf} rows={len(rows)} -> {out_path}")

async def main() -> None:
    start_ms = _dt_utc_to_ms(START_UTC)
    end_ms = _dt_utc_to_ms(END_UTC)

    print("[RANGE]", START_UTC, "->", END_UTC, "UTC")
    print("[MS]", start_ms, "->", end_ms)
    print("[OUT]", OUT_DIR.resolve())

    # sequenziale (più safe). Se vuoi, poi lo parallelizziamo con semaphore.
    for label, hyper in HYPER_PAIRS:
        for tf in TFS:
            try:
                await dump_one(label=label, hyper=hyper, tf=tf, start_ms=start_ms, end_ms=end_ms)
            except Exception as e:
                print(f"[ERR] {label} ({hyper}) tf={tf} -> {type(e).__name__}: {e}")

    print("[DONE]")

if __name__ == "__main__":
    asyncio.run(main())