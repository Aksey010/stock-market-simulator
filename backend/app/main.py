import asyncio
import json
import random
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import analysis as ds
from . import backtest, indicators as ta, marketdata as md
from .models import (
    BacktestConfig,
    BarSeries,
    Candle,
    OrderBook,
    OrderRequest,
    OrderSide,
    SymbolInfo,
)
from .portfolio import get_default_trader

app = FastAPI(
    title="Market Simulator API",
    description="TradingView-style simulated stock market with paper trading, indicators, backtesting and data-science analysis.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYMBOLS = list(md.REGS.keys())
TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"]
STRATEGIES = sorted(backtest.STRATEGIES)

DEFAULT_TS = "5m"

states: dict[str, md.SymbolState] = {}
_built_hist: dict[tuple[str, str], list[Candle]] = {}
_live_lock = threading.Lock()
_trader = get_default_trader()

equity_history: list[dict] = []
_equity_lock = threading.Lock()

ws_clients: set[WebSocket] = set()
ws_lock = asyncio.Lock()


def _ensure_state(symbol: str) -> md.SymbolState:
    with _live_lock:
        if symbol not in states:
            states[symbol] = md.make_state(symbol)
        return states[symbol]


def _price_fn(symbol: str):
    try:
        return _ensure_state(symbol).price
    except Exception:
        return None


_trader.set_price_fn(_price_fn)


@app.on_event("startup")
async def on_startup():
    for s in SYMBOLS:
        _ensure_state(s)
    task = asyncio.get_event_loop().create_task(_live_loop())
    app.state.live_task = task
    task2 = asyncio.get_event_loop().create_task(_equity_logger())
    app.state.equity_task = task2


async def _live_loop():
    while True:
        for st in list(states.values()):
            md.tick_candle(st, 60_000, 1000)
        payload = {
            "type": "live",
            "quotes": [
                {"symbol": s.info.symbol, "price": round(s.price, 4), "ts": md._now(),
                 "change_pct": round((s.price / s.info.initial_price - 1) * 100, 3)}
                for s in states.values()
            ],
        }
        if ws_clients:
            await _broadcast(payload)
        await asyncio.sleep(1)


async def _equity_logger():
    while True:
        with _equity_lock:
            get_default_trader().equity_history(equity_history)
        await asyncio.sleep(5)


async def _broadcast(payload: dict):
    data = json.dumps(payload)
    dead = []
    async with ws_lock:
        for ws in list(ws_clients):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_clients.discard(ws)


@app.get("/")
def root():
    return {
        "name": "Market Simulator",
        "version": "1.0.0",
        "docs": "/docs",
        "symbols": SYMBOLS,
    }


@app.get("/api/symbols")
def list_symbols():
    return [
        SymbolInfo(
            symbol=s.info.symbol, name=s.info.name, description=s.info.description,
            sector=s.info.sector, volatility=s.info.volatility,
            initial_price=s.info.initial_price, drift=s.info.drift, regime=s.info.regime,
        )
        for s in states.values()
    ]


@app.get("/api/sectors")
def sector_groups():
    out = {}
    for s in states.values():
        out.setdefault(s.info.sector, []).append(s.info.symbol)
    return out


@app.get("/api/candles/{symbol}")
def candles(symbol: str, timeframe: str = Query(DEFAULT_TS, pattern="^(1m|5m|15m|1h|4h|1d)$"), limit: int = Query(400, ge=10, le=2000)):
    symbol = symbol.upper()
    if symbol not in md.REGS:
        raise HTTPException(404, f"unknown symbol {symbol}")
    key = (symbol, timeframe)
    with _live_lock:
        if key not in _built_hist:
            _built_hist[key] = md.build_hist(symbol, timeframe, limit=2000)
        bars = _built_hist[key]
    now = md._now()
    tf_ms = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}[timeframe]
    out = [b for b in bars if b.t <= now]
    live = md.tick_candle(_ensure_state(symbol), tf_ms, 1000)
    if live:
        out.append(live)
    if out and timeframe == "1m":
        last = out[-1]
        st = _ensure_state(symbol)
        last.h = max(last.h, st.price)
        last.l = min(last.l, st.price)
        last.c = st.price
    return BarSeries(symbol=symbol, timeframe=timeframe, values=out[-limit:])


@app.get("/api/indicators/{symbol}")
def indicators(symbol: str, timeframe: str = Query(DEFAULT_TS), limit: int = Query(400)):
    symbol = symbol.upper()
    if symbol not in md.REGS:
        raise HTTPException(404, f"unknown symbol {symbol}")
    bars = candles(symbol, timeframe, limit)
    df = _df_from_candles(bars.values)
    return ta.compute_all(df)


def _df_from_candles(candles: list[Candle]):
    import pandas as pd
    return pd.DataFrame([c.model_dump() for c in candles])


@app.get("/api/orderbook/{symbol}")
def orderbook(symbol: str):
    symbol = symbol.upper()
    if symbol not in md.REGS:
        raise HTTPException(404, f"unknown symbol {symbol}")
    return md.build_order_book(_ensure_state(symbol))


@app.get("/api/quotes")
def quotes():
    return {
        "quotes": [
            {
                "symbol": s.info.symbol, "price": round(s.price, 4),
                "change_pct": round((s.price / s.info.initial_price - 1) * 100, 3),
                "sector": s.info.sector, "name": s.info.name,
            }
            for s in states.values()
        ]
    }


@app.get("/api/index")
def market_index():
    return {"name": "SIM500", **md.market_index(SYMBOLS)}


@app.get("/api/sectors/performance")
def sector_perf():
    return md.sector_performance(SYMBOLS)


@app.get("/api/analysis/correlations")
def correlations(symbols: str = Query(",".join(SYMBOLS[:6]))):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    prices_map = {}
    for sym in syms:
        if sym in md.REGS:
            bars = candles(sym, "1h", 250).values
            prices_map[sym] = [float(b.c) for b in bars]
    return {"correlation": ds.correlation_matrix(prices_map), "covariance": ds.covariance_matrix(prices_map)}


@app.get("/api/analysis/portfolio_risk")
def portfolio_risk(symbols: str = Query(",".join(SYMBOLS[:6]))):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    prices_map = {}
    for sym in syms:
        if sym in md.REGS:
            bars = candles(sym, "1h", 250).values
            prices_map[sym] = [float(b.c) for b in bars]
    return ds.portfolio_risk_analysis(prices_map, {})


@app.get("/api/analysis/insights")
def insights(symbols: str = Query(",".join(SYMBOLS[:6]))):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    prices_map = {}
    for sym in syms:
        if sym in md.REGS:
            bars = candles(sym, "1h", 250).values
            prices_map[sym] = [float(b.c) for b in bars]
    return {"insights": ds.llm_insights(prices_map)}


@app.get("/api/analysis/{symbol}")
def analysis(symbol: str, timeframe: str = Query(DEFAULT_TS), limit: int = Query(400)):
    symbol = symbol.upper()
    bars = candles(symbol, timeframe, limit).values
    closes = [float(b.c) for b in bars]
    ind = ta.compute_all(_df_from_candles(bars))
    return {
        "symbol": symbol,
        "stats": ds.stats(closes),
        "regime": ds.regime_detection(closes),
        "technical": ds.technical_summary({symbol: [b.model_dump() for b in bars]}, {symbol: ind})[symbol],
        "forecast": md.random_walk_forecast(closes[-1], 30, float(pd_std(closes))),
    }


def pd_std(closes):
    import numpy as np
    return float(np.std(closes))


@app.post("/api/orders", status_code=201)
def place_order(req: OrderRequest):
    req.symbol = req.symbol.upper()
    if req.symbol not in md.REGS:
        raise HTTPException(404, f"unknown symbol {req.symbol}")
    order = _trader.place_order(req)
    return order


@app.get("/api/orders")
def orders(symbol: Optional[str] = None, status: Optional[str] = None):
    return _trader.get_orders(symbol and symbol.upper(), status)


@app.delete("/api/orders/{order_id}")
def cancel(order_id: str):
    o = _trader.cancel_order(order_id)
    if not o:
        raise HTTPException(404, "order not found")
    return o


@app.get("/api/portfolio")
def portfolio():
    return _trader.portfolio()


@app.get("/api/trades")
def trades(limit: int = 50):
    return _trader.recent_trades(limit)


@app.get("/api/equity-history")
def equity():
    return {"points": equity_history}


@app.post("/api/backtest")
def run_backtest(cfg: BacktestConfig):
    cfg.symbol = cfg.symbol.upper()
    if cfg.symbol not in md.REGS:
        raise HTTPException(404, f"unknown symbol {cfg.symbol}")
    if cfg.strategy not in STRATEGIES:
        raise HTTPException(400, f"unknown strategy, allowed: {STRATEGIES}")
    key = (cfg.symbol, cfg.timeframe)
    with _live_lock:
        if key not in _built_hist:
            _built_hist[key] = md.build_hist(cfg.symbol, cfg.timeframe, limit=2000)
        bars = _built_hist[key]
    try:
        return backtest.run(cfg, bars)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/strategies")
def strategies():
    return {"strategies": STRATEGIES, "timeframes": TIMEFRAMES}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    async with ws_lock:
        ws_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "symbols": SYMBOLS}))
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
            except Exception:
                continue
            if data.get("type") == "subscribe":
                sym = data.get("symbol", "AAPL").upper()
                if sym in md.REGS:
                    st = _ensure_state(sym)
                    await ws.send_text(
                        json.dumps({"type": "orderbook", "symbol": sym,
                                    "book": md.build_order_book(st).model_dump()})
                    )
                await ws.send_text(json.dumps({"type": "subscribed", "symbol": sym}))
    except WebSocketDisconnect:
        pass
    finally:
        async with ws_lock:
            ws_clients.discard(ws)


@app.on_event("shutdown")
async def on_shutdown():
    task = getattr(app.state, "live_task", None)
    if task:
        task.cancel()
