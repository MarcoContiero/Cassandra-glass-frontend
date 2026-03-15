# backend/orione/hyper_rest.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

import os
import httpx

def _env_str(name: str, default: str) -> str:
    v = (os.getenv(name, default) or default).strip()
    return v if v else default

HL_REST_URL = _env_str("HYPERLIQUID_REST_URL", "https://api.hyperliquid.xyz")
HL_REST_URL = HL_REST_URL.rstrip("/")

def _tf_ms(tf: str) -> int:
    t = (tf or "").strip().lower()
    try:
        if t.endswith("m"):
            return int(t[:-1]) * 60_000
        if t.endswith("h"):
            return int(t[:-1]) * 60 * 60_000
        if t.endswith("d"):
            return int(t[:-1]) * 24 * 60 * 60_000
    except Exception:
        pass
    return 60_000

async def _hl_rest_candles_rows(
    coin_key: str,
    tf: str,
    *,
    limit: int,
    end_ts_ms: int,
) -> List[Dict[str, Any]]:
    tf = (tf or "").strip().lower()
    if tf not in ("1m", "3m", "5m", "15m", "1h", "4h", "1d"):
        return []

    tfms = _tf_ms(tf)
    end_ms = int(end_ts_ms)
    start_ms = end_ms - int(max(int(limit), 10) * tfms * 2)

    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": str(coin_key),
            "interval": tf,
            "startTime": int(start_ms),
            "endTime": int(end_ms),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0)) as c:
            r = await c.post(f"{HL_REST_URL}/info", json=payload)
            if r.status_code < 200 or r.status_code >= 300:
                return []
            arr = r.json()
    except Exception:
        return []

    if not isinstance(arr, list) or not arr:
        return []

    rows: List[Dict[str, Any]] = []
    for x in arr:
        if not isinstance(x, dict):
            continue
        try:
            rows.append(
                {
                    "timestamp": int(x.get("t") or x.get("time") or x.get("timestamp")),
                    "open": float(x.get("o") or x.get("open")),
                    "high": float(x.get("h") or x.get("high")),
                    "low": float(x.get("l") or x.get("low")),
                    "close": float(x.get("c") or x.get("close")),
                    "volume": float(x.get("v") or x.get("volume") or 0.0),
                }
            )
        except Exception:
            continue

    if not rows:
        return []

    rows.sort(key=lambda r: int(r["timestamp"]))

    # dedup by timestamp (keep last)
    ded: List[Dict[str, Any]] = []
    last_t: Optional[int] = None
    for r in rows:
        t = int(r["timestamp"])
        if last_t == t:
            ded[-1] = r
        else:
            ded.append(r)
            last_t = t

    if len(ded) > int(limit):
        ded = ded[-int(limit) :]

    return ded