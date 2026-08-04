import threading
import uuid
import numpy as np

from . import indicators as ta

# Actions
HOLD, BUY, SELL = 0, 1, 2

N_RSI = 5
N_MOM = 3
HOLDING = 2


def _discretize(rsi: float, roc: float, holding: int) -> int:
    if rsi < 30:
        rb = 0
    elif rsi < 45:
        rb = 1
    elif rsi <= 55:
        rb = 2
    elif rsi < 70:
        rb = 3
    else:
        rb = 4
    if roc < -0.5:
        mb = 0
    elif roc <= 0.5:
        mb = 1
    else:
        mb = 2
    return rb * (N_MOM * HOLDING) + mb * HOLDING + holding


N_STATES = N_RSI * N_MOM * HOLDING
N_ACTIONS = 3


def _features(closes: np.ndarray):
    closes = pd_series(closes)
    rsi = ta.rsi(closes, 14).values
    roc = closes.pct_change(10).values * 100
    return rsi, roc


def pd_series(arr):
    import pandas as pd
    return pd.Series(np.asarray(arr, dtype=float))


class RLAgent:
    """Tabular Q-learning trading agent."""

    def __init__(self, symbol: str, timeframe: str, commission: float = 0.001):
        self.symbol = symbol
        self.timeframe = timeframe
        self.commission = commission
        self.q = np.zeros((N_STATES, N_ACTIONS))
        self.episode_rewards: list[float] = []
        self.equity_curve: list[float] = []
        self.action_counts = {HOLD: 0, BUY: 0, SELL: 0}
        self.final_equity = 0.0
        self.benchmark_equity = 0.0
        self.initial_cash = 0.0
        self.total_reward = 0.0
        self.trained_on = 0

    def train(self, closes: np.ndarray, initial_cash: float = 10000.0, episodes: int = 120,
              lr: float = 0.12, gamma: float = 0.95, progress_cb=None) -> dict:
        closes = np.asarray(closes, dtype=float)
        self.initial_cash = initial_cash
        rsi, roc = _features(closes)
        n = len(closes)
        best_reward = -np.inf
        eps = 0.5

        for ep in range(episodes):
            start = int(np.random.randint(0, max(1, n - 120)))
            cash = initial_cash
            shares = 0.0
            cost_basis = 0.0
            total_r = 0.0
            a_counts = [0, 0, 0]
            actions_log = []
            for i in range(start, n):
                state = _discretize(float(rsi[i]), float(roc[i]), 1 if shares > 0 else 0)
                if np.random.rand() < eps:
                    action = int(np.random.randint(0, N_ACTIONS))
                else:
                    action = int(np.argmax(self.q[state]))
                price = closes[i]
                reward = 0.0
                if action == BUY and shares == 0 and cash > 0:
                    qty = (cash * 0.95) / price
                    cost = qty * price * (1 + self.commission)
                    if cost <= cash:
                        cash -= cost
                        shares = qty
                        cost_basis = price
                        a_counts[BUY] += 1
                        actions_log.append((i, "buy"))
                elif action == SELL and shares > 0:
                    cash += shares * price * (1 - self.commission)
                    reward = (price - cost_basis) * shares
                    shares = 0.0
                    a_counts[SELL] += 1
                    actions_log.append((i, "sell"))
                else:
                    a_counts[HOLD] += 1
                next_state = _discretize(
                    float(rsi[i + 1]) if i + 1 < n else float(rsi[i]),
                    float(roc[i + 1]) if i + 1 < n else float(roc[i]),
                    1 if shares > 0 else 0,
                )
                total_r += reward
                target = reward + gamma * float(np.max(self.q[next_state]))
                self.q[state, action] += lr * (target - self.q[state, action])

            eps = max(0.05, eps * 0.97)
            self.episode_rewards.append(total_r)
            final_eq = cash + shares * closes[-1]
            if total_r > best_reward:
                best_reward = total_r
            self.action_counts = {HOLD: a_counts[HOLD], BUY: a_counts[BUY], SELL: a_counts[SELL]}
            self.total_reward = total_r
            self.trained_on = ep + 1
            if progress_cb:
                progress_cb(ep + 1, episodes)

        self.final_equity = final_eq
        self.benchmark_equity = initial_cash * (closes[-1] / closes[0])
        self.equity_curve = self._backtest(closes, initial_cash)
        return self.metrics()

    def _backtest(self, closes: np.ndarray, initial_cash: float) -> list[float]:
        rsi, roc = _features(closes)
        cash = initial_cash
        shares = 0.0
        cost_basis = 0.0
        eq = []
        for i in range(len(closes)):
            state = _discretize(float(rsi[i]), float(roc[i]), 1 if shares > 0 else 0)
            action = int(np.argmax(self.q[state]))
            price = closes[i]
            if action == BUY and shares == 0 and cash > 0:
                qty = (cash * 0.95) / price
                cost = qty * price * (1 + self.commission)
                if cost <= cash:
                    cash -= cost
                    shares = qty
                    cost_basis = price
            elif action == SELL and shares > 0:
                cash += shares * price * (1 - self.commission)
                shares = 0.0
            eq.append(cash + shares * price)
        return eq

    def metrics(self) -> dict:
        eq = np.asarray(self.equity_curve) if self.equity_curve else np.asarray([self.initial_cash])
        rets = np.diff(eq) / np.maximum(eq[:-1], 1e-9)
        ret = (eq[-1] / eq[0] - 1) * 100 if eq[0] else 0
        vol = rets.std() * np.sqrt(252) * 100 if len(rets) > 1 else 0
        sharpe = rets.mean() / rets.std() * np.sqrt(252) if len(rets) > 1 and rets.std() > 0 else 0
        bench = (self.benchmark_equity / self.initial_cash - 1) * 100 if self.initial_cash else 0
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "final_equity": round(float(eq[-1]), 2),
            "return_pct": round(float(ret), 2),
            "benchmark_return_pct": round(float(bench), 2),
            "sharpe": round(float(sharpe), 3),
            "volatility_pct": round(float(vol), 2),
            "total_reward": round(float(self.total_reward), 2),
            "action_counts": {k: int(v) for k, v in self.action_counts.items()},
            "trained_on": self.trained_on,
            "episodes": len(self.episode_rewards),
            "equity_curve": [round(float(x), 2) for x in self.equity_curve],
            "episode_rewards": [round(float(x), 2) for x in self.episode_rewards],
        }

    def predict(self, rsi: float, roc: float, holding: bool) -> dict:
        state = _discretize(float(rsi), float(roc), 1 if holding else 0)
        qvals = self.q[state]
        soft = np.exp(qvals - qvals.max())
        probs = soft / soft.sum()
        action = int(np.argmax(qvals))
        label = {BUY: "buy", SELL: "sell", HOLD: "hold"}[action]
        return {
            "action": label,
            "confidence": round(float(probs[action]), 3),
            "q_values": [round(float(x), 3) for x in qvals],
            "rsi": round(float(rsi), 2),
            "roc": round(float(roc), 2),
        }


_agents: dict[str, RLAgent] = {}
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _start_train(symbol: str, timeframe: str, source: str, episodes: int, initial_cash: float,
                 candles_getter) -> str:
    job_id = uuid.uuid4().hex[:10]
    with _jobs_lock:
        _jobs[job_id] = {"status": "training", "progress": 0.0, "symbol": symbol}

    def worker():
        try:
            candles = candles_getter(symbol, timeframe, source, 600)
            closes = np.asarray([c.c for c in candles], dtype=float)
            if len(closes) < 60:
                raise ValueError("not enough data to train")
            agent = _agents.get(symbol)
            if agent is None:
                agent = RLAgent(symbol, timeframe)
                _agents[symbol] = agent

            def cb(done, total):
                with _jobs_lock:
                    if job_id in _jobs:
                        _jobs[job_id]["progress"] = round(done / total * 100, 1)

            metrics = agent.train(closes, initial_cash, episodes, progress_cb=cb)
            with _jobs_lock:
                _jobs[job_id] = {"status": "done", "progress": 100.0, "symbol": symbol, "result": metrics}
        except Exception as e:
            with _jobs_lock:
                _jobs[job_id] = {"status": "error", "symbol": symbol, "error": str(e)}

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return job_id


def get_job(job_id: str) -> dict:
    with _jobs_lock:
        return _jobs.get(job_id)


def get_agent(symbol: str) -> RLAgent | None:
    return _agents.get(symbol)


def agents_status() -> list[dict]:
    return [
        {
            "symbol": sym,
            "timeframe": a.timeframe,
            "trained_episodes": a.trained_on,
            "return_pct": round((a.final_equity / a.initial_cash - 1) * 100, 2) if a.initial_cash else 0,
            "q_size": int(a.q.size),
        }
        for sym, a in _agents.items()
    ]
