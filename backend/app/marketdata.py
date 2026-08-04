import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from .models import Candle, OrderBook, OrderBookLevel, SymbolInfo


@dataclass
class SymbolState:
    info: SymbolInfo
    price: float
    base_volatility: float
    regime: str
    regime_counter: int = 0
    hist: list[Candle] = field(default_factory=list)
    book_bids: list[OrderBookLevel] = field(default_factory=list)
    book_asks: list[OrderBookLevel] = field(default_factory=list)
    last_tick_ts: int = 0


REGS = {
    "AAPL": ("Apple Inc.", "Technology", 0.018, 0.0004, "tech_leader"),
    "MSFT": ("Microsoft Corp.", "Technology", 0.017, 0.0005, "tech_leader"),
    "GOOGL": ("Alphabet Inc.", "Technology", 0.021, 0.0004, "tech_leader"),
    "AMZN": ("Amazon.com Inc.", "Consumer Cyclical", 0.025, 0.0006, "momentum"),
    "TSLA": ("Tesla Inc.", "Automotive", 0.042, 0.0007, "meme"),
    "META": ("Meta Platforms", "Technology", 0.028, 0.0005, "tech_leader"),
    "NVDA": ("NVIDIA Corp.", "Semiconductors", 0.04, 0.0012, "semiconductor"),
    "AMD": ("Advanced Micro Devices", "Semiconductors", 0.045, 0.0009, "semiconductor"),
    "NFLX": ("Netflix Inc.", "Communication", 0.03, 0.0005, "growth"),
    "JPM": ("JPMorgan Chase", "Financials", 0.013, 0.0002, "value"),
    "GS": ("Goldman Sachs", "Financials", 0.016, 0.0003, "value"),
    "BAC": ("Bank of America", "Financials", 0.015, 0.0002, "value"),
    "JNJ": ("Johnson & Johnson", "Healthcare", 0.009, 0.0001, "defensive"),
    "PFE": ("Pfizer Inc.", "Healthcare", 0.014, 0.0001, "defensive"),
    "XOM": ("Exxon Mobil", "Energy", 0.019, 0.0003, "cyclical"),
    "CVX": ("Chevron Corp.", "Energy", 0.018, 0.0003, "cyclical"),
    "BA": ("Boeing Co.", "Industrials", 0.03, 0.0002, "cyclical"),
    "DIS": ("Walt Disney", "Communication", 0.024, 0.0003, "growth"),
    "KO": ("Coca-Cola Co.", "Consumer Defensive", 0.008, 0.0001, "defensive"),
    "PEP": ("PepsiCo Inc.", "Consumer Defensive", 0.008, 0.0001, "defensive"),
}

SECTORS = list(dict.fromkeys(v[1] for v in REGS.values()))

REGIME_DRIFTS = {
    "bull": 0.00025,
    "bear": -0.0003,
    "sideways": 0.00002,
    "volatile": 0.00005,
    "crash": -0.0012,
}
REGIME_VOL_MULT = {
    "bull": 0.9,
    "bear": 1.2,
    "sideways": 0.6,
    "volatile": 2.2,
    "crash": 3.5,
}
REGIME_WEIGHTS = [0.3, 0.2, 0.3, 0.15, 0.05]
REGIME_NAMES = list(REGIME_DRIFTS.keys())


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def make_state(symbol: str, price_override: Optional[float] = None) -> SymbolState:
    if symbol not in REGS:
        raise KeyError(f"Unknown symbol: {symbol}")
    name, sector, vol, drift, tag = REGS[symbol]
    base_price = price_override or (10 + (hash(symbol) % 900))
    info = SymbolInfo(
        symbol=symbol,
        name=name,
        description=f"{name} simulated in the {sector} sector",
        sector=sector,
        volatility=vol,
        initial_price=base_price,
        drift=drift,
        regime=tag,
    )
    return SymbolState(info=info, price=base_price, base_volatility=vol, regime="sideways")


def _tick(st: SymbolState, spread_mult: float = 0.5):
    r = np.random.normal(REGIME_DRIFTS[st.regime], st.base_volatility * REGIME_VOL_MULT[st.regime])
    st.price = max(0.5, st.price * math.exp(r))
    spread = st.price * st.base_volatility * spread_mult
    mid = st.price
    return mid, spread


def _next_tick_ts(prev_ts: int, interval_ms: int) -> int:
    if prev_ts == 0:
        return _now()
    return prev_ts + interval_ms


def tick_candle(st: SymbolState, timeframe_ms: int, interval_ms: int) -> Optional[Candle]:
    mid, spread = _tick(st)
    ts = _next_tick_ts(st.last_tick_ts, interval_ms)
    st.last_tick_ts = ts
    if not st.hist:
        st.hist.append(Candle(t=ts, o=mid, h=mid, l=mid, c=mid, v=0))
        return None
    last = st.hist[-1]
    if ts - last.t >= timeframe_ms:
        c = Candle(t=ts - (ts % timeframe_ms), o=mid, h=mid, l=mid, c=mid, v=random.uniform(1e3, 1e6))
        st.hist.append(c)
        return c
    last.h = max(last.h, mid)
    last.l = min(last.l, mid)
    last.c = mid
    last.v += random.uniform(1e2, 1e5)
    return None


def build_hist(symbol: str, timeframe: str, limit: int = 500, seed: Optional[int] = None) -> list[Candle]:
    if seed is not None:
        np.random.seed(seed)
    st = make_state(symbol)
    tf_ms = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}[timeframe]
    bars_per_day = tf_ms / 86_400_000.0
    per_bar_mu = st.info.drift * bars_per_day
    per_bar_sigma = st.base_volatility * math.sqrt(bars_per_day)
    end_ts = _now() - 60_000
    n_bars = min(limit * 3, 3000)
    span = max(tf_ms, (end_ts - (int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000))) // n_bars)
    out: list[Candle] = []
    price = st.price * (0.75 + 0.5 * random.random())
    rng = random.Random(seed)
    for i in range(n_bars):
        t0 = end_ts - (n_bars - 1 - i) * span
        o = price
        z = rng.gauss(0, 1)
        c = o * math.exp(per_bar_mu + per_bar_sigma * z)
        rng_f = per_bar_sigma * (0.5 + rng.random())
        wick = abs(c - o) + o * rng_f * (0.3 + 0.7 * rng.random())
        h = max(o, c) + wick
        l = min(o, c) - wick * (0.3 + 0.7 * rng.random())
        price = c
        v = rng.uniform(1e4, 1e6) * (1 + 8 * abs(per_bar_mu + per_bar_sigma * z))
        out.append(Candle(t=t0, o=round(o, 2), h=round(h, 2), l=round(l, 2), c=round(c, 2), v=round(v, 0)))
    return out[-limit:]


def build_order_book(st: SymbolState, levels: int = 12, mult: float = 1.0) -> OrderBook:
    mid, spread = _tick(st, 0.5)
    st.price = mid
    tick_size = max(0.01, round(mid * 0.0005, 2))
    bids, asks = [], []
    for i in range(levels):
        p = round(mid - (i + 0.5) * tick_size, 2)
        bids.append(OrderBookLevel(price=p, size=round(mult * random.uniform(100, 5000), 2), count=random.randint(1, 40)))
        p = round(mid + (i + 0.5) * tick_size, 2)
        asks.append(OrderBookLevel(price=p, size=round(mult * random.uniform(100, 5000), 2), count=random.randint(1, 40)))
    return OrderBook(symbol=st.info.symbol, asks=asks, bids=bids, spread=round(spread, 2), mid=round(mid, 2))


def market_index(symbols: list[str]) -> dict:
    total = 0.0
    for s in symbols:
        total += REGS[s][2]
    return {
        "level": round(1000 * (1 + np.random.normal(0, 0.001)), 2),
        "change_pct": round(np.random.normal(0, 1.2), 2),
        "components": len(symbols),
    }


def sector_performance(symbols: list[str]) -> list[dict]:
    perf = {}
    for s in symbols:
        vol = REGS[s][2]
        change = np.random.normal(0, vol * 30)
        perf.setdefault(REGS[s][1], []).append(change)
    return [{"sector": k, "change_pct": round(np.mean(v), 2), "count": len(v)} for k, v in perf.items()]


def random_walk_forecast(price: float, steps: int, vol: float, seed: Optional[int] = None) -> list[float]:
    if seed is not None:
        np.random.seed(seed)
    returns = np.random.normal(0.0002, vol, steps)
    path = np.exp(np.cumsum(returns)) * price
    return path.round(4).tolist()
