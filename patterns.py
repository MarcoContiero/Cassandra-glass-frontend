# -*- coding: utf-8 -*-
"""
Pattern detection "strict/academic" per Orione (senza TA-Lib).

Obiettivo:
- ridurre falsi positivi su low-TF (1m/3m/5m)
- richiedere contesto (mini-trend) e criteri più rigorosi
- mantenere: PatternHit, detect_pattern_indices, *_raw + *_confirmed con _confirm_A
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Set, TypedDict, Tuple

import pandas as pd

import time

import json

import os

def _env_int(name: str, default: int) -> int:
    try:
        return int((os.getenv(name, str(default)) or str(default)).strip())
    except Exception:
        return default

def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name, "1" if default else "0") or "").strip().lower()
    return v in ("1", "true", "yes", "y", "on")

ORIONE_PAT_DEBUG = _env_bool("ORIONE_PAT_DEBUG", False)  # tu usi già ORIONE_PAT_DEBUG=1
# livello 1 = motivi + numeri principali, livello 2 = più dettagli
ORIONE_PAT_DEBUG_LEVEL = _env_int("ORIONE_PAT_DEBUG_LEVEL", 1)

def _patdbg(*a: object) -> None:
    try:
        print(*a)
    except Exception:
        pass

def _env_str(name: str, default: str = "") -> str:
    return (os.getenv(name, default) or default).strip()

# Filtri debug (per non spam)
ORIONE_PAT_DEBUG_COIN = _env_str("ORIONE_PAT_DEBUG_COIN", "SOL").upper()  # esempio: SOL
ORIONE_PAT_DEBUG_LAST_ONLY = _env_bool("ORIONE_PAT_DEBUG_LAST_ONLY", True)

# log solo “motivi” quando NON scatta
ORIONE_PAT_DEBUG_ONLY_FAILS = _env_bool("ORIONE_PAT_DEBUG_ONLY_FAILS", True)

def _patdbg_enabled(*, coin: str | None, timeframe: str | None) -> bool:
    if not ORIONE_PAT_DEBUG:
        return False
    if not coin:                 # <— aggiungi questa riga
        return False
    if ORIONE_PAT_DEBUG_COIN and coin.upper() != ORIONE_PAT_DEBUG_COIN:
        return False
    return True

class PatternHit(TypedDict, total=False):
    pattern: str
    name: str
    index: int
    direction: str
    strength: float


# ---------------------------------------------------------------------------
# Config "strict" (BASE)
# NOTE: i valori TF-aware arrivano da _strict_for_tf(tf) che fa override.
# ---------------------------------------------------------------------------

STRICT: Dict[str, Any] = {

    # -----------------
    # HAMMER / SHOOTING
    # -----------------
    "WICK_LONG_MIN_FRAC": 0.55,      # wick lunga >= 55% del range
    "WICK_LONG_MIN_X_BODY": 2.5,     # wick lunga >= 2.5x body
    "WICK_SHORT_MAX_FRAC": 0.12,     # wick corta <= 12% del range
    "BODY_MAX_FRAC": 0.35,           # body <= 35% del range
    "BODY_MIN_FRAC": 0.05,           # evita micro-body (doji-ish)

    # -----------------
    # TREND CONTEXT (base, poi override per TF)
    # -----------------
    "TREND_LOOKBACK": 6,
    "TREND_MIN_PCT": 0.0035,

    # -----------------
    # ENGULFING (LIVE strict, range-based)
    # -----------------
    "ENG_BODY1_MIN_FRAC_RANGE1": 0.18,  # body1 >= 18% del suo range
    "ENG_BODY2_MIN_FRAC_RANGE2": 0.50,  # body2 >= 50% del suo range
    "ENG_MIN_RANGE_FRAC_MED": 0.55,     # range1/2 >= 55% mediana range recente
    "ENG_MED_RANGE_WIN": 30,
    "ENG_BODY_CUR_X_PREV": 1.35,        # body2 >= 1.35 * body1

    # -----------------
    # MORNING/EVENING STAR
    # -----------------
    "STAR_BODY2_MAX_FRAC_RANGE1": 0.35,
    "STAR_BODY3_MIN_X_BODY1": 0.60,
    "STAR_TREND_MIN_PCT": 0.0045,       # base, poi override per TF

    # -----------------
    # DARK CLOUD COVER
    # -----------------
    "DCC_BODY1_MIN_FRAC_RANGE1": 0.60,
    "DCC_BODY2_MIN_X_BODY1": 0.55,
    "DCC_OPEN2_MIN_OVER_CLOSE1": 0.998,
    "DCC_HIGH2_MIN_OVER_HIGH1": 1.000,
    "DCC_CLOSE2_MUST_BELOW_MID1": True,
    "DCC_CLOSE2_MUST_STAY_ABOVE_OPEN1": True,

    # -----------------
    # RSI DIVERGENCE (strict)
    # -----------------
    "RSI_K": 2,
    "RSI_MIN_BARS_APART": 6,           # base (poi override per TF)
    "RSI_PRICE_DELTA": 0.004,
    "RSI_DELTA": 3.0,
    "RSI_BEAR_MIN_PREV": 58.0,
    "RSI_BULL_MAX_PREV": 42.0,
    "RSI_CLOSE_NEAR_EXTREME_FRAC": 0.25,

    # -----------------
    # BB SQUEEZE
    # -----------------
    "BB_Q": 0.05,
    "BB_MIN_BARS_IN_SQUEEZE": 4,

    # -----------------
    # PIERCING LINE extras
    # -----------------
    "PL_CLOSE1_NEAR_LOW_FRAC": 0.25,
    "PL_SWEEP_EPS": 0.0002,

    # -----------------
    # DEBUG
    # -----------------
    "ENABLE_TICK_DEBUG": False,

    # -----------------
    # BREAK micro-structure
    # -----------------
    "BRK_LOOKBACK": 20,
    "BRK_MIN_PCT": 0.0008,
    "BRK_CLOSE_NEAR_EXT_FRAC": 0.35,
    "BRK_MIN_RNG_PCT": 0.0012,
    "BRK_BODY_MIN_FRAC": 0.25,
    "BRK_WICK_MAX_FRAC": 0.60,
    "BRK_COOLDOWN_BARS": 2,

    # -----------------
    # REJECTION
    # -----------------
    "REJ_WICK_MIN_FRAC": 0.35,
    "REJ_BODY_MAX_FRAC": 0.35,
    "REJ_CLOSE_NEAR_EXT_FRAC": 0.35,
    "REJ_SWEEP_EPS": 0.0004,
    "REJ_REENTER_PCT": 0.0002,
    "REJ_COOLDOWN_BARS": 2,

    # -----------------
    # MIN STRENGTH filters
    # -----------------
    "HAMMER_MIN_STRENGTH": 0.0,
    "SHOOTING_MIN_STRENGTH": 0.0,
    "REJ_MIN_STRENGTH": 0.0,
    "BRK_MIN_STRENGTH": 0.0,
    "DCC_MIN_STRENGTH": 0.0,
    "STAR_MIN_STRENGTH": 0.0,

    # -----------------
    # THIRD strength filters (break/rejection)
    # -----------------
    "THIRD_MIN_STRENGTH_BREAK": 0.55,
    "THIRD_MIN_STRENGTH_REJ": 0.55,

    # -----------------
    # EMA CROSS (base)
    # -----------------
    "EMA_CROSS_MIN_SEP_PCT": 0.00025,        # default generico
    "EMA_CROSS_CLOSE_BUFFER_PCT": 0.00005,   # buffer sul close
    "EMA_CROSS_CONF_REQUIRE_EMA_OK": True,

    # -----------------
    # EMA CROSS TF-aware (per _strict_for_tf)
    # -----------------
    "EMA_CROSS_MIN_SEP_PCT_1M": 0.00055,
    "EMA_CROSS_MIN_SEP_PCT_3M": 0.00035,
    "EMA_CROSS_MIN_SEP_PCT_5M": 0.00025,

    "EMA_CROSS_HOLD_BARS_1M": 2,
    "EMA_CROSS_HOLD_BARS_3M": 1,
    "EMA_CROSS_HOLD_BARS_5M": 0,

    "EMA_CROSS_HOLD_BUFFER_PCT_1M": 0.00010,
    "EMA_CROSS_HOLD_BUFFER_PCT_3M": 0.00007,
    "EMA_CROSS_HOLD_BUFFER_PCT_5M": 0.00005,
}

# ---------------------------------------------------------------------------
# Helper di base
# ---------------------------------------------------------------------------

RAW_CONF_BASE = {
    # candlestick
    "engulfing",
    "morning_star",
    "evening_star",
    "hammer",
    "shooting_star",
    "dark_cloud_cover",
    "piercing_line",

    # indicatori / movimenti
    "rsi_divergence",
    "rsi_divergence_bull",
    "rsi_divergence_bear",

    "ema_cross_9_21_up",
    "ema_cross_9_21_down",
    "ema_cross_9_50_up",
    "ema_cross_9_50_down",

    "ema_alignment",

    "bb_squeeze",
    "bb_squeeze_breakout",

}

def _confirm_A(df: pd.DataFrame, idx: int, direction: str) -> bool:
    """
    Conferma A: la candela successiva chiude oltre high/low della candela del pattern.
    - BULL: close[idx+1] > high[idx]
    - BEAR: close[idx+1] < low[idx]
    """
    if idx is None:
        return False
    nxt = idx + 1
    if nxt >= len(df):
        return False

    try:
        hi = float(df["high"].iloc[idx])
        lo = float(df["low"].iloc[idx])
        close_next = float(df["close"].iloc[nxt])
    except Exception:
        return False

    d = (direction or "").upper()
    if d == "BULL":
        return close_next > hi
    if d == "BEAR":
        return close_next < lo
    return False


def _to_df(data: Any) -> pd.DataFrame:
    if isinstance(data, pd.DataFrame):
        df = data.copy()
    elif isinstance(data, dict):
        df = pd.DataFrame(data)
    else:
        raise TypeError("data deve essere DataFrame o dict compatibile")

    cols = {c.lower(): c for c in df.columns}
    required = ["open", "high", "low", "close"]
    for r in required:
        if r not in cols:
            raise ValueError(f"Manca la colonna '{r}' nei dati")

    # trova timestamp/ts/time se presente come colonna
    ts_col = None
    for cand in ("timestamp", "ts", "time"):
        if cand in df.columns:
            ts_col = cand
            break

    keep = [cols["open"], cols["high"], cols["low"], cols["close"]]
    if ts_col:
        keep = [ts_col] + keep

    rename_map = {
        cols["open"]: "open",
        cols["high"]: "high",
        cols["low"]: "low",
        cols["close"]: "close",
    }
    if ts_col:
        rename_map[ts_col] = "timestamp"

    out = df[keep].rename(columns=rename_map)

    # se timestamp non era in colonna, prova a prenderlo dall’index
    if "timestamp" not in out.columns:
        try:
            idx_name = str(getattr(df.index, "name", "") or "").lower()
            # index nominato timestamp/ts/time
            if idx_name in ("timestamp", "ts", "time"):
                out = out.reset_index().rename(columns={df.index.name: "timestamp"})
            else:
                # se è un DateTimeIndex, usalo comunque
                if isinstance(df.index, pd.DatetimeIndex):
                    out = out.copy()
                    out["timestamp"] = (df.index.view("int64") // 1_000_000).astype("int64")  # ns -> ms
        except Exception:
            pass

    # normalizza timestamp se presente
    if "timestamp" in out.columns:
        try:
            s = out["timestamp"]
            # se datetime-like
            if pd.api.types.is_datetime64_any_dtype(s):
                out["timestamp"] = (s.view("int64") // 1_000_000).astype("int64")
            else:
                out["timestamp"] = pd.to_numeric(s, errors="coerce").astype("Int64")
                # prova a capire se è in secondi e convertirlo a ms (euristica)
                # se i valori sono ~1e9-1e10 => secondi, ~1e12-1e13 => ms
                mx = out["timestamp"].dropna().max()
                if mx is not None:
                    mx = int(mx)
                    if 1_000_000_000 <= mx < 100_000_000_000:  # secondi (2001..5138 circa)
                        out["timestamp"] = (out["timestamp"] * 1000).astype("Int64")
                out["timestamp"] = out["timestamp"].astype("int64", errors="ignore")
        except Exception:
            pass

    return out

# ---------------------------------------------------------------------------
# Identificatori interni dei pattern
# ---------------------------------------------------------------------------

ENGULFING = "ENGULFING"
HAMMER = "HAMMER"
SHOOTING_STAR = "SHOOTING_STAR"
MORNING_STAR = "MORNING_STAR"
EVENING_STAR = "EVENING_STAR"
PIERCING_LINE = "PIERCING_LINE"
DARK_CLOUD_COVER = "DARK_CLOUD_COVER"

EMA_CROSS_9_21_UP = "EMA_CROSS_9_21_UP"
EMA_CROSS_9_21_DOWN = "EMA_CROSS_9_21_DOWN"
EMA_CROSS_9_50_UP = "EMA_CROSS_9_50_UP"
EMA_CROSS_9_50_DOWN = "EMA_CROSS_9_50_DOWN"

EMA_ALIGNMENT_TREND = "EMA_ALIGNMENT_TREND"
BB_SQUEEZE = "BB_SQUEEZE"
RSI_DIVERGENCE = "RSI_DIVERGENCE"
TRIPLE_BOTTOM = "TRIPLE_BOTTOM"
TRIPLE_TOP = "TRIPLE_TOP"

TICK_UP = "TICK_UP"
TICK_DOWN = "TICK_DOWN"

BREAK_HIGH = "BREAK_HIGH"
BREAK_LOW = "BREAK_LOW"
REJECTION_HIGH = "REJECTION_HIGH"
REJECTION_LOW = "REJECTION_LOW"


_PATTERN_ALIAS_MAP: Dict[str, str] = {
    "ENGULFING": ENGULFING,
    "CDLENGULFING": ENGULFING,
    "BULLISH_ENGULFING": ENGULFING,
    "BEARISH_ENGULFING": ENGULFING,

    "HAMMER": HAMMER,
    "CDLHAMMER": HAMMER,

    "SHOOTINGSTAR": SHOOTING_STAR,
    "SHOOTING_STAR": SHOOTING_STAR,
    "CDLSHOOTINGSTAR": SHOOTING_STAR,

    "MORNINGSTAR": MORNING_STAR,
    "MORNING_STAR": MORNING_STAR,
    "CDLMORNINGSTAR": MORNING_STAR,

    "EVENINGSTAR": EVENING_STAR,
    "EVENING_STAR": EVENING_STAR,
    "CDLEVENINGSTAR": EVENING_STAR,

    "PIERCINGLINE": PIERCING_LINE,
    "PIERCING_LINE": PIERCING_LINE,

    "DARKCLOUDCOVER": DARK_CLOUD_COVER,
    "DARK_CLOUD_COVER": DARK_CLOUD_COVER,

    "EMA_CROSS_9_21_UP": EMA_CROSS_9_21_UP,
    "EMA_CROSS_9_21_DOWN": EMA_CROSS_9_21_DOWN,
    "EMA_CROSS_9_50_UP": EMA_CROSS_9_50_UP,
    "EMA_CROSS_9_50_DOWN": EMA_CROSS_9_50_DOWN,

    "EMA_ALIGNMENT": EMA_ALIGNMENT_TREND,
    "EMA_ALIGNMENT_TREND": EMA_ALIGNMENT_TREND,
    "BB_SQUEEZE": BB_SQUEEZE,
    "RSI_DIVERGENCE": RSI_DIVERGENCE,

    "TRIPLE_BOTTOM": TRIPLE_BOTTOM,
    "TRIPLE_TOP": TRIPLE_TOP,

    "TICK_UP": TICK_UP,
    "TICK_DOWN": TICK_DOWN,
    "TICKUP": TICK_UP,
    "TICKDOWN": TICK_DOWN,

    "BREAK_HIGH": BREAK_HIGH,
    "BREAK_LOW": BREAK_LOW,
    "REJECTION_HIGH": REJECTION_HIGH,
    "REJECTION_LOW": REJECTION_LOW,
}


PATTERN_PATTERNS: Set[str] = {
    ENGULFING,
    HAMMER,
    SHOOTING_STAR,
    MORNING_STAR,
    EVENING_STAR,
    PIERCING_LINE,
    DARK_CLOUD_COVER,
    TRIPLE_BOTTOM,
    TRIPLE_TOP,
}

MOVEMENT_PATTERNS: Set[str] = {
    EMA_CROSS_9_21_UP,
    EMA_CROSS_9_21_DOWN,
    EMA_CROSS_9_50_UP,
    EMA_CROSS_9_50_DOWN,
    EMA_ALIGNMENT_TREND,
    BB_SQUEEZE,
    RSI_DIVERGENCE,
    TICK_UP,
    TICK_DOWN,
    BREAK_HIGH,
    BREAK_LOW,
    REJECTION_HIGH,
    REJECTION_LOW,
}

ALL_PATTERNS: Set[str] = PATTERN_PATTERNS | MOVEMENT_PATTERNS


def _normalize_input_token(s: str) -> str:
    """
    Normalizza token che arrivano dal catalogo / matcher, es:
      - "dark_cloud_cover_confirmed" -> "DARK_CLOUD_COVER"
      - "engulfing_raw__SHORT" -> "ENGULFING"
      - "ema_cross_9_21_down_raw@5m" -> "EMA_CROSS_9_21_DOWN"
    """
    if not s:
        return ""
    x = str(s).strip().upper()

    if "@" in x:
        x = x.split("@", 1)[0].strip()

    if "__" in x:
        x = x.split("__", 1)[0].strip()

    for suf in ("_CONFIRMED", "_RAW"):
        if x.endswith(suf):
            x = x[: -len(suf)].strip()

    x = x.replace(" ", "").replace("-", "_")
    return x


def _normalize_pattern_name(name: str) -> Optional[str]:
    if not name:
        return None
    key = str(name).upper().replace(" ", "").replace("-", "").replace("__", "_")
    return _PATTERN_ALIAS_MAP.get(key)


def _resolve_patterns(patterns: Optional[Sequence[str]]) -> Set[str]:
    if isinstance(patterns, str):
        patterns = [patterns]

    if not patterns:
        # Default = ALL (evita che un chiamante dimentichi patterns="ALL")
        return set(ALL_PATTERNS)

    out: Set[str] = set()
    for p in patterns:
        if not p:
            continue
        up = _normalize_input_token(p)
        if not up:
            continue

        if up in {"ALL", "*"}:
            return set(ALL_PATTERNS)

        if up in {"PATTERN", "PATTERNS"}:
            out |= set(PATTERN_PATTERNS)
            continue

        if up in {"MOVEMENT", "MOVEMENTS"}:
            out |= set(MOVEMENT_PATTERNS)
            continue

        if up in {"EMA_CROSS_9_21", "EMA9_21", "EMA9X21"}:
            out.add(EMA_CROSS_9_21_UP)
            out.add(EMA_CROSS_9_21_DOWN)
            continue

        if up in {"EMA_CROSS_9_50", "EMA9_50", "EMA9X50"}:
            out.add(EMA_CROSS_9_50_UP)
            out.add(EMA_CROSS_9_50_DOWN)
            continue

        if up in {"EMA_CROSS_9_21_UP", "EMA_CROSS_9_21_DOWN"}:
            norm = _normalize_pattern_name(up)
            if norm:
                out.add(norm)
            continue

        if up in {"EMA_CROSS_9_50_UP", "EMA_CROSS_9_50_DOWN"}:
            norm = _normalize_pattern_name(up)
            if norm:
                out.add(norm)
            continue

        norm = _normalize_pattern_name(up)
        if norm:
            out.add(norm)

    return out


# ---------------------------------------------------------------------------
# Helper candle math
# ---------------------------------------------------------------------------

def _rng(high: float, low: float) -> float:
    return float(high - low)


def _body(open_: float, close: float) -> float:
    return float(abs(close - open_))


def _upper_wick(high: float, open_: float, close: float) -> float:
    return float(high - max(open_, close))


def _lower_wick(low: float, open_: float, close: float) -> float:
    return float(min(open_, close) - low)


def _trend_pct(close: pd.Series, i: int, lookback: int) -> float:
    """
    Ritorna variazione % tra close[i-lookback] e close[i-1].
    Usa i-1 per evitare includere la candela del pattern nel contesto.
    """
    if i - lookback < 0 or i - 1 < 0:
        return 0.0
    a = float(close.iloc[i - lookback])
    b = float(close.iloc[i - 1])
    if a <= 0:
        return 0.0
    return (b - a) / a


def _close_near_high(open_: float, high: float, low: float, close: float, frac: float) -> bool:
    r = _rng(high, low)
    if r <= 0:
        return False
    return (high - close) <= r * frac


def _close_near_low(open_: float, high: float, low: float, close: float, frac: float) -> bool:
    r = _rng(high, low)
    if r <= 0:
        return False
    return (close - low) <= r * frac


def _detect_tick(df: pd.DataFrame, *, eps: float = 1e-12) -> List[PatternHit]:
    hits: List[PatternHit] = []
    if df is None or len(df) < 2:
        return hits
    if "close" not in df.columns:
        return hits

    closes = df["close"].tolist()
    for i in range(1, len(closes)):
        try:
            a = float(closes[i - 1])
            b = float(closes[i])
        except Exception:
            continue

        if b > a + eps:
            hits.append({"pattern": "TICK_UP", "name": "tick_up", "index": int(i), "direction": "BULL", "strength": 1.0, "pat": "tick_up", "dir": "BULL"})
        elif b < a - eps:
            hits.append({"pattern": "TICK_DOWN", "name": "tick_down", "index": int(i), "direction": "BEAR", "strength": 1.0, "pat": "tick_down", "dir": "BEAR"})

    return hits

def _fmt(x: float, nd: int = 6) -> str:
    try:
        return f"{float(x):.{nd}f}"
    except Exception:
        return "NA"

def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)

def _safe_div(a: float, b: float, eps: float = 1e-12) -> float:
    return float(a / (b + eps))

def _explain_engulfing_last(df: pd.DataFrame, strict: Dict[str, Any], last_idx: int) -> Dict[str, Any]:
    """
    Spiega perché NON scatta engulfing sull'ultima candela (o perché scatta).
    Restituisce: {"ok": bool, "why": [..], "dir": "BULL/BEAR/NA", "vals": {...}}
    """
    out = {"ok": False, "why": [], "dir": "NA", "vals": {}}

    if last_idx <= 0 or last_idx >= len(df):
        out["why"].append("E0: last_idx invalid or no prev candle")
        return out

    o = df["open"].astype(float)
    c = df["close"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)

    i = last_idx
    o1, c1, h1, l1 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
    o2, c2, h2, l2 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

    rng1 = _rng(h1, l1)
    rng2 = _rng(h2, l2)
    out["vals"].update({
        "o1": o1, "c1": c1, "h1": h1, "l1": l1, "rng1": rng1,
        "o2": o2, "c2": c2, "h2": h2, "l2": l2, "rng2": rng2,
    })

    if rng1 <= 0 or rng2 <= 0:
        out["why"].append("E1: rng<=0")
        return out

    # mediana range recente (anti-noise)
    win = int(strict.get("ENG_MED_RANGE_WIN", 30))
    min_med = float(strict.get("ENG_MIN_RANGE_FRAC_MED", 0.55))
    med_rng = None
    if i - win >= 0:
        try:
            med_rng = float((h.iloc[i - win : i] - l.iloc[i - win : i]).median())
            out["vals"]["med_rng"] = med_rng
        except Exception:
            med_rng = None

    if med_rng and med_rng > 0:
        if rng1 < med_rng * min_med:
            out["why"].append(f"E2: rng1<{min_med}*med  ({_fmt(rng1)} < {_fmt(med_rng*min_med)})")
        if rng2 < med_rng * min_med:
            out["why"].append(f"E3: rng2<{min_med}*med  ({_fmt(rng2)} < {_fmt(med_rng*min_med)})")

    body1 = _body(o1, c1)
    body2 = _body(o2, c2)
    out["vals"]["body1"] = body1
    out["vals"]["body2"] = body2

    b1_min = float(strict.get("ENG_BODY1_MIN_FRAC_RANGE1", 0.18))
    b2_min = float(strict.get("ENG_BODY2_MIN_FRAC_RANGE2", 0.50))
    cur_x_prev = float(strict.get("ENG_BODY_CUR_X_PREV", 1.35))

    if body1 < rng1 * b1_min:
        out["why"].append(f"E4: body1<{b1_min}*rng1  ({_fmt(body1)} < {_fmt(rng1*b1_min)})")
    if body2 < rng2 * b2_min:
        out["why"].append(f"E5: body2<{b2_min}*rng2  ({_fmt(body2)} < {_fmt(rng2*b2_min)})")
    if body2 < body1 * cur_x_prev:
        out["why"].append(f"E6: body2<{cur_x_prev}*body1  ({_fmt(body2)} < {_fmt(body1*cur_x_prev)})")

    low1b = min(o1, c1)
    high1b = max(o1, c1)
    low2b = min(o2, c2)
    high2b = max(o2, c2)

    # direzione candidata
    bull = (c1 < o1) and (c2 > o2)
    bear = (c1 > o1) and (c2 < o2)

    if not (bull or bear):
        out["why"].append("E7: colors not opposite (need red->green or green->red)")
        return out

    if bull:
        out["dir"] = "BULL"
        if not (low2b <= low1b and high2b >= high1b):
            out["why"].append(f"E8B: body2 not engulfing body1 (low2b<=low1b and high2b>=high1b failed)")
    if bear:
        out["dir"] = "BEAR"
        if not (low2b <= low1b and high2b >= high1b):
            out["why"].append(f"E8S: body2 not engulfing body1 (low2b<=low1b and high2b>=high1b failed)")

    if not out["why"]:
        out["ok"] = True
    return out


def _explain_hammer_last(df: pd.DataFrame, strict: Dict[str, Any], last_idx: int) -> Dict[str, Any]:
    """
    Spiega perché NON scatta hammer sull'ultima candela (o perché scatta).
    """
    out = {"ok": False, "why": [], "dir": "BULL", "vals": {}}

    if last_idx < 0 or last_idx >= len(df):
        out["why"].append("H0: last_idx invalid")
        return out

    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    i = last_idx
    open_ = float(o.iloc[i]); high = float(h.iloc[i]); low = float(l.iloc[i]); close = float(c.iloc[i])

    rng = _rng(high, low)
    if rng <= 0:
        out["why"].append("H1: rng<=0")
        return out

    body = _body(open_, close)
    upper = _upper_wick(high, open_, close)
    lower = _lower_wick(low, open_, close)

    out["vals"].update({
        "open": open_, "high": high, "low": low, "close": close,
        "rng": rng, "body": body, "upper": upper, "lower": lower
    })

    body_max = float(strict["BODY_MAX_FRAC"])
    body_min = float(strict["BODY_MIN_FRAC"])
    wick_long_frac = float(strict["WICK_LONG_MIN_FRAC"])
    wick_long_x_body = float(strict["WICK_LONG_MIN_X_BODY"])
    wick_short_max = float(strict["WICK_SHORT_MAX_FRAC"])

    if body > rng * body_max:
        out["why"].append(f"H2: body>BODY_MAX_FRAC  ({_fmt(body)} > {_fmt(rng*body_max)})")
    if body < rng * body_min:
        out["why"].append(f"H3: body<BODY_MIN_FRAC  ({_fmt(body)} < {_fmt(rng*body_min)})")

    need_lower = max(body * wick_long_x_body, rng * wick_long_frac)
    if lower < need_lower:
        out["why"].append(f"H4: lower wick too short  ({_fmt(lower)} < {_fmt(need_lower)})")

    if upper > rng * wick_short_max:
        out["why"].append(f"H5: upper wick too long  ({_fmt(upper)} > {_fmt(rng*wick_short_max)})")

    # close near high
    if not _close_near_high(open_, high, low, close, frac=0.25):
        out["why"].append("H6: close not near high (frac=0.25)")

    # trend context: deve esserci downtrend prima
    lookback = int(strict["TREND_LOOKBACK"])
    t = _trend_pct(c, i, lookback)
    trend_min = float(strict["TREND_MIN_PCT"])
    out["vals"]["trend_pct"] = t
    out["vals"]["lookback"] = lookback
    out["vals"]["trend_min"] = trend_min

    if t > -trend_min:
        out["why"].append(f"H7: trend not down enough  (trend_pct={_fmt(t)} > -{_fmt(trend_min)})")

    if not out["why"]:
        out["ok"] = True
    return out

# ---------------------------------------------------------------------------
# STRICT per TF (override)
# ---------------------------------------------------------------------------

def _strict_for_tf(tf: Optional[str]) -> Dict[str, Any]:
    base = dict(STRICT)
    t = (tf or "").lower().strip()

    # 1m: più anti-noise, ma trend min più basso (per non essere cieco)
    if t in ("1m", "1"):
        base.update({
            "TREND_LOOKBACK": 8,
            "TREND_MIN_PCT": 0.0025,
            "STAR_TREND_MIN_PCT": 0.0035,

            "ENG_MED_RANGE_WIN": 40,
            "ENG_MIN_RANGE_FRAC_MED": 0.65,

            "EMA_CROSS_MIN_SEP_PCT": base["EMA_CROSS_MIN_SEP_PCT_1M"],
            "EMA_CROSS_HOLD_BARS": base["EMA_CROSS_HOLD_BARS_1M"],
            "EMA_CROSS_HOLD_BUFFER_PCT": base["EMA_CROSS_HOLD_BUFFER_PCT_1M"],

            # RSI: su 1m aumentiamo la distanza minima (anti-noise)
            "RSI_MIN_BARS_APART": 10,  # 10 minuti

            "HAMMER_MIN_STRENGTH": 0.75,
            "SHOOTING_MIN_STRENGTH": 0.75,
            "STAR_MIN_STRENGTH": 0.65,
            "DCC_MIN_STRENGTH": 0.65,
            "PL_MIN_STRENGTH": 0.65,
            "BRK_MIN_STRENGTH": 0.60,
            "REJ_MIN_STRENGTH": 0.65,
        })
        return base

    # 5m: meno anti-noise, ma trend min più alto
    if t in ("5m", "5"):
        base.update({
            "TREND_LOOKBACK": 5,
            "TREND_MIN_PCT": 0.0045,
            "STAR_TREND_MIN_PCT": 0.0060,

            "ENG_MED_RANGE_WIN": 25,
            "ENG_MIN_RANGE_FRAC_MED": 0.50,

            "EMA_CROSS_MIN_SEP_PCT": base["EMA_CROSS_MIN_SEP_PCT_5M"],
            "EMA_CROSS_HOLD_BARS": base["EMA_CROSS_HOLD_BARS_5M"],
            "EMA_CROSS_HOLD_BUFFER_PCT": base["EMA_CROSS_HOLD_BUFFER_PCT_5M"],

            "RSI_MIN_BARS_APART": 6,  # 30 minuti (6*5m)

            "HAMMER_MIN_STRENGTH": 0.65,
            "SHOOTING_MIN_STRENGTH": 0.65,
            "STAR_MIN_STRENGTH": 0.55,
            "DCC_MIN_STRENGTH": 0.55,
            "PL_MIN_STRENGTH": 0.55,
            "BRK_MIN_STRENGTH": 0.50,
            "REJ_MIN_STRENGTH": 0.55,
        })
        return base

    # 3m default
    base.update({
        "TREND_LOOKBACK": 6,
        "TREND_MIN_PCT": 0.0035,
        "STAR_TREND_MIN_PCT": 0.0045,

        "ENG_MED_RANGE_WIN": 30,
        "ENG_MIN_RANGE_FRAC_MED": 0.55,

        "EMA_CROSS_MIN_SEP_PCT": base["EMA_CROSS_MIN_SEP_PCT_3M"],
        "EMA_CROSS_HOLD_BARS": base["EMA_CROSS_HOLD_BARS_3M"],
        "EMA_CROSS_HOLD_BUFFER_PCT": base["EMA_CROSS_HOLD_BUFFER_PCT_3M"],

        "RSI_MIN_BARS_APART": 8,  # 24 minuti (8*3m)

        "HAMMER_MIN_STRENGTH": 0.70,
        "SHOOTING_MIN_STRENGTH": 0.70,
        "STAR_MIN_STRENGTH": 0.60,
        "DCC_MIN_STRENGTH": 0.60,
        "PL_MIN_STRENGTH": 0.60,
        "BRK_MIN_STRENGTH": 0.55,
        "REJ_MIN_STRENGTH": 0.60,
    })
    return base

# ---------------------------------------------------------------------------
# ENGULFING (strict, range-based + TF-aware anti-noise)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# DEBUG (perché non trovi hit)
# Abilita con:
#   ORIONE_PAT_DEBUG=1
#   ORIONE_PAT_DEBUG_COIN=SOL
#   ORIONE_PAT_DEBUG_TF=1m   (opzionale)
#   ORIONE_PAT_DEBUG_LAST_N=3
# Nota: coin non arriva a patterns.py; lo "inferiamo" da env (debug mirato).
# ---------------------------------------------------------------------------

def _dbg_engulfing_last(df: pd.DataFrame, strict: Dict[str, Any], i: int) -> Dict[str, Any]:
    # i deve essere >=1
    out: Dict[str, Any] = {"i": int(i), "ok": False, "reasons": []}

    o = df["open"].astype(float)
    c = df["close"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)

    if i < 1 or i >= len(df):
        out["reasons"].append("bad_index")
        return out

    o1, c1, h1, l1 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
    o2, c2, h2, l2 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

    rng1 = _rng(h1, l1)
    rng2 = _rng(h2, l2)
    out.update({"rng1": rng1, "rng2": rng2})
    if rng1 <= 0 or rng2 <= 0:
        out["reasons"].append("rng<=0")
        return out

    win = int(strict.get("ENG_MED_RANGE_WIN", 30))
    if i - win >= 0:
        med_rng = float((h.iloc[i - win : i] - l.iloc[i - win : i]).median())
        out["med_rng"] = med_rng
        if med_rng > 0:
            min_med = float(strict.get("ENG_MIN_RANGE_FRAC_MED", 0.55))
            if rng1 < med_rng * min_med:
                out["reasons"].append(f"rng1<med*{min_med}")
            if rng2 < med_rng * min_med:
                out["reasons"].append(f"rng2<med*{min_med}")

    body1 = _body(o1, c1)
    body2 = _body(o2, c2)
    out.update({"body1": body1, "body2": body2})

    b1min = float(strict.get("ENG_BODY1_MIN_FRAC_RANGE1", 0.18))
    b2min = float(strict.get("ENG_BODY2_MIN_FRAC_RANGE2", 0.50))
    curx = float(strict.get("ENG_BODY_CUR_X_PREV", 1.35))

    if body1 < rng1 * b1min:
        out["reasons"].append(f"body1<rng1*{b1min}")
    if body2 < rng2 * b2min:
        out["reasons"].append(f"body2<rng2*{b2min}")
    if body2 < body1 * curx:
        out["reasons"].append(f"body2<body1*{curx}")

    low1b = min(o1, c1); high1b = max(o1, c1)
    low2b = min(o2, c2); high2b = max(o2, c2)

    is_bull = (c1 < o1) and (c2 > o2)
    is_bear = (c1 > o1) and (c2 < o2)
    out.update({"is_bull_setup": bool(is_bull), "is_bear_setup": bool(is_bear)})

    if is_bull:
        if not ((low2b <= low1b) and (high2b >= high1b)):
            out["reasons"].append("bull_body_not_engulf")
    if is_bear:
        if not ((low2b <= low1b) and (high2b >= high1b)):
            out["reasons"].append("bear_body_not_engulf")

    if not out["reasons"]:
        out["ok"] = True
    return out

def _detect_engulfing(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    c = df["close"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 2:
        return hits

    for i in range(1, len(df)):
        o1, c1, h1, l1 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
        o2, c2, h2, l2 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

        rng1 = _rng(h1, l1)
        rng2 = _rng(h2, l2)
        if rng1 <= 0 or rng2 <= 0:
            continue

        # mediana range recente (anti-noise)
        win = int(strict.get("ENG_MED_RANGE_WIN", 30))
        if i - win >= 0:
            med_rng = float((h.iloc[i - win : i] - l.iloc[i - win : i]).median())
            if med_rng > 0:
                min_med = float(strict.get("ENG_MIN_RANGE_FRAC_MED", 0.55))
                if rng1 < med_rng * min_med:
                    continue
                if rng2 < med_rng * min_med:
                    continue

        body1 = _body(o1, c1)
        body2 = _body(o2, c2)

        if body1 < rng1 * float(strict.get("ENG_BODY1_MIN_FRAC_RANGE1", 0.18)):
            continue
        if body2 < rng2 * float(strict.get("ENG_BODY2_MIN_FRAC_RANGE2", 0.50)):
            continue

        if body2 < body1 * float(strict.get("ENG_BODY_CUR_X_PREV", 1.35)):
            continue

        low1b = min(o1, c1)
        high1b = max(o1, c1)
        low2b = min(o2, c2)
        high2b = max(o2, c2)

        if (c1 < o1) and (c2 > o2):  # bullish
            if (low2b <= low1b) and (high2b >= high1b):
                strength = float(min(1.0, body2 / (body1 + 1e-9)))
                hits.append({"pattern": ENGULFING, "name": "BULLISH_ENGULFING", "index": int(i), "direction": "BULL", "strength": strength})

        if (c1 > o1) and (c2 < o2):  # bearish
            if (low2b <= low1b) and (high2b >= high1b):
                strength = float(min(1.0, body2 / (body1 + 1e-9)))
                hits.append({"pattern": ENGULFING, "name": "BEARISH_ENGULFING", "index": int(i), "direction": "BEAR", "strength": strength})

    return hits


# ---------------------------------------------------------------------------
# HAMMER / SHOOTING STAR
# ---------------------------------------------------------------------------
def _dbg_hammer_last(df: pd.DataFrame, strict: Dict[str, Any], i: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {"i": int(i), "ok": False, "reasons": []}
    o = float(df["open"].iloc[i]); h = float(df["high"].iloc[i]); l = float(df["low"].iloc[i]); c = float(df["close"].iloc[i])

    rng = _rng(h, l)
    if rng <= 0:
        out["reasons"].append("rng<=0")
        return out

    body = _body(o, c)
    upper = _upper_wick(h, o, c)
    lower = _lower_wick(l, o, c)
    out.update({"rng": rng, "body": body, "upper": upper, "lower": lower})

    if body > rng * float(strict["BODY_MAX_FRAC"]):
        out["reasons"].append("body>BODY_MAX_FRAC")
    if body < rng * float(strict["BODY_MIN_FRAC"]):
        out["reasons"].append("body<BODY_MIN_FRAC")

    if lower < max(body * float(strict["WICK_LONG_MIN_X_BODY"]), rng * float(strict["WICK_LONG_MIN_FRAC"])):
        out["reasons"].append("lower_not_long_enough")
    if upper > rng * float(strict["WICK_SHORT_MAX_FRAC"]):
        out["reasons"].append("upper_too_big")

    if not _close_near_high(o, h, l, c, frac=0.25):
        out["reasons"].append("close_not_near_high")

    lookback = int(strict["TREND_LOOKBACK"])
    t = _trend_pct(df["close"].astype(float), i, lookback)
    out["trend_pct"] = t
    if t > -float(strict["TREND_MIN_PCT"]):
        out["reasons"].append("trend_not_down_enough")

    if not out["reasons"]:
        out["ok"] = True
    return out


def _dbg_shooting_last(df: pd.DataFrame, strict: Dict[str, Any], i: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {"i": int(i), "ok": False, "reasons": []}
    o = float(df["open"].iloc[i]); h = float(df["high"].iloc[i]); l = float(df["low"].iloc[i]); c = float(df["close"].iloc[i])

    rng = _rng(h, l)
    if rng <= 0:
        out["reasons"].append("rng<=0")
        return out

    body = _body(o, c)
    upper = _upper_wick(h, o, c)
    lower = _lower_wick(l, o, c)
    out.update({"rng": rng, "body": body, "upper": upper, "lower": lower})

    if body > rng * float(strict["BODY_MAX_FRAC"]):
        out["reasons"].append("body>BODY_MAX_FRAC")
    if body < rng * float(strict["BODY_MIN_FRAC"]):
        out["reasons"].append("body<BODY_MIN_FRAC")

    if upper < max(body * float(strict["WICK_LONG_MIN_X_BODY"]), rng * float(strict["WICK_LONG_MIN_FRAC"])):
        out["reasons"].append("upper_not_long_enough")
    if lower > rng * float(strict["WICK_SHORT_MAX_FRAC"]):
        out["reasons"].append("lower_too_big")

    if not _close_near_low(o, h, l, c, frac=0.25):
        out["reasons"].append("close_not_near_low")

    lookback = int(strict["TREND_LOOKBACK"])
    t = _trend_pct(df["close"].astype(float), i, lookback)
    out["trend_pct"] = t
    if t < float(strict["TREND_MIN_PCT"]):
        out["reasons"].append("trend_not_up_enough")

    if not out["reasons"]:
        out["ok"] = True
    return out

def _detect_hammer(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if df.empty:
        return hits

    for i in range(len(df)):
        open_ = float(o.iloc[i]); high = float(h.iloc[i]); low = float(l.iloc[i]); close = float(c.iloc[i])

        rng = _rng(high, low)
        if rng <= 0:
            continue

        body = _body(open_, close)
        upper = _upper_wick(high, open_, close)
        lower = _lower_wick(low, open_, close)

        if body > rng * float(strict["BODY_MAX_FRAC"]):
            continue
        if body < rng * float(strict["BODY_MIN_FRAC"]):
            continue

        if lower < max(body * float(strict["WICK_LONG_MIN_X_BODY"]), rng * float(strict["WICK_LONG_MIN_FRAC"])):
            continue
        if upper > rng * float(strict["WICK_SHORT_MAX_FRAC"]):
            continue

        if not _close_near_high(open_, high, low, close, frac=0.25):
            continue

        lookback = int(strict["TREND_LOOKBACK"])
        t = _trend_pct(c, i, lookback)
        if t > -float(strict["TREND_MIN_PCT"]):
            continue

        strength = float(min(1.0, lower / (body + 1e-9)))
        min_s = float(strict.get("HAMMER_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": HAMMER,
            "name": "HAMMER",
            "index": int(i),
            "direction": "BULL",
            "strength": float(strength),
        })

    return hits


def _detect_shooting_star(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if df.empty:
        return hits

    for i in range(len(df)):
        open_ = float(o.iloc[i]); high = float(h.iloc[i]); low = float(l.iloc[i]); close = float(c.iloc[i])

        rng = _rng(high, low)
        if rng <= 0:
            continue

        body = _body(open_, close)
        upper = _upper_wick(high, open_, close)
        lower = _lower_wick(low, open_, close)

        if body > rng * float(strict["BODY_MAX_FRAC"]):
            continue
        if body < rng * float(strict["BODY_MIN_FRAC"]):
            continue

        if upper < max(body * float(strict["WICK_LONG_MIN_X_BODY"]), rng * float(strict["WICK_LONG_MIN_FRAC"])):
            continue
        if lower > rng * float(strict["WICK_SHORT_MAX_FRAC"]):
            continue

        if not _close_near_low(open_, high, low, close, frac=0.25):
            continue

        lookback = int(strict["TREND_LOOKBACK"])
        t = _trend_pct(c, i, lookback)
        if t < float(strict["TREND_MIN_PCT"]):
            continue

        strength = float(min(1.0, upper / (body + 1e-9)))
        min_s = float(strict.get("SHOOTING_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": SHOOTING_STAR,
            "name": "SHOOTING_STAR",
            "index": int(i),
            "direction": "BEAR",
            "strength": float(strength),
        })

    return hits

def _detect_break_high_low(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)
    o = df["open"].astype(float)

    hits: List[PatternHit] = []
    if df.empty:
        return hits

    lb = int(strict.get("BRK_LOOKBACK", 20))
    min_pct = float(strict.get("BRK_MIN_PCT", 0.0008))  # 0.08%
    close_frac = float(strict.get("BRK_CLOSE_NEAR_EXT_FRAC", 0.35))

    # anti-fake
    min_rng_pct = float(strict.get("BRK_MIN_RNG_PCT", 0.0012))
    body_min_frac = float(strict.get("BRK_BODY_MIN_FRAC", 0.25))
    wick_max_frac = float(strict.get("BRK_WICK_MAX_FRAC", 0.60))
    cooldown_bars = int(strict.get("BRK_COOLDOWN_BARS", 2))

    # soglia unica (pattern vs third)
    min_strength = float(max(
        float(strict.get("BRK_MIN_STRENGTH", 0.0)),
        float(strict.get("THIRD_MIN_STRENGTH_BREAK", 0.0)),
    ))

    last_hit_i = -10_000

    for i in range(len(df)):
        if i - lb < 0:
            continue
        if (i - last_hit_i) <= cooldown_bars:
            continue

        open_ = float(o.iloc[i])
        high = float(h.iloc[i])
        low = float(l.iloc[i])
        close = float(c.iloc[i])
        if close <= 0:
            continue

        rng = _rng(high, low)
        if rng <= 0:
            continue

        # micro-candle filter
        if rng < (abs(close) * min_rng_pct):
            continue

        body = _body(open_, close)
        upper = _upper_wick(high, open_, close)
        lower = _lower_wick(low, open_, close)

        # corpo minimo: evita wick-only spike
        if body < (rng * body_min_frac):
            continue

        prev_hi = float(h.iloc[i - lb : i].max())
        prev_lo = float(l.iloc[i - lb : i].min())

        # -------------------------
        # BREAK HIGH
        # -------------------------
        if close > prev_hi * (1.0 + min_pct):
            # richiedi anche che l'high abbia davvero rotto
            if high <= prev_hi * (1.0 + (min_pct * 0.5)):
                continue

            # wick contro-break (lower) non eccessivo
            if lower > (rng * wick_max_frac):
                continue

            # candela bull “vera”
            if close <= open_:
                continue

            # close vicino al massimo
            if not _close_near_high(open_, high, low, close, frac=close_frac):
                continue

            # ---- strength (0..1) ----
            ft = _safe_div((close - prev_hi), (abs(prev_hi) * min_pct))
            ft_s = _clamp01(ft)

            dist_high = _safe_div((high - close), (rng * close_frac))
            near_s = _clamp01(1.0 - dist_high)

            body_s = _clamp01(_safe_div(body, (rng * body_min_frac)))

            wick_s = _clamp01(1.0 - _safe_div(lower, (rng * wick_max_frac)))

            strength = _clamp01(0.35 * ft_s + 0.25 * near_s + 0.25 * body_s + 0.15 * wick_s)

            if float(strength) < min_strength:
                continue

            hits.append({
                "pattern": "break_high",
                "name": "break_high",
                "index": int(i),
                "direction": "BULL",
                "strength": float(strength),
                "pat": "break_high",
                "dir": "BULL",
            })
            last_hit_i = i
            continue

        # -------------------------
        # BREAK LOW
        # -------------------------
        if close < prev_lo * (1.0 - min_pct):
            if low >= prev_lo * (1.0 - (min_pct * 0.5)):
                continue

            if upper > (rng * wick_max_frac):
                continue

            # candela bear “vera”
            if close >= open_:
                continue

            if not _close_near_low(open_, high, low, close, frac=close_frac):
                continue

            # ---- strength (0..1) ----
            ft = _safe_div((prev_lo - close), (abs(prev_lo) * min_pct))
            ft_s = _clamp01(ft)

            dist_low = _safe_div((close - low), (rng * close_frac))
            near_s = _clamp01(1.0 - dist_low)

            body_s = _clamp01(_safe_div(body, (rng * body_min_frac)))

            wick_s = _clamp01(1.0 - _safe_div(upper, (rng * wick_max_frac)))

            strength = _clamp01(0.35 * ft_s + 0.25 * near_s + 0.25 * body_s + 0.15 * wick_s)

            if float(strength) < min_strength:
                continue

            hits.append({
                "pattern": "break_low",
                "name": "break_low",
                "index": int(i),
                "direction": "BEAR",
                "strength": float(strength),
                "pat": "break_low",
                "dir": "BEAR",
            })
            last_hit_i = i
            continue

    return hits


# ---------------------------------------------------------------------------
# REJECTION HIGH/LOW (strict sweep + re-entry) + strength “vera”
# ---------------------------------------------------------------------------

def _detect_rejection_high_low(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 2:
        return hits

    wick_min = float(strict.get("REJ_WICK_MIN_FRAC", 0.35))         # wick dominante
    body_max = float(strict.get("REJ_BODY_MAX_FRAC", 0.35))         # corpo piccolo
    close_frac = float(strict.get("REJ_CLOSE_NEAR_EXT_FRAC", 0.35)) # close near low/high
    eps = float(strict.get("REJ_SWEEP_EPS", 0.0004))                # 0.04% sweep minimo

    # chiave anti-fake: rientro sotto/sopra il livello sweepato
    reenter_pct = float(strict.get("REJ_REENTER_PCT", 0.0002))      # 0.02% rientro minimo

    # evita spam su barre contigue
    cooldown_bars = int(strict.get("REJ_COOLDOWN_BARS", 2))

    last_hit_i = -10_000

    for i in range(1, len(df)):
        if (i - last_hit_i) <= cooldown_bars:
            continue

        open_ = float(o.iloc[i])
        high = float(h.iloc[i])
        low = float(l.iloc[i])
        close = float(c.iloc[i])

        rng = _rng(high, low)
        if rng <= 0:
            continue

        body = _body(open_, close)
        upper = _upper_wick(high, open_, close)
        lower = _lower_wick(low, open_, close)

        # corpo piccolo (rejection)
        if body > rng * body_max:
            continue

        prev_hi = float(h.iloc[i - 1])
        prev_lo = float(l.iloc[i - 1])

        # ---------------------------------------------------------
        # REJECTION HIGH = sweep sopra prev_hi + close rientrato sotto prev_hi
        # ---------------------------------------------------------
        swept_high = high > (prev_hi * (1.0 + eps))
        reentered = close < (prev_hi * (1.0 - reenter_pct))  # rientro vero sotto il livello
        wick_ok = upper >= rng * wick_min

        if swept_high and reentered and wick_ok:
            # candela bear “vera”
            if close >= open_:
                continue

            if _close_near_low(open_, high, low, close, frac=close_frac):
                # ---- strength (0..1) ----
                sweep = _safe_div((high - prev_hi), (abs(prev_hi) * eps))
                sweep_s = _clamp01(sweep)

                reent = _safe_div((prev_hi - close), (abs(prev_hi) * reenter_pct))
                reent_s = _clamp01(reent)

                wick_dom = _safe_div(upper, (rng * wick_min))
                wick_s = _clamp01(wick_dom)

                dist_low = _safe_div((close - low), (rng * close_frac))
                near_s = _clamp01(1.0 - dist_low)

                strength = _clamp01(0.30 * sweep_s + 0.30 * reent_s + 0.25 * wick_s + 0.15 * near_s)

                min_s = float(max(
                    float(strict.get("REJ_MIN_STRENGTH", 0.0)),
                    float(strict.get("THIRD_MIN_STRENGTH_REJ", 0.0)),
                ))
                if float(strength) < min_s:
                    continue

                hits.append({
                    "pattern": "rejection_high",
                    "name": "rejection_high",
                    "index": int(i),
                    "direction": "BEAR",
                    "strength": float(strength),
                    "pat": "rejection_high",
                    "dir": "BEAR",
                })
                last_hit_i = i
                continue

        # ---------------------------------------------------------
        # REJECTION LOW = sweep sotto prev_lo + close rientrato sopra prev_lo
        # ---------------------------------------------------------
        swept_low = low < (prev_lo * (1.0 - eps))
        reentered = close > (prev_lo * (1.0 + reenter_pct))   # rientro vero sopra il livello
        wick_ok = lower >= rng * wick_min

        if swept_low and reentered and wick_ok:
            # candela bull “vera”
            if close <= open_:
                continue

            if _close_near_high(open_, high, low, close, frac=close_frac):
                # ---- strength (0..1) ----
                sweep = _safe_div((prev_lo - low), (abs(prev_lo) * eps))
                sweep_s = _clamp01(sweep)

                reent = _safe_div((close - prev_lo), (abs(prev_lo) * reenter_pct))
                reent_s = _clamp01(reent)

                wick_dom = _safe_div(lower, (rng * wick_min))
                wick_s = _clamp01(wick_dom)

                dist_high = _safe_div((high - close), (rng * close_frac))
                near_s = _clamp01(1.0 - dist_high)

                strength = _clamp01(0.30 * sweep_s + 0.30 * reent_s + 0.25 * wick_s + 0.15 * near_s)

                min_s = float(max(
                    float(strict.get("REJ_MIN_STRENGTH", 0.0)),
                    float(strict.get("THIRD_MIN_STRENGTH_REJ", 0.0)),
                ))
                if float(strength) < min_s:
                    continue

                hits.append({
                    "pattern": "rejection_low",
                    "name": "rejection_low",
                    "index": int(i),
                    "direction": "BULL",
                    "strength": float(strength),
                    "pat": "rejection_low",
                    "dir": "BULL",
                })
                last_hit_i = i
                continue

    return hits

# ---------------------------------------------------------------------------
# MORNING / EVENING STAR
# ---------------------------------------------------------------------------

def _detect_morning_star(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 3:
        return hits

    lookback = int(strict["TREND_LOOKBACK"])
    trend_min = float(strict["STAR_TREND_MIN_PCT"])

    for i in range(2, len(df)):
        o1, c1, h1, l1 = float(o.iloc[i - 2]), float(c.iloc[i - 2]), float(h.iloc[i - 2]), float(l.iloc[i - 2])
        o2, c2, h2, l2 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
        o3, c3, h3, l3 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

        rng1 = _rng(h1, l1); rng2 = _rng(h2, l2); rng3 = _rng(h3, l3)
        if rng1 <= 0 or rng2 <= 0 or rng3 <= 0:
            continue

        body1 = _body(o1, c1)
        body2 = _body(o2, c2)
        body3 = _body(o3, c3)

        t = _trend_pct(c, i - 2, lookback)
        if t > -trend_min:
            continue

        if not (c1 < o1 and body1 >= rng1 * 0.55):
            continue

        if body2 > rng1 * float(strict["STAR_BODY2_MAX_FRAC_RANGE1"]):
            continue
        if body2 > rng2 * 0.45:
            continue

        if not (c3 > o3):
            continue
        if body3 < body1 * float(strict["STAR_BODY3_MIN_X_BODY1"]):
            continue

        mid_body1 = o1 - body1 * 0.5
        if c3 < mid_body1:
            continue

        strength = float(min(1.0, body3 / (body1 + 1e-9)))
        min_s = float(strict.get("STAR_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": MORNING_STAR,
            "name": "MORNING_STAR",
            "index": int(i),
            "direction": "BULL",
            "strength": float(strength),
        })

    return hits


def _detect_evening_star(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 3:
        return hits

    lookback = int(strict["TREND_LOOKBACK"])
    trend_min = float(strict["STAR_TREND_MIN_PCT"])

    for i in range(2, len(df)):
        o1, c1, h1, l1 = float(o.iloc[i - 2]), float(c.iloc[i - 2]), float(h.iloc[i - 2]), float(l.iloc[i - 2])
        o2, c2, h2, l2 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
        o3, c3, h3, l3 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

        rng1 = _rng(h1, l1); rng2 = _rng(h2, l2); rng3 = _rng(h3, l3)
        if rng1 <= 0 or rng2 <= 0 or rng3 <= 0:
            continue

        body1 = _body(o1, c1)
        body2 = _body(o2, c2)
        body3 = _body(o3, c3)

        t = _trend_pct(c, i - 2, lookback)
        if t < trend_min:
            continue

        if not (c1 > o1 and body1 >= rng1 * 0.55):
            continue

        if body2 > rng1 * float(strict["STAR_BODY2_MAX_FRAC_RANGE1"]):
            continue
        if body2 > rng2 * 0.45:
            continue

        mid2 = (o2 + c2) / 2.0
        mid_body1 = (o1 + c1) / 2.0
        if mid2 < mid_body1:
            continue

        if not (c3 < o3):
            continue
        if body3 < body1 * float(strict["STAR_BODY3_MIN_X_BODY1"]):
            continue

        mid_body1_for_close = o1 + body1 * 0.5
        if c3 > mid_body1_for_close:
            continue

        strength = float(min(1.0, body3 / (body1 + 1e-9)))
        min_s = float(strict.get("STAR_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": EVENING_STAR,
            "name": "EVENING_STAR",
            "index": int(i),
            "direction": "BEAR",
            "strength": float(strength),
        })

    return hits


# ---------------------------------------------------------------------------
# PIERCING LINE
# ---------------------------------------------------------------------------

def _detect_piercing_line(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 2:
        return hits

    for i in range(1, len(df)):
        o1, c1, h1, l1 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
        o2, c2, h2, l2 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

        rng1 = _rng(h1, l1)
        if rng1 <= 0:
            continue

        body1 = _body(o1, c1)
        body2 = _body(o2, c2)

        lookback = int(strict["TREND_LOOKBACK"])
        t = _trend_pct(c, i - 1, lookback)
        if t > -float(strict["TREND_MIN_PCT"]):
            continue

        if not (c1 < o1 and body1 >= rng1 * 0.60):
            continue

        frac_low = float(strict.get("PL_CLOSE1_NEAR_LOW_FRAC", 0.25))
        if not _close_near_low(o1, h1, l1, c1, frac=frac_low):
            continue

        if not (c2 > o2):
            continue
        if body2 < body1 * 0.35:
            continue

        if not (o2 <= l1 * 1.0015):
            continue

        eps = float(strict.get("PL_SWEEP_EPS", 0.0002))
        if not (l2 < l1 * (1.0 - eps)):
            continue

        mid_body1 = (o1 + c1) / 2.0
        if not (c2 > mid_body1 and c2 < o1):
            continue

        strength = float(min(1.0, body2 / (body1 + 1e-9)))
        min_s = float(strict.get("PL_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": PIERCING_LINE,
            "name": "PIERCING_LINE",
            "index": int(i),
            "direction": "BULL",
            "strength": float(strength),
        })

    return hits


# ---------------------------------------------------------------------------
# DARK CLOUD COVER
# ---------------------------------------------------------------------------

def _detect_dark_cloud_cover(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    o = df["open"].astype(float)
    h = df["high"].astype(float)
    l = df["low"].astype(float)
    c = df["close"].astype(float)

    hits: List[PatternHit] = []
    if len(df) < 2:
        return hits

    lookback = int(strict["TREND_LOOKBACK"])
    trend_min = float(strict["STAR_TREND_MIN_PCT"])

    for i in range(1, len(df)):
        o1, c1, h1, l1 = float(o.iloc[i - 1]), float(c.iloc[i - 1]), float(h.iloc[i - 1]), float(l.iloc[i - 1])
        o2, c2, h2, l2 = float(o.iloc[i]), float(c.iloc[i]), float(h.iloc[i]), float(l.iloc[i])

        rng1 = _rng(h1, l1)
        rng2 = _rng(h2, l2)
        if rng1 <= 0 or rng2 <= 0:
            continue

        body1 = _body(o1, c1)
        body2 = _body(o2, c2)

        t = _trend_pct(c, i - 1, lookback)
        if t < trend_min:
            continue

        if not (c1 > o1 and body1 >= rng1 * float(strict["DCC_BODY1_MIN_FRAC_RANGE1"])):
            continue

        if not (c2 < o2):
            continue
        if body2 < body1 * float(strict["DCC_BODY2_MIN_X_BODY1"]):
            continue

        if not (o2 >= c1 * float(strict["DCC_OPEN2_MIN_OVER_CLOSE1"])):
            continue

        if not (h2 >= h1 * float(strict["DCC_HIGH2_MIN_OVER_HIGH1"])):
            continue

        mid_body1 = (c1 + o1) / 2.0

        if bool(strict["DCC_CLOSE2_MUST_BELOW_MID1"]):
            if not (c2 < mid_body1):
                continue

        if bool(strict["DCC_CLOSE2_MUST_STAY_ABOVE_OPEN1"]):
            if not (c2 > o1):
                continue

        strength = float(min(1.0, body2 / (body1 + 1e-9)))
        min_s = float(strict.get("DCC_MIN_STRENGTH", 0.0))
        if strength < min_s:
            continue
        hits.append({
            "pattern": DARK_CLOUD_COVER,
            "name": "DARK_CLOUD_COVER",
            "index": int(i),
            "direction": "BEAR",
            "strength": float(strength),
        })

    return hits

# ---------------------------------------------------------------------------
# EMA CROSS 9/21 e 9/50 (RAW immediato, CONFIRMED dopo “hold” barre)
# - RAW: nasce sulla barra i del cross, se close(i) è già “oltre” entrambe le EMA (con buffer)
# - CONFIRMED: nasce sulla barra i+1+hold se per tutte le barre j in [i+1 .. i+1+hold]
#              il close resta oltre entrambe le EMA (con buffer hold) e (opzionale) EMA resta ordinata
# - Filtro “colore” applicato solo sulla prima candela dopo (i+1), per evitare cross “sporchini”
# ---------------------------------------------------------------------------

from typing import Any, Dict, List
import pandas as pd

def _detect_ema_cross_9_21(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    return _detect_ema_cross_generic(
        df=df,
        strict=strict,
        fast_window=9,
        slow_window=21,
        tag="9_21",
    )

def _detect_ema_cross_9_50(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    return _detect_ema_cross_generic(
        df=df,
        strict=strict,
        fast_window=9,
        slow_window=50,
        tag="9_50",
    )

def _detect_ema_cross_generic(
    *,
    df: pd.DataFrame,
    strict: Dict[str, Any],
    fast_window: int,
    slow_window: int,
    tag: str,
) -> List[PatternHit]:
    from ta.trend import EMAIndicator

    if df.empty or len(df) < 3:
        return []

    close = df["close"].astype(float)
    open_ = df["open"].astype(float)

    ema_fast = EMAIndicator(close=close, window=int(fast_window)).ema_indicator()
    ema_slow = EMAIndicator(close=close, window=int(slow_window)).ema_indicator()

    above_prev = ema_fast.shift(1) > ema_slow.shift(1)
    above_now = ema_fast > ema_slow

    cross_up = (~above_prev) & (above_now)
    cross_down = (above_prev) & (~above_now)

    # --- parametri strict ---
    min_sep_pct = float(strict.get("EMA_CROSS_MIN_SEP_PCT", 0.00025))
    buf_pct = float(strict.get("EMA_CROSS_CLOSE_BUFFER_PCT", 0.00005))

    # hold-bar logic (TF-aware se valorizzati in strict_for_tf)
    hold_bars = int(strict.get("EMA_CROSS_HOLD_BARS", 0))  # 0 = conferma su i+1
    hold_buf_pct = float(strict.get("EMA_CROSS_HOLD_BUFFER_PCT", buf_pct))

    require_ema_still_ok = bool(strict.get("EMA_CROSS_CONF_REQUIRE_EMA_OK", True))

    hits: List[PatternHit] = []

    # helper: verifica “tenuta” da i+1 a i+1+hold (inclusi)
    def _hold_ok(i: int, direction: str) -> bool:
        j_end = i + 1 + hold_bars
        if j_end >= len(df):
            return False

        d = (direction or "").upper().strip()

        for j in range(i + 1, j_end + 1):
            pxj = float(close.iloc[j])
            if pxj <= 0:
                return False

            efj = ema_fast.iloc[j]
            esj = ema_slow.iloc[j]
            if pd.isna(efj) or pd.isna(esj):
                return False

            efj = float(efj)
            esj = float(esj)

            band_hi = max(efj, esj)
            band_lo = min(efj, esj)
            buf_hold = pxj * hold_buf_pct

            # close deve restare oltre entrambe (con buffer hold)
            if d == "BULL":
                if pxj <= band_hi + buf_hold:
                    return False
                if require_ema_still_ok and not (efj > esj):
                    return False
            elif d == "BEAR":
                if pxj >= band_lo - buf_hold:
                    return False
                if require_ema_still_ok and not (efj < esj):
                    return False
            else:
                return False

        # filtro colore: solo sulla prima candela dopo il cross (i+1)
        pxn_o = float(open_.iloc[i + 1])
        pxn_c = float(close.iloc[i + 1])
        if d == "BULL" and not (pxn_c > pxn_o):
            return False
        if d == "BEAR" and not (pxn_c < pxn_o):
            return False

        return True

    for i in range(len(df)):
        if pd.isna(ema_fast.iloc[i]) or pd.isna(ema_slow.iloc[i]):
            continue

        px = float(close.iloc[i])
        if px <= 0:
            continue

        ef = float(ema_fast.iloc[i])
        es = float(ema_slow.iloc[i])

        # separazione minima (sempre)
        if (abs(ef - es) / px) < min_sep_pct:
            continue

        band_hi = max(ef, es)
        band_lo = min(ef, es)
        buf = px * buf_pct

        # -------------------
        # CROSS UP (RAW su i)
        # -------------------
        if bool(cross_up.iloc[i]):
            # RAW: close(i) sopra entrambe (con buffer)
            if px <= band_hi + buf:
                continue

            hits.append({
                "pattern": f"ema_cross_{tag}_up_raw",
                "name": f"ema_cross_{tag}_up_raw",
                "index": int(i),
                "direction": "BULL",
                "strength": 1.0,
                "pat": f"ema_cross_{tag}_up_raw",
                "dir": "BULL",
            })

            # CONFIRMED: tenuta + colore su i+1
            if _hold_ok(i, "BULL"):
                j_end = i + 1 + hold_bars
                hits.append({
                    "pattern": f"ema_cross_{tag}_up_confirmed",
                    "name": f"ema_cross_{tag}_up_confirmed",
                    "index": int(j_end),   # ✅ nasce quando è confermato davvero
                    "direction": "BULL",
                    "strength": 1.0,
                    "pat": f"ema_cross_{tag}_up_confirmed",
                    "dir": "BULL",
                })

        # -------------------
        # CROSS DOWN (RAW su i)
        # -------------------
        if bool(cross_down.iloc[i]):
            # RAW: close(i) sotto entrambe (con buffer)
            if px >= band_lo - buf:
                continue

            hits.append({
                "pattern": f"ema_cross_{tag}_down_raw",
                "name": f"ema_cross_{tag}_down_raw",
                "index": int(i),
                "direction": "BEAR",
                "strength": 1.0,
                "pat": f"ema_cross_{tag}_down_raw",
                "dir": "BEAR",
            })

            # CONFIRMED: tenuta + colore su i+1
            if _hold_ok(i, "BEAR"):
                j_end = i + 1 + hold_bars
                hits.append({
                    "pattern": f"ema_cross_{tag}_down_confirmed",
                    "name": f"ema_cross_{tag}_down_confirmed",
                    "index": int(j_end),   # ✅ nasce quando è confermato davvero
                    "direction": "BEAR",
                    "strength": 1.0,
                    "pat": f"ema_cross_{tag}_down_confirmed",
                    "dir": "BEAR",
                })

    return hits

# ---------------------------------------------------------------------------
# EMA ALIGNMENT
# ---------------------------------------------------------------------------

def _detect_ema_alignment_trend(df: pd.DataFrame) -> List[PatternHit]:
    if df.empty:
        return []

    close = df["close"].astype(float)

    ema9 = close.ewm(span=9, adjust=False).mean()
    ema21 = close.ewm(span=21, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()

    bull = (ema9 > ema21) & (ema21 > ema50)
    bear = (ema9 < ema21) & (ema21 < ema50)

    hits: List[PatternHit] = []
    prev_bull = False
    prev_bear = False

    for i in range(len(df)):
        b = bool(bull.iloc[i]) if pd.notna(bull.iloc[i]) else False
        s = bool(bear.iloc[i]) if pd.notna(bear.iloc[i]) else False

        if b and not prev_bull:
            hits.append({"pattern": "ema_alignment", "name": "EMA_ALIGNMENT", "index": int(i), "direction": "BULL", "strength": 0.8})
        if s and not prev_bear:
            hits.append({"pattern": "ema_alignment", "name": "EMA_ALIGNMENT", "index": int(i), "direction": "BEAR", "strength": 0.8})

        prev_bull = b
        prev_bear = s

    return hits


# ---------------------------------------------------------------------------
# BB SQUEEZE
# ---------------------------------------------------------------------------

def _detect_bb_squeeze(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    from ta.volatility import BollingerBands

    if df.empty or len(df) < 30:
        return []

    close = df["close"].astype(float)
    bb = BollingerBands(close=close, window=20, window_dev=2)
    bb_high = bb.bollinger_hband()
    bb_low = bb.bollinger_lband()

    width = (bb_high - bb_low) / close.replace(0, pd.NA)
    width = width.replace([pd.NA, float("inf"), float("-inf")], pd.NA)

    valid = width.dropna()
    if valid.empty:
        return []

    threshold = float(valid.quantile(float(strict["BB_Q"])))

    hits: List[PatternHit] = []
    in_count = 0
    min_bars = int(strict["BB_MIN_BARS_IN_SQUEEZE"])

    for i in range(len(df)):
        w = width.iloc[i]
        if pd.isna(w):
            in_count = 0
            continue

        in_sq = bool(w <= threshold)
        if in_sq:
            in_count += 1
        else:
            in_count = 0

        if in_sq and (in_count == min_bars):
            strength = float(min(1.0, max(0.1, threshold / (float(w) + 1e-9))))
            hits.append({"pattern": BB_SQUEEZE, "name": "BB_SQUEEZE", "index": int(i), "direction": "NEUTRAL", "strength": strength})

    return hits


# ---------------------------------------------------------------------------
# RSI DIVERGENCE (strict)
# ---------------------------------------------------------------------------

def _detect_rsi_divergence(df: pd.DataFrame, strict: Dict[str, Any]) -> List[PatternHit]:
    from ta.momentum import RSIIndicator

    if df.empty or len(df) < 40:
        return []

    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)

    rsi = RSIIndicator(close=close, window=14).rsi()

    k = int(strict["RSI_K"])
    win = 2 * k + 1

    piv_hi = high.rolling(win, center=True).max()
    piv_lo = low.rolling(win, center=True).min()

    is_high = (high == piv_hi)
    is_low = (low == piv_lo)

    hits: List[PatternHit] = []

    last_low = None   # (idx, price, rsi)
    last_high = None  # (idx, price, rsi)

    min_apart = int(strict["RSI_MIN_BARS_APART"])
    price_delta = float(strict["RSI_PRICE_DELTA"])
    rsi_delta = float(strict["RSI_DELTA"])
    bear_min_prev = float(strict["RSI_BEAR_MIN_PREV"])
    bull_max_prev = float(strict["RSI_BULL_MAX_PREV"])
    near_frac = float(strict["RSI_CLOSE_NEAR_EXTREME_FRAC"])

    for i in range(k, len(df) - k):
        ri = rsi.iloc[i]
        if pd.isna(ri):
            continue

        # pivot LOW -> bullish divergence
        if bool(is_low.iloc[i]):
            price = float(low.iloc[i])

            if last_low is not None:
                prev_i, prev_price, prev_r = last_low

                if (i - prev_i) >= min_apart:
                    # LL e RSI HL
                    if (price < prev_price * (1.0 - price_delta)) and (float(ri) > float(prev_r) + rsi_delta):
                        # contesto RSI "scarico"
                        if float(prev_r) <= bull_max_prev:
                            o_i = float(df["open"].iloc[i])
                            h_i = float(df["high"].iloc[i])
                            l_i = float(df["low"].iloc[i])
                            c_i = float(df["close"].iloc[i])
                            if _close_near_low(o_i, h_i, l_i, c_i, frac=near_frac):
                                strength = float(min(1.0, max(0.0, (float(ri) - float(prev_r)) / 20.0 + 0.5)))
                                hits.append({"pattern": RSI_DIVERGENCE, "name": "RSI BULLISH DIVERGENCE", "index": int(i), "direction": "BULL", "strength": strength})

            last_low = (i, price, float(ri))

        # pivot HIGH -> bearish divergence
        if bool(is_high.iloc[i]):
            price = float(high.iloc[i])

            if last_high is not None:
                prev_i, prev_price, prev_r = last_high

                if (i - prev_i) >= min_apart:
                    # HH e RSI LH
                    if (price > prev_price * (1.0 + price_delta)) and (float(ri) < float(prev_r) - rsi_delta):
                        # contesto RSI "tirato"
                        if float(prev_r) >= bear_min_prev:
                            o_i = float(df["open"].iloc[i])
                            h_i = float(df["high"].iloc[i])
                            l_i = float(df["low"].iloc[i])
                            c_i = float(df["close"].iloc[i])
                            if _close_near_high(o_i, h_i, l_i, c_i, frac=near_frac):
                                strength = float(min(1.0, max(0.0, (float(prev_r) - float(ri)) / 20.0 + 0.5)))
                                hits.append({"pattern": RSI_DIVERGENCE, "name": "RSI BEARISH DIVERGENCE", "index": int(i), "direction": "BEAR", "strength": strength})

            last_high = (i, price, float(ri))

    return hits


# ---------------------------------------------------------------------------
# Triple top/bottom: lasciati vuoti
# ---------------------------------------------------------------------------

def _detect_triple_bottom(df: pd.DataFrame) -> List[PatternHit]:
    return []


def _detect_triple_top(df: pd.DataFrame) -> List[PatternHit]:
    return []


# ---------------------------------------------------------------------------
# Entry point principale
# ---------------------------------------------------------------------------

def detect_pattern_indices(
    data: Any,
    patterns_to_check: Optional[Sequence[str]] = None,
    timeframe: Optional[str] = None,
    *,
    coin: Optional[str] = None,
) -> List[PatternHit]:

    # ----------------------------
    # Prepare df + strict
    # ----------------------------
    try:
        df = _to_df(data)
    except Exception as e:
        if _patdbg_enabled(coin=coin, timeframe=timeframe):
            _patdbg(f"[PATDBG][DF_ERR] coin={coin} tf={timeframe} err={repr(e)}")
        return []

    strict = _strict_for_tf(timeframe)

    # log “fine” (NOHIT/HIT) solo se passa i filtri già presenti
    dbg = _patdbg_enabled(coin=coin, timeframe=timeframe)

    dbg_explain = False

    if df is None or not isinstance(df, pd.DataFrame) or df.empty:
        if dbg:
            _patdbg(f"[PATDBG][EMPTY_DF] coin={coin} tf={timeframe}")
        return []

    # serve close
    if "close" not in df.columns:
        if dbg:
            _patdbg(
                f"[PATDBG][BAD_DF] coin={coin} tf={timeframe} missing_col=close "
                f"cols={list(df.columns)[:20]}"
            )
        return []

    if isinstance(patterns_to_check, str):
        patterns_to_check = [patterns_to_check]

    # -----------------------------
    # Ensure timestamp column exists (it may be in df.index)
    # -----------------------------
    if "timestamp" not in df.columns:
        try:
            # caso 1: index nominato timestamp
            if str(getattr(df.index, "name", "") or "").lower() in ("timestamp", "ts", "time"):
                df = df.reset_index()
            else:
                # caso 2: index non nominato (diventa colonna "index")
                df = df.reset_index().rename(columns={"index": "timestamp"})
        except Exception:
            pass

    # normalizza tipo timestamp se presente
    if "timestamp" in df.columns:
        try:
            df["timestamp"] = df["timestamp"].astype("int64")
        except Exception:
            pass

    # Normalizza e reset index (coerenza index->timestamp)
    df = df.reset_index(drop=True)

    active_patterns = _resolve_patterns(patterns_to_check)

    n = len(df)
    last_idx = n - 1

    # -----------------------------
    # PATDBG: CONTEXT (1 volta ogni 5 min per coin+tf, coin-filter via env)
    # -----------------------------
    if ORIONE_PAT_DEBUG and isinstance(df, pd.DataFrame) and (not df.empty):
        ckey = (coin or "").strip().upper()
        tf = (timeframe or "NA")

        dbg_coin = (os.getenv("ORIONE_PAT_DEBUG_COIN", "") or "").strip().upper()
        if dbg_coin and ckey == dbg_coin:
            # throttle (default 300 sec)
            try:
                every_sec = int((os.getenv("ORIONE_PATDBG_EVERY_SEC", "300") or "300").strip())
            except Exception:
                every_sec = 300
            every_sec = max(5, every_sec)

            nowm = int(time.time() * 1000)
            k = (ckey, tf)

            if not hasattr(detect_pattern_indices, "_patdbg_last_ms"):
                setattr(detect_pattern_indices, "_patdbg_last_ms", {})
            last_map = getattr(detect_pattern_indices, "_patdbg_last_ms")

            lastm = int(last_map.get(k, 0) or 0)
            if (nowm - lastm) >= every_sec * 1000:
                last_map[k] = nowm

                cols = list(df.columns)
                last_ts = None
                if "timestamp" in df.columns:
                    try:
                        last_ts = int(df["timestamp"].iloc[last_idx])
                    except Exception:
                        last_ts = None

                last_close = None
                try:
                    last_close = float(df["close"].iloc[last_idx])
                except Exception:
                    last_close = None

                _patdbg(
                    f"[PATDBG][CTX] coin={ckey} tf={tf} n={n} last_idx={last_idx} "
                    f"cols={cols} last_ts={last_ts} last_close={last_close}"
                )

                # -----------------------------
                # Throttle anche per NOHIT/HIT (default 300 sec)
                # -----------------------------
                dbg_explain = False
                if dbg and ORIONE_PAT_DEBUG:
                    try:
                        ckey = (coin or "").strip().upper()
                        tfk = (timeframe or "NA")
                        every_sec = int(os.getenv("ORIONE_PATDBG_EVERY_SEC", "300") or "300")
                        every_sec = max(5, every_sec)

                        nowm = int(time.time() * 1000)
                        k = (ckey, tfk, "EXPLAIN")

                        if not hasattr(detect_pattern_indices, "_patdbg_last_ms2"):
                            setattr(detect_pattern_indices, "_patdbg_last_ms2", {})
                        m2 = getattr(detect_pattern_indices, "_patdbg_last_ms2")

                        lastm = int(m2.get(k, 0) or 0)
                        if (nowm - lastm) >= every_sec * 1000:
                            m2[k] = nowm
                            dbg_explain = True
                    except Exception:
                        dbg_explain = False

    # ---------------------------------------------------------
    # Helper: logga un “perché non scatta” per LAST candle only
    # ---------------------------------------------------------
    
    def _nohit(pname: str, msg: str) -> None:
        if not dbg_explain:
            return
        _patdbg(f"[PATDBG][NOHIT] coin={coin} tf={timeframe} idx={last_idx} {pname}: {msg}")

    def _hit(pname: str, extra: str = "") -> None:
        if not dbg_explain:
            return
        if extra:
            _patdbg(f"[PATDBG][HIT] coin={coin} tf={timeframe} idx={last_idx} {pname} {extra}")
        else:
            _patdbg(f"[PATDBG][HIT] coin={coin} tf={timeframe} idx={last_idx} {pname}")
    # ---------------------------------------------------------
    # Detect
    # ---------------------------------------------------------
    hits: List[PatternHit] = []

    # ========== Engulfing (spiega E* / UNA SOLA VOLTA) ==========
    if ENGULFING in active_patterns:
        if dbg:
            try:
                ex = _explain_engulfing_last(df, strict, last_idx)
                if ex.get("ok"):
                    _hit("engulfing", f"dir={ex.get('dir')}")
                else:
                    why = ex.get("why") or ["conditions not satisfied"]
                    _nohit("engulfing", " | ".join(why))
                    if ORIONE_PAT_DEBUG_LEVEL >= 2:
                        _patdbg("[PATDBG][VALS][engulfing] " + json.dumps(ex.get("vals", {}), ensure_ascii=False))
            except Exception as e:
                _nohit("engulfing", f"debug_explain_err={repr(e)}")

        out = _detect_engulfing(df, strict)
        hits.extend(out)

    # ========== Hammer (spiega H* / UNA SOLA VOLTA) ==========
    if HAMMER in active_patterns:
        if dbg:
            try:
                ex = _explain_hammer_last(df, strict, last_idx)
                if ex.get("ok"):
                    _hit("hammer")
                else:
                    why = ex.get("why") or ["conditions not satisfied"]
                    _nohit("hammer", " | ".join(why))
                    if ORIONE_PAT_DEBUG_LEVEL >= 2:
                        _patdbg("[PATDBG][VALS][hammer] " + json.dumps(ex.get("vals", {}), ensure_ascii=False))
            except Exception as e:
                _nohit("hammer", f"debug_explain_err={repr(e)}")

        out = _detect_hammer(df, strict)
        hits.extend(out)

    # ========== Altri candlestick (solo 1 riga NOHIT se non scatta) ==========
    def _run_simple_last_only(pname: str, fn, min_len: int, nohit_msg: str) -> None:
        nonlocal hits
        if pname not in active_patterns:
            return
        if n < min_len:
            if dbg:
                _nohit(pname, f"skipped (len(df)={n} < {min_len})")
            return

        out = fn(df, strict)
        hits.extend(out)

        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit(pname, nohit_msg)

    _run_simple_last_only(SHOOTING_STAR, _detect_shooting_star, 1, "conditions not satisfied")
    _run_simple_last_only(PIERCING_LINE, _detect_piercing_line, 2, "conditions not satisfied")
    _run_simple_last_only(DARK_CLOUD_COVER, _detect_dark_cloud_cover, 2, "conditions not satisfied")

    _run_simple_last_only(MORNING_STAR, _detect_morning_star, 3, "pattern not completed on last")
    _run_simple_last_only(EVENING_STAR, _detect_evening_star, 3, "pattern not completed on last")

    # RSI divergence
    if RSI_DIVERGENCE in active_patterns:
        if n < 40:
            if dbg:
                _nohit("rsi_divergence", f"skipped (len(df)={n} < 40)")
        else:
            out = _detect_rsi_divergence(df, strict)
            hits.extend(out)
            if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
                if not any(int(h.get("index", -999)) == last_idx for h in out):
                    _nohit("rsi_divergence", "no hit on last candle")

    # BB squeeze
    if BB_SQUEEZE in active_patterns:
        if n < 30:
            if dbg:
                _nohit("bb_squeeze", f"skipped (len(df)={n} < 30)")
        else:
            out = _detect_bb_squeeze(df, strict)
            hits.extend(out)
            if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
                if not any(int(h.get("index", -999)) == last_idx for h in out):
                    _nohit("bb_squeeze", "no hit on last candle")

    # Break / Rejection movements
    if (BREAK_HIGH in active_patterns) or (BREAK_LOW in active_patterns):
        out = _detect_break_high_low(df, strict)
        hits.extend(out)
        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit("break_high/low", "no hit on last candle")

    # --- PATDBG MIRATO: third tokens (break_*) presenti su last ---
    if dbg and dbg_explain:
        try:
            last_th = [h for h in out if int(h.get("index", -999)) == last_idx]
            if last_th:
                toks = [f"{h.get('name')}:{h.get('direction')}:{h.get('strength')}" for h in last_th]
                _hit("break_high/low", "last=" + ",".join(toks))
        except Exception:
            pass

    if (REJECTION_HIGH in active_patterns) or (REJECTION_LOW in active_patterns):
        out = _detect_rejection_high_low(df, strict)
        hits.extend(out)
        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit("rejection_high/low", "no hit on last candle")

    # --- PATDBG MIRATO: third tokens (rejection_*) presenti su last ---
    if dbg and dbg_explain:
        try:
            last_th = [h for h in out if int(h.get("index", -999)) == last_idx]
            if last_th:
                toks = [f"{h.get('name')}:{h.get('direction')}:{h.get('strength')}" for h in last_th]
                _hit("rejection_high/low", "last=" + ",".join(toks))
        except Exception:
            pass

    # EMA cross
    if (EMA_CROSS_9_21_UP in active_patterns) or (EMA_CROSS_9_21_DOWN in active_patterns):
        out = _detect_ema_cross_9_21(df, strict)
        hits.extend(out)
        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit("ema_cross_9_21", "no hit on last candle")

    if (EMA_CROSS_9_50_UP in active_patterns) or (EMA_CROSS_9_50_DOWN in active_patterns):
        out = _detect_ema_cross_9_50(df, strict)
        hits.extend(out)
        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit("ema_cross_9_50", "no hit on last candle")

    # EMA alignment
    if EMA_ALIGNMENT_TREND in active_patterns:
        out = _detect_ema_alignment_trend(df)
        hits.extend(out)
        if dbg and ORIONE_PAT_DEBUG_ONLY_FAILS:
            if not any(int(h.get("index", -999)) == last_idx for h in out):
                _nohit("ema_alignment", "no hit on last candle")

    # Tick debug
    if bool(strict.get("ENABLE_TICK_DEBUG", False)) and ((TICK_UP in active_patterns) or (TICK_DOWN in active_patterns)):
        out = _detect_tick(df)
        hits.extend(out)

    # Ordina
    hits.sort(key=lambda h: (h.get("index", 0), -h.get("strength", 0.0)))

    # Espansione RAW + CONFIRMED (confirmed = idx+1 via _confirm_A)
    expanded: List[PatternHit] = []
    for h in hits:
        pat0 = h.get("pattern") or h.get("name") or ""
        pat = str(pat0).lower().strip()
        idx = int(h.get("index", -1))
        direction = (h.get("direction") or "NEUTRAL").upper()

        if pat.endswith("_raw") or pat.endswith("_confirmed"):
            expanded.append(h)
            continue

        if pat not in RAW_CONF_BASE:
            expanded.append(h)
            continue

        h_raw = dict(h)
        h_raw["pattern"] = f"{pat}_raw"
        expanded.append(h_raw)

        if direction in ("BULL", "BEAR") and _confirm_A(df, idx, direction):
            h_conf = dict(h)
            h_conf["pattern"] = f"{pat}_confirmed"
            h_conf["index"] = int(idx + 1)   # ✅ il confirmed “nasce” sulla candela successiva
            expanded.append(h_conf)

    # Debug finale: quante hit sull'ultima candela
    if dbg:
        try:
            last_hits = [h for h in expanded if int(h.get("index", -999)) == last_idx]
            if last_hits:
                toks = [str(h.get("pattern") or h.get("name")) for h in last_hits]
                _patdbg(f"[PATDBG][HITS_LAST] coin={coin} tf={timeframe} n={len(last_hits)} {toks}")
        except Exception:
            pass

    return expanded