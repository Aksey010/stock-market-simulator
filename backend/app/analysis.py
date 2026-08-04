import math

import numpy as np
import pandas as pd


def stats(series) -> dict:
    s = pd.Series([float(x) for x in series])
    rets = s.pct_change().dropna()
    return {
        "current": round(float(s.iloc[-1]), 4),
        "mean": round(float(s.mean()), 4),
        "median": round(float(s.median()), 4),
        "std": round(float(s.std()), 4),
        "min": round(float(s.min()), 4),
        "max": round(float(s.max()), 4),
        "range": round(float(s.max() - s.min()), 4),
        "skewness": round(float(s.skew() if len(s) > 2 else 0), 4),
        "kurtosis": round(float(s.kurt() if len(s) > 2 else 0), 4),
        "mean_return": round(float(rets.mean() * 100), 4),
        "std_return": round(float(rets.std() * 100), 4),
        "annualized_volatility": round(float(rets.std() * math.sqrt(252) * 100), 4),
        "sharpe": round(float(rets.mean() / rets.std() * math.sqrt(252)) if rets.std() > 0 else 0, 4),
        "var_95": round(float(rets.quantile(0.05) * 100), 4),
        "var_99": round(float(rets.quantile(0.01) * 100), 4),
        "max_drawdown": round(float(((s / s.cummax()) - 1).min() * 100), 4),
        "positive_days": int((rets > 0).sum()),
        "negative_days": int((rets < 0).sum()),
        "hit_rate": round(float((rets > 0).mean() * 100), 2),
        "worst_day": round(float(rets.min() * 100), 4),
        "best_day": round(float(rets.max() * 100), 4),
    }


def returns_matrix(prices_map: dict) -> pd.DataFrame:
    frames = {}
    for sym, closes in prices_map.items():
        frames[sym] = pd.Series([float(x) for x in closes]).pct_change()
    df = pd.DataFrame(frames)
    return df.dropna()


def correlation_matrix(prices_map: dict) -> dict:
    df = returns_matrix(prices_map)
    if df.empty:
        return {"symbols": [], "corr": []}
    corr = df.corr()
    return {
        "symbols": list(corr.columns),
        "corr": corr.round(3).values.tolist(),
    }


def covariance_matrix(prices_map: dict) -> dict:
    df = returns_matrix(prices_map)
    cov = df.cov() * 252 * 10000
    return {
        "symbols": list(cov.columns),
        "cov": cov.round(4).values.tolist(),
    }


def portfolio_risk_analysis(prices_map: dict, weights: dict) -> dict:
    df = returns_matrix(prices_map)
    if df.empty:
        return {}
    cols = list(df.columns)
    w = np.array([weights.get(s, 1.0 / len(cols)) for s in cols])
    w = w / w.sum()
    mean_rets = df.mean() * 252
    cov = df.cov() * 252
    port_ret = float(np.dot(w, mean_rets) * 100)
    port_vol = float(np.sqrt(np.dot(w.T, np.dot(cov, w))) * 100)
    sharpe = port_ret / port_vol if port_vol > 0 else 0
    return {
        "expected_return_pct": round(port_ret, 3),
        "volatility_pct": round(port_vol, 3),
        "sharpe": round(sharpe, 3),
        "weights": {c: round(float(wi), 4) for c, wi in zip(cols, w)},
        "annualized_returns": {c: round(float(r * 100), 3) for c, r in mean_rets.items()},
        "annualized_vols": {c: round(float(np.sqrt(float(cov.loc[c, c])) * 100), 3) for c in cols},
    }


def llm_insights(prices_map: dict) -> list[str]:
    """Heuristic textual insights for the data-science dashboard."""
    insights = []
    for sym, closes in prices_map.items():
        s = pd.Series([float(x) for x in closes])
        rets = s.pct_change().dropna()
        vol = rets.std() * math.sqrt(252) * 100
        trend = "up" if s.iloc[-1] > s.iloc[0] else "down"
        change = (s.iloc[-1] / s.iloc[0] - 1) * 100
        insights.append(
            f"{sym}: {'uptrend' if trend == 'up' else 'downtrend'} over the period ({change:+.1f}%), "
            f"annualized volatility {vol:.1f}%."
        )
    return insights


def regime_detection(closes) -> dict:
    s = pd.Series([float(x) for x in closes])
    rets = s.pct_change().dropna()
    vol = rets.std() * math.sqrt(252) * 100
    trend = float(rets.mean() * 252 * 100)
    if vol > 80:
        regime = "volatile / high-volatility"
    elif trend > 15:
        regime = "bull / trending up"
    elif trend < -15:
        regime = "bear / trending down"
    else:
        regime = "sideways / consolidation"
    return {"regime": regime, "trend_annualized_pct": round(trend, 2), "volatility_annualized_pct": round(vol, 2)}


def technical_summary(candles_map: dict, indicators_map: dict) -> dict:
    out = {}
    for sym, ind in indicators_map.items():
        rsi = ind.get("rsi_14", [50] * 100)
        last_rsi = rsi[-1] if rsi else 50
        macd_h = ind.get("macd_hist", [0] * 100)
        last_hist = macd_h[-1] if macd_h else 0
        closes = [float(c["c"]) for c in candles_map.get(sym, [])]
        price = closes[-1] if closes else 0
        sma20 = ind.get("sma_20", [])
        sma50 = ind.get("sma_50", [])
        trend = "n/a"
        if sma20 and sma50 and len(sma20) == len(sma50):
            trend = "bullish" if sma20[-1] > sma50[-1] else "bearish"
        signals = []
        if last_rsi > 70:
            signals.append("overbought (RSI)")
        elif last_rsi < 30:
            signals.append("oversold (RSI)")
        if last_hist > 0:
            signals.append("MACD momentum up")
        elif last_hist < 0:
            signals.append("MACD momentum down")
        out[sym] = {
            "price": round(price, 4),
            "rsi": round(float(last_rsi), 2),
            "macd_hist": round(float(last_hist), 4),
            "trend": trend,
            "signals": signals,
            "suggested": "buy" if last_rsi < 40 and last_hist > 0 else "sell" if last_rsi > 60 and last_hist < 0 else "hold",
        }
    return out