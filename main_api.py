from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timezone
from contextlib import contextmanager
import warnings
import os
import sys
import random

# =====================================================
#  CONFIG
# =====================================================
ANALISI_ROOT = os.environ.get("ANALISI_PATH") or "/Users/marcocontiero/Downloads/cassandra_railway-main-3"
warnings.filterwarnings("ignore", message="pkg_resources is deprecated")

@contextmanager
def pushd(path: str):
    cur = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(cur)

# =====================================================
#  PATH SETUP
# =====================================================
HERE = os.path.dirname(os.path.abspath(__file__))
CANDIDATE_ROOTS = [
    HERE,
    os.path.abspath(os.path.join(HERE, "..")),
    os.path.abspath(os.path.join(HERE, "backend")),
    ANALISI_ROOT,
]
for root in CANDIDATE_ROOTS:
    if os.path.isdir(os.path.join(root, "analisi")) and root not in sys.path:
        sys.path.insert(0, root)
        break

try:
    with pushd(ANALISI_ROOT):
        from analisi.analizza_coin_light import scarica_ohlcv_binance  # type: ignore
        from analisi.sr_pipeline import genera_supporti_e_resistenze    # type: ignore
except Exception as e:
    scarica_ohlcv_binance = None  # type: ignore
    genera_supporti_e_resistenze = None  # type: ignore
    print("⚠️ Moduli 'analisi' non disponibili:", e)

# --- Hot patch estrai_livelli: stringhe/tuple -> dict ---
try:
    with pushd(ANALISI_ROOT):
        import analisi.sr_pipeline as _srp  # type: ignore
        if hasattr(_srp, "estrai_livelli"):
            _orig_estrai = _srp.estrai_livelli  # type: ignore[attr-defined]

            def _patched_estrai_livelli(lista_indicatori, prezzo_attuale, *args, **kwargs):
                cleaned = []
                for ind in lista_indicatori:
                    if isinstance(ind, dict):
                        cleaned.append(ind)
                    elif isinstance(ind, (list, tuple)) and len(ind) >= 2:
                        nome, val = ind[0], ind[1]
                        if isinstance(val, (int, float)):
                            cleaned.append({"nome": str(nome), "livello": float(val)})
                    else:
                        continue
                return _orig_estrai(cleaned, prezzo_attuale, *args, **kwargs)  # type: ignore[misc]

            _srp.estrai_livelli = _patched_estrai_livelli  # type: ignore[attr-defined]
            print("✅ Patch 'estrai_livelli' applicata")
except Exception as e:
    print("⚠️ Patch 'estrai_livelli' non applicata:", e)

# =====================================================
#  APP
# =====================================================
app = FastAPI(title="Cassandra Glass API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
#  Utils S/R
# =====================================================
def _normalize_fonti(fonti):
    out = []
    if not fonti:
        return out
    for f in fonti:
        if isinstance(f, tuple) and len(f) == 2:
            out.append((str(f[0]), int(f[1])))
        elif isinstance(f, dict):
            name = f.get("nome") or f.get("name") or f.get("indicatore") or "sorgente"
            score = f.get("score") or f.get("forza") or 0
            out.append((str(name), int(score)))
        else:
            out.append((str(f), 0))
    return out

def mk_level(livello: float, tf: str, fonti, forza: Optional[int] = None) -> Dict[str, Any]:
    return {
        "tipo": "livello",
        "livello": float(livello),
        "tf": tf,
        "fonti": _normalize_fonti(fonti),
        "forza": int(forza) if forza is not None else None,
    }

def mk_zona(min_v: float, max_v: float, tf: str, fonti, forza: Optional[int] = None) -> Dict[str, Any]:
    mn, mx = (float(min_v), float(max_v)) if min_v <= max_v else (float(max_v), float(min_v))
    return {
        "tipo": "zona",
        "min": mn,
        "max": mx,
        "centro": (mn + mx) / 2.0,
        "tf": tf,
        "fonti": _normalize_fonti(fonti),
        "forza": int(forza) if forza is not None else None,
    }

def _get_ref_price(dfs: Dict[str, Any]) -> Optional[float]:
    priority = ["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"]
    for tf in priority:
        df = dfs.get(tf)
        if df is not None and hasattr(df, "columns") and "close" in df.columns and len(df) > 0:
            try:
                return float(df["close"].iloc[-1])
            except Exception:
                pass
    for df in dfs.values():
        if df is not None and hasattr(df, "columns") and "close" in df.columns and len(df) > 0:
            try:
                return float(df["close"].iloc[-1])
            except Exception:
                pass
    return None

def _forza_item(it: Dict[str, Any]) -> int:
    f = it.get("forza")
    if f is None:
        f = sum(int(s) for _, s in it.get("fonti", []) if isinstance(s, (int, float)))
    return int(f or 0)

def _dist_pct_from_price(it: Dict[str, Any], prezzo: float) -> float:
    if not prezzo or prezzo <= 0:
        return 1e9
    if it["tipo"] == "zona":
        mn, mx = it["min"], it["max"]
        return min(abs(mn - prezzo) / prezzo, abs(mx - prezzo) / prezzo)
    return abs(it["livello"] - prezzo) / prezzo

def _within_50pct(it: Dict[str, Any], prezzo: float) -> bool:
    return _dist_pct_from_price(it, prezzo) <= 0.50

def _centre_value(item: Dict[str, Any]) -> Optional[float]:
    try:
        if item.get("tipo") == "zona":
            return float((item["min"] + item["max"]) / 2.0)
        if "livello" in item:
            return float(item["livello"])
    except Exception:
        pass
    return None

def _unpack_sr(sr: Union[Dict[str, Any], List[Any], Tuple[Any, ...]], prezzo: Optional[float]) -> Dict[str, List[Dict[str, Any]]]:
    if isinstance(sr, dict):
        return {"supporti": list(sr.get("supporti") or []), "resistenze": list(sr.get("resistenze") or [])}
    supporti: List[Dict[str, Any]] = []
    resistenze: List[Dict[str, Any]] = []
    if isinstance(sr, (list, tuple)) and len(sr) >= 2 and all(isinstance(x, (list, tuple)) for x in sr[:2]):
        cand_supp, cand_res = sr[0], sr[1]
        if all(isinstance(it, dict) for it in cand_supp):
            supporti = list(cand_supp)  # type: ignore
        if all(isinstance(it, dict) for it in cand_res):
            resistenze = list(cand_res)  # type: ignore
    if (not supporti or not resistenze) and isinstance(sr, (list, tuple)):
        combined: List[Dict[str, Any]] = []
        for x in sr:
            if isinstance(x, (list, tuple)) and all(isinstance(it, dict) for it in x):
                combined.extend(list(x))  # type: ignore
            elif isinstance(x, dict):
                combined.append(x)
        if combined:
            if prezzo is None:
                supporti = combined
                resistenze = []
            else:
                for it in combined:
                    c = _centre_value(it)
                    if c is None:
                        continue
                    (supporti if c <= prezzo else resistenze).append(it)
    return {"supporti": supporti, "resistenze": resistenze}

def _genera_sr_safe(dfs: Dict[str, Any], prezzo: float) -> Dict[str, List[Dict[str, Any]]]:
    with pushd(ANALISI_ROOT):
        try:
            raw = genera_supporti_e_resistenze(dfs, prezzo_attuale=prezzo)  # type: ignore[arg-type]
        except TypeError:
            try:
                raw = genera_supporti_e_resistenze(dfs, prezzo)  # type: ignore[misc]
            except TypeError:
                raw = genera_supporti_e_resistenze(dfs)  # type: ignore[misc]
    return _unpack_sr(raw, prezzo)

# ---------------- Fallback da OHLCV (se la pipeline non produce nulla) ----------------
def _fallback_sr_from_ohlcv(dfs: Dict[str, Any], prezzo: float) -> Dict[str, List[Dict[str, Any]]]:
    candidates: List[Dict[str, Any]] = []
    tol_pct = 0.003  # 0.3% per clustering

    for tf, df in dfs.items():
        if df is None or len(df) < 10:
            continue
        lows = df["low"].values.tolist() if "low" in df.columns else []
        highs = df["high"].values.tolist() if "high" in df.columns else []
        n = len(lows)
        for i in range(2, n - 2):
            try:
                if lows[i] < lows[i-1] and lows[i] < lows[i+1]:
                    lvl = float(lows[i])
                    candidates.append({"tipo":"livello","livello":lvl,"tf":tf,"fonti":[("swing low",3)],"forza":3})
                if highs[i] > highs[i-1] and highs[i] > highs[i+1]:
                    lvl = float(highs[i])
                    candidates.append({"tipo":"livello","livello":lvl,"tf":tf,"fonti":[("swing high",3)],"forza":3})
            except Exception:
                continue

    if not candidates:
        return {"supporti": [], "resistenze": []}

    candidates.sort(key=lambda x: x["livello"] if "livello" in x else (x["min"]+x["max"])/2)
    clusters: List[List[Dict[str, Any]]] = []
    for it in candidates:
        placed = False
        for cl in clusters:
            ref = cl[0]["livello"] if "livello" in cl[0] else (cl[0]["min"]+cl[0]["max"])/2
            if abs((it["livello"] - ref)/prezzo) <= tol_pct:
                cl.append(it)
                placed = True
                break
        if not placed:
            clusters.append([it])

    results: List[Dict[str, Any]] = []
    for cl in clusters:
        vals = [x["livello"] for x in cl if "livello" in x]
        mn, mx = min(vals), max(vals)
        fonti = []
        forza = 0
        tfs = set()
        for x in cl:
            for f in x.get("fonti", []):
                fonti.append(f)
                if isinstance(f, tuple) and len(f) == 2 and isinstance(f[1], (int,float)):
                    forza += int(f[1])
            tfs.add(x.get("tf","1h"))
        tf_label = "multi" if len(tfs) > 1 else list(tfs)[0]
        if abs(mx - mn)/prezzo >= 0.001:
            results.append(mk_zona(mn, mx, tf_label, fonti, forza))
        else:
            mid = (mn + mx)/2
            results.append(mk_level(mid, tf_label, fonti, forza))

    supporti = []
    resistenze = []
    for it in results:
        c = _centre_value(it)
        if c is None:
            continue
        (supporti if c <= prezzo else resistenze).append(it)

    return {"supporti": supporti, "resistenze": resistenze}

def build_sr_candidates(coin: str, tf_list: List[str]):
    """Restituisce (supporti, resistenze, supporti_extra, resistenze_extra, prezzo, debug_info)."""
    debug_info: Dict[str, Any] = {}

    if scarica_ohlcv_binance is None or genera_supporti_e_resistenze is None:
        return [], [], [], [], None, {"errore": "moduli analisi non disponibili"}

    dfs: Dict[str, Any] = {}
    with pushd(ANALISI_ROOT):
        for tf in tf_list:
            try:
                dfs[tf] = scarica_ohlcv_binance(coin, tf, limit=1000)  # pandas.DataFrame
            except Exception as e:
                debug_info.setdefault("download_error", {})[tf] = str(e)
    if not dfs:
        return [], [], [], [], None, {"errore": "download ohlcv vuoto", **debug_info}

    prezzo = _get_ref_price(dfs)
    debug_info["prezzo"] = prezzo
    if not prezzo:
        return [], [], [], [], None, {"errore": "prezzo assente", **debug_info}

    sr = _genera_sr_safe(dfs, prezzo)
    supporti_raw = (sr.get("supporti") or [])
    resistenze_raw = (sr.get("resistenze") or [])
    debug_info["sr_counts"] = {"supporti_raw": len(supporti_raw), "resistenze_raw": len(resistenze_raw)}

    if len(supporti_raw) == 0 and len(resistenze_raw) == 0:
        sr_fb = _fallback_sr_from_ohlcv(dfs, prezzo)
        supporti_raw = sr_fb["supporti"]
        resistenze_raw = sr_fb["resistenze"]
        debug_info["fallback_used"] = True
        debug_info["sr_counts_fb"] = {"supporti_raw": len(supporti_raw), "resistenze_raw": len(resistenze_raw)}

    def adapt(item: Dict[str, Any]):
        tf = item.get("tf") or item.get("timeframe") or item.get("fonte_tf") or "1h"
        fonti = item.get("fonti") or item.get("sources") or []
        forza = item.get("forza") or item.get("score") or None
        if item.get("tipo") in ("zona", "zone") or (("min" in item) and ("max" in item)):
            return mk_zona(item["min"], item["max"], tf, fonti, forza)
        livello = item.get("livello") or item.get("price") or item.get("valore")
        return mk_level(livello, tf, fonti, forza)

    supporti = [adapt(x) for x in supporti_raw]
    resistenze = [adapt(x) for x in resistenze_raw]

    supporti_extra = [it for it in supporti if _forza_item(it) > 5 and _within_50pct(it, prezzo)]
    resistenze_extra = [it for it in resistenze if _forza_item(it) > 5 and _within_50pct(it, prezzo)]

    supporti_main = [it for it in supporti if it not in supporti_extra]
    resistenze_main = [it for it in resistenze if it not in resistenze_extra]

    return supporti_main, resistenze_main, supporti_extra, resistenze_extra, prezzo, debug_info

def pick_top3(items: List[Dict[str, Any]], prezzo: Optional[float], k: int = 3) -> List[Dict[str, Any]]:
    if not items:
        return []
    if not prezzo or prezzo <= 0:
        items_sorted = sorted(items, key=lambda it: (-_forza_item(it)))
    else:
        items_sorted = sorted(
            items,
            key=lambda it: (_dist_pct_from_price(it, prezzo), -_forza_item(it))
        )
    return items_sorted[:k]

def _compute_bias_and_recos(prezzo: float,
                            supporti: List[Dict[str, Any]],
                            resistenze: List[Dict[str, Any]]):
    def center(x):
        return (x["livello"] if x["tipo"] == "livello" else (x["min"] + x["max"]) / 2.0)

    supp_sorted = sorted(supporti, key=lambda it: abs(center(it) - prezzo))
    res_sorted  = sorted(resistenze, key=lambda it: abs(center(it) - prezzo))

    nearest_s, nearest_r = (supp_sorted[0] if supp_sorted else None), (res_sorted[0] if res_sorted else None)

    def dist_pct(val): return abs(val - prezzo) / prezzo

    dS = dist_pct(center(nearest_s)) if nearest_s else 1e9
    dR = dist_pct(center(nearest_r)) if nearest_r else 1e9

    if dS < dR:
        direzione = "LONG"
    elif dR < dS:
        direzione = "SHORT"
    else:
        direzione = "NEUTRO"

    delta = abs(dS - dR)
    score = int(min(30, max(-30, (delta * 100))))

    motivi = []
    if nearest_s:
        motivi.append(f"Supporto più vicino a {center(nearest_s):.0f} ({dS*100:.2f}%).")
    if nearest_r:
        motivi.append(f"Resistenza più vicina a {center(nearest_r):.0f} ({dR*100:.2f}%).")
    if direzione == "LONG":
        motivi.append("Il supporto è più vicino del livello di resistenza → probabile rimbalzo.")
    elif direzione == "SHORT":
        motivi.append("La resistenza è più vicina del livello di supporto → rischio di respinta.")
    else:
        motivi.append("Supporto e resistenza sono a distanza simile.")

    def mk_trade_from_support(it):
        c = center(it)
        r_target = res_sorted[0] if res_sorted else None
        tp = center(r_target) if r_target else c * 1.02
        sl = c * 0.988
        return {"direzione": "LONG","tf": it.get("tf", "1h"),"entry": round(c, 2),"sl": round(sl, 2),"tp": round(tp, 2),"note": "Pullback su supporto","fonti": it.get("fonti", [])}

    def mk_trade_from_resistenza(it):
        c = center(it)
        s_target = supp_sorted[0] if supp_sorted else None
        tp = center(s_target) if s_target else c * 0.98
        sl = c * 1.012
        return {"direzione": "SHORT","tf": it.get("tf", "1h"),"entry": round(c, 2),"sl": round(sl, 2),"tp": round(tp, 2),"note": "Rejection in area di offerta","fonti": it.get("fonti", [])}

    entrate = [mk_trade_from_support(x) for x in supp_sorted[:3]]
    uscite  = [mk_trade_from_resistenza(x) for x in res_sorted[:3]]

    scenari_attivi = []
    for e in entrate:
        scenari_attivi.append({"titolo": f"Pullback long {e['tf']} @ {e['entry']:.0f}","direzione": "LONG","entry": e["entry"], "sl": e["sl"], "tp": e["tp"],"validita": "finché regge il supporto"})
    for u in uscite:
        scenari_attivi.append({"titolo": f"Rejection short {u['tf']} @ {u['entry']:.0f}","direzione": "SHORT","entry": u["entry"], "sl": u["sl"], "tp": u["tp"],"validita": "finché regge la resistenza"})

    grafici = []
    if nearest_s:
        grafici.append({"tf": nearest_s.get("tf","1h"),"direzione": "LONG","titolo": f"Zona di domanda @ {center(nearest_s):.0f}","annotazioni": [f"fonti: {', '.join(n for n,_ in nearest_s.get('fonti',[])[:3])}"] if nearest_s.get('fonti') else []})
    if nearest_r:
        grafici.append({"tf": nearest_r.get("tf","1h"),"direzione": "SHORT","titolo": f"Zona di offerta @ {center(nearest_r):.0f}","annotazioni": [f"fonti: {', '.join(n for n,_ in nearest_r.get('fonti',[])[:3])}"] if nearest_r.get('fonti') else []})

    spiegazione = (f"Bias {direzione}: confronto tra distanza dal supporto più vicino ({dS*100:.2f}%) "
                   f"e dalla resistenza più vicina ({dR*100:.2f}%).")

    return direzione, score, motivi, entrate, uscite, scenari_attivi, grafici, spiegazione


def _delta_24h(coin: str) -> Dict[str, float]:
    """Delta rispetto a ~24h: {'abs': x, 'pct': y}. Sempre presente e con valori numerici."""
    try:
        with pushd(ANALISI_ROOT):
            # Prova con 1h (24 barre fa)
            try:
                df = scarica_ohlcv_binance(coin, "1h", limit=30)  # type: ignore
                if df is not None and len(df) >= 25 and "close" in df.columns:
                    last = float(df["close"].iloc[-1])
                    prev = float(df["close"].iloc[-25])
                    abs_ = float(last - prev)
                    pct_ = float((abs_ / prev) if prev else 0.0)
                    return {"abs": round(abs_, 2), "pct": round(pct_, 4)}
            except Exception:
                pass
            # Fallback: 1d (ultimo vs precedente)
            try:
                df = scarica_ohlcv_binance(coin, "1d", limit=2)  # type: ignore
                if df is not None and len(df) >= 2 and "close" in df.columns:
                    last = float(df["close"].iloc[-1]); prev = float(df["close"].iloc[-2])
                    abs_ = float(last - prev)
                    pct_ = float((abs_ / prev) if prev else 0.0)
                    return {"abs": round(abs_, 2), "pct": round(pct_, 4)}
            except Exception:
                pass
    except Exception:
        pass
    # default sicuro
    return {"abs": 0.0, "pct": 0.0}

def _df_to_chart_payload(df, coin: str, timeframe: str) -> Dict[str, Any]:
    import pandas as pd
    if df is None or len(df) == 0:
        return {"ok": True, "coin": coin, "timeframe": timeframe, "bars": 0, "data": [], "ohlcv": []}

    try:
        if isinstance(df.index, pd.DatetimeIndex):
            df = df.sort_index()
        elif "time" in df.columns:
            df = df.sort_values(by="time")
        elif "open_time" in df.columns:
            df = df.sort_values(by="open_time")
    except Exception:
        pass

    try:
        if "time" in df.columns:
            t = df["time"]
        elif "open_time" in df.columns:
            t = df["open_time"]
        elif isinstance(df.index, pd.DatetimeIndex):
            t = df.index
        else:
            t = pd.Series(range(len(df)))
        ts = pd.to_datetime(t, utc=True, errors='coerce')
        ts_ms = (ts.view('int64') // 10**6).astype('int64').tolist()
    except Exception:
        ts_ms = list(range(len(df)))

    def col(*names):
        for n in names:
            if n in df.columns:
                return df[n]
        return None

    o = col("open", "Open", "o")
    h = col("high", "High", "h")
    l = col("low", "Low", "l")
    c = col("close", "Close", "c")
    v = col("volume", "Volume", "v", "vol")

    data = []
    ohlcv = []
    n = len(ts_ms)
    for i in range(n):
        def get_val(series):
            if series is None:
                return None
            try:
                return float(series.iloc[i])
            except Exception:
                return None
        oi = get_val(o); hi = get_val(h); li = get_val(l); ci = get_val(c); vi = get_val(v)
        data.append({"t": int(ts_ms[i]), "o": oi, "h": hi, "l": li, "c": ci, "v": vi})
        ohlcv.append([int(ts_ms[i]), oi, hi, li, ci, vi])

    return {"ok": True, "coin": coin, "timeframe": timeframe, "bars": len(data), "data": data, "ohlcv": ohlcv}

@app.get("/api/chart")
def api_chart(
    coin: str,
    timeframe: str = Query("1h"),
    bars: int = Query(800, ge=2, le=3000)
) -> Dict[str, Any]:
    if scarica_ohlcv_binance is None:
        raise HTTPException(status_code=500, detail="Modulo 'analisi' non disponibile.")
    with pushd(ANALISI_ROOT):
        try:
            df = scarica_ohlcv_binance(coin, timeframe, limit=bars)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Errore scarico OHLCV: {e}")
    payload = _df_to_chart_payload(df, coin, timeframe)
    return payload

# ----------------------- CORE & ROUTES -----------------------
def _analisi_light_core(coin: str, timeframes: str, tipo: str, debug: int):
    tf_list = [t.strip() for t in timeframes.split(",") if t.strip()]
    if not tf_list:
        raise HTTPException(status_code=400, detail="Parametro 'timeframes' mancante o vuoto.")

    supporti, resistenze, supporti_extra, resistenze_extra, prezzo, dbg = build_sr_candidates(coin, tf_list)

    if scarica_ohlcv_binance is None or genera_supporti_e_resistenze is None:
        raise HTTPException(status_code=500, detail="Modulo 'analisi' non disponibile nel PYTHONPATH.")
    if prezzo is None:
        raise HTTPException(status_code=500, detail="Prezzo di riferimento non disponibile.")

    pullback_long = pick_top3(supporti, prezzo)
    reset_short = pick_top3(resistenze, prezzo)

    trend_tf = {tf: random.choice(["↑", "↓", "→"]) for tf in tf_list}
    trend_tf_score = {tf: {"bias": random.choice(["long","short","neutro"]), "score": random.randint(-30, 30)} for tf in tf_list}

    direzione, score, motivi, entrate, uscite, scenari_attivi, grafici, spiegazione = _compute_bias_and_recos(
        prezzo, supporti + supporti_extra, resistenze + resistenze_extra
    )

    # SCORE 0..100 (50 = neutro) mappato da -30..30
    score_100 = int(round((score + 30) / 60 * 100))
    if score_100 < 0: score_100 = 0
    if score_100 > 100: score_100 = 100

    # DELTA rispetto a ieri
    delta_ieri = _delta_24h(coin)
    delta_pct = round(float(delta_ieri.get('pct', 0.0)) * 100.0, 2)
    delta_abs = round(float(delta_ieri.get('abs', 0.0)), 2)
    delta_pct_str = f"{delta_pct:+.2f}%"
    delta_sign = ("+" if delta_pct > 0 else "-" if delta_pct < 0 else "0")
    delta_text_alias = delta_pct_str
    delta_abs_str = f"{delta_abs:+.2f}"

    payload = {
        "ok": True,
        "coin": coin,
        "timeframes": tf_list,
        "tipo": tipo,
        "prezzo": prezzo,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "score": score_100,
        "delta": {"pct": delta_pct, "abs": delta_abs, "pct_str": delta_pct_str, "abs_str": delta_abs_str},
        "delta_24h": {"pct": delta_pct, "abs": delta_abs, "pct_str": delta_pct_str, "abs_str": delta_abs_str},
        "delta_text": delta_pct_str,
        "deltaPercent": delta_pct,
        "yesterdayDelta": delta_pct,
        "yesterdayDeltaText": delta_pct_str,
        "rispetto_ieri": delta_pct_str,
        "deltaText": delta_text_alias,
        "scoreDelta": delta_pct,
        "scoreDeltaText": delta_text_alias,
        "change24h": delta_pct,
        "change24hPercent": delta_pct,
        "change24hText": delta_text_alias,
        "deltaBadge": {"text": delta_text_alias, "sign": delta_sign, "pct": delta_pct},
        "delta_ieri": delta_ieri,
        "risposte": {
            "badge_delta": {"text": delta_text_alias, "sign": delta_sign, "pct": delta_pct},
            "delta_rispetto_ieri": {"pct": delta_pct, "abs": delta_abs, "pct_str": delta_pct_str, "abs_str": delta_abs_str},
            "supporti": supporti,
            "supporti_extra": supporti_extra,
            "resistenze": resistenze,
            "resistenze_extra": resistenze_extra,
            "scenari": {"pullback_long": pullback_long, "reset_short": reset_short},
            "scenari_attivi": scenari_attivi,
            "longshort": {"direzione": direzione, "score": score, "motivi": motivi},
            "entrate": entrate,
            "uscite": uscite,
            "grafici": grafici,
            "spiegazione": spiegazione,
            "trend_tf": trend_tf,
            "trend_tf_score": trend_tf_score,
        }
    }
    if debug == 1:
        payload["debug"] = dbg
    return payload

@app.get("/api/analisi_light")
@app.get("/api/analisi_light/")
def analisi_light_api(
    coin: str,
    timeframes: str = Query(..., description="Lista separata da virgole, es: 15m,1h,4h,1d"),
    tipo: str = Query("Analisi Tecnica Avanzata"),
    debug: int = Query(0, description="Se 1, include informazioni di debug")
) -> Dict[str, Any]:
    return _analisi_light_core(coin, timeframes, tipo, debug)

# --- Indice API ---
@app.get("/")
def root_index() -> Dict[str, Any]:
    routes = []
    for r in app.routes:
        path = getattr(r, "path", None)
        if path:
            methods = list(getattr(r, "methods", [])) or []
            routes.append({"path": path, "methods": methods})
    return {"ok": True, "routes": routes, "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/api")
def api_index() -> Dict[str, Any]:
    return root_index()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
