import unittest

import numpy as np
import pandas as pd

from app import analysis as ds
from app import backtest, indicators as ta, marketdata as md, rlagent
from app.models import BacktestConfig
from app.portfolio import PaperTrader


def _df_from_candles(candles):
    return pd.DataFrame([c.model_dump() for c in candles])


class TestMarketData(unittest.TestCase):
    def test_build_hist_1d(self):
        bars = md.build_hist("AAPL", "1d", 400)
        self.assertGreaterEqual(len(bars), 400)
        for b in bars:
            self.assertGreaterEqual(b.h, max(b.o, b.c))
            self.assertLessEqual(b.l, min(b.o, b.c))
            self.assertGreater(b.v, 0)

    def test_build_hist_5m(self):
        bars = md.build_hist("MSFT", "5m", 300)
        self.assertEqual(len(bars), 300)

    def test_unknown_symbol(self):
        with self.assertRaises(KeyError):
            md.build_hist("NOPE", "1d")


class TestIndicators(unittest.TestCase):
    def setUp(self):
        self.df = _df_from_candles(md.build_hist("AAPL", "1d", 300))

    def test_all_indicators_shape(self):
        out = ta.compute_all(self.df)
        n = len(self.df)
        for key, arr in out.items():
            self.assertEqual(len(arr), n, key)
            self.assertFalse(np.isnan(arr).any(), key)

    def test_rsi_bounds(self):
        rsi = ta.rsi(self.df["c"], 14)
        self.assertTrue(((rsi >= 0) & (rsi <= 100)).all())

    def test_bollinger_ordering(self):
        u, m, l, _, _ = ta.bollinger(self.df["c"])
        self.assertTrue((u[-50:] >= l[-50:]).all())


class TestAnalysis(unittest.TestCase):
    def test_stats(self):
        closes = [float(c.c) for c in md.build_hist("TSLA", "1d", 250)]
        s = ds.stats(closes)
        for k in ("current", "mean", "sharpe", "var_95", "max_drawdown", "annualized_volatility"):
            self.assertIn(k, s)

    def test_correlation(self):
        pm = {s: [float(c.c) for c in md.build_hist(s, "1d", 200)] for s in ("AAPL", "MSFT", "TSLA")}
        res = ds.correlation_matrix(pm)
        self.assertEqual(len(res["symbols"]), 3)
        self.assertEqual(len(res["corr"]), 3)
        self.assertAlmostEqual(res["corr"][0][0], 1.0, places=3)


class TestBacktest(unittest.TestCase):
    def test_sma_cross(self):
        bars = md.build_hist("AAPL", "1d", 500)
        res = backtest.run(BacktestConfig(symbol="AAPL", timeframe="1d", strategy="sma_cross"), bars)
        self.assertTrue(len(res.equity_curve) > 100)
        for k in ("sharpe", "return_pct", "max_drawdown", "benchmark_return_pct"):
            self.assertIn(k, res.metrics)

    def test_buy_and_hold(self):
        bars = md.build_hist("MSFT", "1d", 400)
        res = backtest.run(BacktestConfig(symbol="MSFT", timeframe="1d", strategy="buy_and_hold"), bars)
        self.assertGreaterEqual(len(res.trades), 1)

    def test_unknown_strategy(self):
        bars = md.build_hist("AAPL", "1d", 200)
        with self.assertRaises(ValueError):
            backtest.run(BacktestConfig(symbol="AAPL", timeframe="1d", strategy="nope"), bars)


class TestPaperTrader(unittest.TestCase):
    def setUp(self):
        self.t = PaperTrader(initial_cash=10000)
        self.t.set_price_fn(lambda s: 100.0)

    def test_buy_sell(self):
        buy = self.t.place_order(OrderReq("AAPL", "buy", 10))
        self.assertEqual(buy.status.value, "filled")
        self.assertAlmostEqual(self.t.cash, 10000 - 10 * 100 * (1 + 0.0005), places=2)
        sell = self.t.place_order(OrderReq("AAPL", "sell", 10))
        self.assertEqual(sell.status.value, "filled")

    def test_insufficient_funds(self):
        o = self.t.place_order(OrderReq("AAPL", "buy", 100000))
        self.assertEqual(o.status.value, "rejected")

    def test_sell_without_position(self):
        o = self.t.place_order(OrderReq("MSFT", "sell", 5))
        self.assertEqual(o.status.value, "rejected")

    def test_portfolio(self):
        self.t.place_order(OrderReq("AAPL", "buy", 10))
        p = self.t.portfolio()
        self.assertEqual(len(p.positions), 1)
        self.assertAlmostEqual(p.account_value, 9999.5, places=1)


class TestRLAgent(unittest.TestCase):
    def test_train_returns_metrics(self):
        closes = [float(c.c) for c in md.build_hist("AAPL", "1d", 400)]
        agent = rlagent.RLAgent("AAPL", "1d")
        m = agent.train(closes, 10000, episodes=20)
        for k in ("final_equity", "return_pct", "benchmark_return_pct", "sharpe", "equity_curve", "episode_rewards"):
            self.assertIn(k, m)
        self.assertEqual(len(m["equity_curve"]), len(closes))
        self.assertEqual(len(m["episode_rewards"]), 20)

    def test_predict_shape(self):
        closes = [float(c.c) for c in md.build_hist("MSFT", "1d", 300)]
        agent = rlagent.RLAgent("MSFT", "1d")
        agent.train(closes, 10000, episodes=10)
        p = agent.predict(45.0, 1.2, False)
        self.assertIn(p["action"], {"buy", "sell", "hold"})
        self.assertLessEqual(p["confidence"], 1.0)
        self.assertEqual(len(p["q_values"]), 3)

    def test_q_table_shape(self):
        self.assertEqual(rlagent.N_STATES * rlagent.N_ACTIONS, 5 * 3 * 2 * 3)


class TestDataProvider(unittest.TestCase):
    def test_real_data_or_fallback(self):
        from app import dataprovider

        if not dataprovider.real_available():
            self.skipTest("no internet")
        candles = dataprovider.fetch_candles("AAPL", "1d", 50)
        self.assertIsNotNone(candles)
        self.assertGreaterEqual(len(candles), 20)
        quote = dataprovider.fetch_quote("AAPL")
        self.assertIsNotNone(quote)
        self.assertGreater(quote["price"], 0)


class OrderReq:
    def __init__(self, symbol, side, qty, type="market"):
        self.symbol = symbol
        self.side = side
        self.qty = qty
        self.type = type
        self.price = None
        self.stop_price = None


if __name__ == "__main__":
    unittest.main()
