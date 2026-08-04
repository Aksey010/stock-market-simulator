import math
from typing import Optional

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=1).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=1).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(50.0)


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    macd_line = ema(series, fast) - ema(series, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=1).mean()
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def bollinger(series: pd.Series, period: int = 20, num_std: float = 2.0):
    mid = sma(series, period)
    std = series.rolling(window=period, min_periods=period).std(ddof=0)
    upper = mid + num_std * std
    lower = mid - num_std * std
    width = ((upper - lower) / mid * 100).fillna(0.0)
    pct_b = ((series - lower) / (upper - lower).replace(0, np.nan) * 100).fillna(50.0)
    return upper, mid, lower, width, pct_b


def stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3):
    low_min = df["l"].rolling(k_period, min_periods=1).min()
    high_max = df["h"].rolling(k_period, min_periods=1).max()
    rng = (high_max - low_min).replace(0, np.nan)
    k = (df["c"] - low_min) / rng * 100
    d = k.rolling(d_period, min_periods=1).mean()
    return k.fillna(50.0), d.fillna(50.0)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["c"].shift(1)
    tr = pd.concat(
        [
            df["h"] - df["l"],
            (df["h"] - prev_close).abs(),
            (df["l"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["c"].diff()).fillna(0.0)
    return (direction * df["v"]).cumsum()


def roc(series: pd.Series, period: int = 12) -> pd.Series:
    return series.pct_change(periods=period) * 100


def williams_r(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_max = df["h"].rolling(period, min_periods=1).max()
    low_min = df["l"].rolling(period, min_periods=1).min()
    out = ((high_max - df["c"]) / (high_max - low_min).replace(0, np.nan)) * -100
    return out.fillna(0.0)


def cci(df: pd.DataFrame, period: int = 20) -> pd.Series:
    tp = (df["h"] + df["l"] + df["c"]) / 3
    ma = sma(tp, period)
    md = (tp - ma).abs().rolling(period, min_periods=1).mean()
    out = (tp - ma) / (0.015 * md.replace(0, np.nan))
    return out.fillna(0.0)


def volatility(series: pd.Series, period: int = 20, annualize: int = 252) -> pd.Series:
    log_ret = np.log(series / series.shift(1))
    return log_ret.rolling(period, min_periods=period).std(ddof=0) * math.sqrt(annualize) * 100


def _ser(s: pd.Series) -> list:
    return s.round(4).fillna(0.0).replace([np.inf, -np.inf], 0.0).tolist()


def compute_all(df: pd.DataFrame) -> dict:
    close = df["c"]
    upper, mid, lower, bbw, pct_b = bollinger(close)
    macd_line, signal_line, hist = macd(close)
    k, d = stochastic(df)
    return {
        "sma_10": _ser(sma(close, 10)),
        "sma_20": _ser(sma(close, 20)),
        "sma_50": _ser(sma(close, 50)),
        "ema_12": _ser(ema(close, 12)),
        "ema_26": _ser(ema(close, 26)),
        "rsi_14": _ser(rsi(close, 14)),
        "macd": _ser(macd_line),
        "macd_signal": _ser(signal_line),
        "macd_hist": _ser(hist),
        "bb_upper": _ser(upper),
        "bb_mid": _ser(mid),
        "bb_lower": _ser(lower),
        "bb_width": _ser(bbw),
        "bb_pct_b": _ser(pct_b),
        "stoch_k": _ser(k),
        "stoch_d": _ser(d),
        "atr_14": _ser(atr(df, 14)),
        "obv": _ser(obv(df)),
        "roc_12": _ser(roc(close, 12)),
        "williams_r": _ser(williams_r(df)),
        "cci_20": _ser(cci(df)),
        "volatility_20": _ser(volatility(close)),
    }
