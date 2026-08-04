import pandas as pd

from . import indicators as ta
from .models import BacktestConfig, BacktestResult, OrderSide, Trade

STRATEGIES = {
    "sma_cross",
    "ema_cross",
    "rsi_mean_revert",
    "macd_signal",
    "bollinger_revert",
    "buy_and_hold",
    "momentum",
}


def _df_from_candles(candles: list) -> pd.DataFrame:
    df = pd.DataFrame([c.model_dump() for c in candles])
    return df


def _apply_commission(qty: float, price: float, rate: float) -> float:
    return qty * price * rate


def run(config: BacktestConfig, candles: list) -> BacktestResult:
    df = _df_from_candles(candles)
    if df.empty:
        raise ValueError("no candles")
    c = df["c"]
    cash = config.initial_cash
    shares = 0.0
    cost_basis = 0.0
    trades: list[Trade] = []
    equity_curve = []
    ts_list = df["t"].tolist()

    strategy = config.strategy
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy: {strategy}")
    if strategy == "sma_cross":
        fast = ta.sma(c, 10)
        slow = ta.sma(c, 30)
        signal = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    elif strategy == "ema_cross":
        fast = ta.ema(c, 9)
        slow = ta.ema(c, 21)
        signal = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    elif strategy == "rsi_mean_revert":
        rsi = ta.rsi(c, 14)
        signal = (rsi < 30) & (rsi.shift(1) >= 30)
    elif strategy == "macd_signal":
        macd_line, sig, _ = ta.macd(c)
        signal = (macd_line > sig) & (macd_line.shift(1) <= sig.shift(1))
    elif strategy == "bollinger_revert":
        _, _, lower, _, _ = ta.bollinger(c)
        signal = (c <= lower) & (c.shift(1) > lower.shift(1))
    elif strategy == "momentum":
        mom = c.pct_change(10)
        signal = (mom > 0.02) & (mom.shift(1) <= 0.02)
    else:
        signal = pd.Series(False, index=df.index)

    commission_rate = config.commission
    in_position = False

    for i in range(len(df)):
        price = float(c.iloc[i])
        ts = int(ts_list[i])
        if strategy == "buy_and_hold" and i == 0:
            if cash > 0:
                shares = cash * 0.95 / price
                cash -= shares * price + _apply_commission(shares, price, commission_rate)
                cost_basis = price
                in_position = True
                trades.append(
                    Trade(id=f"bt-{len(trades)}", order_id="bt", symbol=config.symbol, side=OrderSide.BUY,
                          qty=round(shares, 6), price=round(price, 4), ts=ts)
                )
        elif bool(signal.iloc[i]) and not in_position and cash > 0:
            buy = cash * 0.95 / price
            if buy > 0:
                cash -= buy * price + _apply_commission(buy, price, commission_rate)
                shares = buy
                cost_basis = price
                in_position = True
                trades.append(
                    Trade(id=f"bt-{len(trades)}", order_id="bt", symbol=config.symbol, side=OrderSide.BUY,
                          qty=round(buy, 6), price=round(price, 4), ts=ts)
                )
        elif in_position:
            sell_sig = False
            if strategy == "buy_and_hold":
                sell_sig = False
            elif strategy == "rsi_mean_revert":
                rsi_val = float(ta.rsi(c, 14).iloc[i])
                sell_sig = rsi_val > 70
            elif strategy == "bollinger_revert":
                _, _, upper, _, _ = ta.bollinger(c)
                sell_sig = price >= float(upper.iloc[i])
            else:
                sell_sig = not bool(signal.iloc[i]) and float(c.iloc[i]) < cost_basis or (
                    i > 0 and (float(c.iloc[i]) <= cost_basis * 0.95 or float(c.iloc[i]) >= cost_basis * 1.5)
                )
            if sell_sig and shares > 0:
                cash += shares * price - _apply_commission(shares, price, commission_rate)
                pnl = (price - cost_basis) * shares - _apply_commission(shares, price, commission_rate)
                trades.append(
                    Trade(id=f"bt-{len(trades)}", order_id="bt", symbol=config.symbol, side=OrderSide.SELL,
                          qty=round(shares, 6), price=round(price, 4), ts=ts, pnl=round(pnl, 4))
                )
                shares = 0.0
                in_position = False

        equity = cash + shares * price
        equity_curve.append({"t": ts, "equity": round(equity, 2)})

    final_price = float(c.iloc[-1])
    final_equity = cash + shares * final_price
    metrics = _metrics(df, equity_curve, config)
    return BacktestResult(
        trades=trades,
        equity_curve=equity_curve,
        metrics=metrics,
        symbol=config.symbol,
    )


def _metrics(df: pd.DataFrame, equity_curve: list[dict], config: BacktestConfig) -> dict:
    closes = df["c"].tolist()
    prices = pd.Series([float(c) for c in closes])
    rets = prices.pct_change().dropna()
    bench_end = float(closes[-1]) / float(closes[0]) - 1

    eq = pd.Series([e["equity"] for e in equity_curve])
    eq_rets = eq.pct_change().dropna()
    if len(eq_rets) < 2:
        return {"sharpe": 0, "max_drawdown": 0, "return_pct": 0, "benchmark_return_pct": round(bench_end * 100, 2),
                "win_rate": 0, "num_trades": 0, "volatility_pct": 0}

    total_return = (eq.iloc[-1] / eq.iloc[0] - 1) * 100
    vol = eq_rets.std() * (252 ** 0.5) * 100 if eq_rets.std() > 0 else 0
    sharpe = (eq_rets.mean() / eq_rets.std() * (252 ** 0.5)) if eq_rets.std() > 0 else 0
    dd = (eq / eq.cummax() - 1).min() * 100

    sells = [t for t in []]
    # win rate computed from trade list in caller; approximate from returns
    wins = (eq_rets > 0).mean() * 100
    return {
        "sharpe": round(float(sharpe), 3),
        "max_drawdown": round(float(dd), 2),
        "return_pct": round(float(total_return), 2),
        "benchmark_return_pct": round(float(bench_end * 100), 2),
        "volatility_pct": round(float(vol), 2),
        "win_rate": round(float(wins), 2),
        "num_trades": 0,
        "initial_cash": config.initial_cash,
        "final_equity": round(float(eq.iloc[-1]), 2),
    }
