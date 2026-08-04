import threading
import time
from typing import Optional

import pandas as pd
import yfinance as yf

from .models import Candle

REAL_TIMEFRAMES = {"1m", "5m", "15m", "1h", "4h", "1d"}

# yfinance interval + period for each supported timeframe
_YF_TF = {
    "1m": ("1m", "5d"),
    "5m": ("5m", "1mo"),
    "15m": ("15m", "1mo"),
    "1h": ("1h", "3mo"),
    "4h": ("4h", "6mo"),
    "1d": ("1d", "2y"),
}

_TTL = {"1m": 45, "5m": 90, "15m": 300, "1h": 600, "4h": 1800, "1d": 3600}

_candles_cache: dict[tuple[str, str], tuple[float, list[Candle]]] = {}
_quote_cache: dict[str, tuple[float, Optional[dict]]] = {}
_net_ok: Optional[tuple[bool, float]] = None
_lock = threading.Lock()


def _has_internet() -> bool:
    global _net_ok
    now = time.time()
    with _lock:
        cached = _net_ok
        if cached and now - cached[1] < 60:
            return cached[0]
    try:
        import urllib.request

        urllib.request.urlopen("https://www.google.com", timeout=4)
        ok = True
    except Exception:
        ok = False
    with _lock:
        _net_ok = (ok, now)
    return ok


def real_available() -> bool:
    return _has_internet()


def _scalar(x):
    try:
        return x.item()
    except Exception:
        return float(x)


def _to_candles(df: pd.DataFrame) -> list[Candle]:
    if df is None or df.empty:
        return []
    if isinstance(df.index, pd.DatetimeIndex):
        idx = (df.index.astype("int64") // 10**6).to_numpy()
    else:
        # datetime lives in the first column (e.g. after resampling)
        idx = (pd.to_datetime(df[df.columns[0]]).astype("int64") // 10**6).to_numpy()
    opens = df["Open"].to_numpy()
    highs = df["High"].to_numpy()
    lows = df["Low"].to_numpy()
    closes = df["Close"].to_numpy()
    vols = df["Volume"].to_numpy()
    out = []
    for i in range(len(df)):
        out.append(
            Candle(
                t=int(idx[i]),
                o=round(float(_scalar(opens[i])), 4),
                h=round(float(_scalar(highs[i])), 4),
                l=round(float(_scalar(lows[i])), 4),
                c=round(float(_scalar(closes[i])), 4),
                v=float(_scalar(vols[i])),
            )
        )
    return out


def fetch_candles(symbol: str, timeframe: str, limit: int = 400) -> Optional[list[Candle]]:
    if timeframe not in _YF_TF:
        return None
    key = (symbol, timeframe)
    now = time.time()
    with _lock:
        hit = _candles_cache.get(key)
        if hit and now - hit[0] < _TTL[timeframe]:
            return hit[1]
    if not _has_internet():
        return None
    try:
        interval, period = _YF_TF[timeframe]
        if timeframe == "4h":
            # yfinance has no native 4h interval; fetch 1h and resample
            interval = "1h"
        df = yf.download(
            symbol,
            interval=interval,
            period=period,
            auto_adjust=True,
            progress=False,
            threads=False,
        )
        if df is None or df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            # yfinance may return ('Open','AAPL')-style multi-level columns;
            # keep the field name level (level 0) so df["Open"] works
            df.columns = df.columns.get_level_values(0)
        df = df.reset_index()
        if timeframe == "4h":
            df = _resample_4h(df)
        if df.empty:
            return None
        candles = _to_candles(df)
        candles = [c for c in candles if c.v >= 0]
        with _lock:
            _candles_cache[key] = (now, candles)
        return candles[-limit:]
    except Exception:
        return None


def _resample_4h(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    tcol = df.columns[0]
    df[tcol] = pd.to_datetime(df[tcol])
    df = df.set_index(tcol)
    agg = {
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum",
    }
    res = df.resample("4h").agg(agg).dropna(subset=["Close"])
    return res.reset_index()


def fetch_quote(symbol: str) -> Optional[dict]:
    now = time.time()
    with _lock:
        hit = _quote_cache.get(symbol)
        if hit and now - hit[0] < 30:
            return hit[1]
    if not _has_internet():
        return None
    try:
        tk = yf.Ticker(symbol)
        fi = tk.fast_info
        price = float(fi.last_price or 0)
        prev = float(fi.previous_close or 0)
        if price <= 0:
            return None
        change = (price / prev - 1) * 100 if prev else 0.0
        quote = {
            "symbol": symbol,
            "price": round(price, 4),
            "change_pct": round(change, 3),
            "currency": str(getattr(fi, "currency", "USD") or "USD"),
        }
        with _lock:
            _quote_cache[symbol] = (now, quote)
        return quote
    except Exception:
        return None


def clear_cache():
    with _lock:
        _candles_cache.clear()
        _quote_cache.clear()
