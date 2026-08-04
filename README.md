# MarketSim — Real-Time Stock Market Simulator

A full-stack **paper-trading stock market simulator** built as a portfolio showcase for **data science** and **full-stack development**. It generates realistic live market data, streams it over WebSockets, renders TradingView-quality charts, and exposes quant analytics (indicators, risk metrics, correlations, backtesting) through a typed REST API.

![stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20TS-blue)
![python](https://img.shields.io/badge/python-3.12-3776AB)
![license](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### Live Market Simulation
- 20+ simulated tickers across sectors (Tech, Semiconductors, Financials, Healthcare, Energy…)
- Realistic price engine with **market regimes** (bull / bear / sideways / volatile / crash)
- Live **order book** with bids/asks/spreads streaming over WebSocket
- Scrolling **ticker tape**, market index (SIM500), sector performance
- Timeframes: `1m 5m 15m 1h 4h 1d`

### Trading (paper)
- Market / Limit / Stop / Stop-Limit orders with validation & commissions
- Portfolio with cash, positions, realized/unrealized P&L, equity history
- Order book, open orders, cancel orders, trade log

### Charts (TradingView-like)
- Candlesticks + volume, SMA/EMA overlays, Bollinger Bands
- RSI and MACD sub-panes with histograms
- Live price updates push into the last bar in real time

### Data Science
- 22 technical indicators: SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, OBV, ROC, Williams %R, CCI, realized volatility
- Quant stats: mean/std, skew, kurtosis, Sharpe, VaR (95/99), max drawdown, hit rate
- **Correlation & covariance matrices**, portfolio risk analysis (expected return, vol, Sharpe)
- Market regime detection + heuristic text insights + Monte-Carlo-style 30-step forecast

### Backtesting
- 7 strategies: SMA cross, EMA cross, RSI mean-revert, MACD signal, Bollinger revert, momentum, buy & hold
- Equity curve, Sharpe, return vs benchmark, max drawdown, win rate, trade log

---

## 🚀 Quick start

### Option A — Docker
```bash
docker compose up --build
# frontend http://localhost:5173 · backend http://localhost:8000/docs
```

### Option B — Local (Windows scripts included)
```bash
# terminal 1 — backend
backend\run_backend.bat        # or:  run_backend.bat
# terminal 2 — frontend
frontend\run_frontend.bat      # or:  run_frontend.bat
```
Or simply run `start.bat`.

> Windows note: the repo uses `py` (Python 3.12+) and Node 20+. `run_backend.bat` auto-creates a virtualenv.

### Manual setup
```bash
# backend
cd backend
python -m venv venv
venv\Scripts\activate            # linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000/docs

# frontend
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

---

## 🧪 Tests
```bash
cd backend
venv\Scripts\python -m unittest tests.test_app -v
```
15 tests covering the price engine, indicators, analytics, backtesting and the paper-trading engine.

---

## 🔌 API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/symbols` | Symbol catalog |
| GET | `/api/candles/{symbol}?timeframe=&limit=` | OHLCV bars |
| GET | `/api/indicators/{symbol}` | 22 technical indicator series |
| GET | `/api/orderbook/{symbol}` | Simulated order book |
| GET | `/api/quotes` | All live quotes |
| GET | `/api/index` · `/api/sectors/performance` | Index & sector heat |
| GET | `/api/analysis/{symbol}` | Stats, regime, forecast |
| GET | `/api/analysis/correlations` · `/portfolio_risk` · `/insights` | Cross-sectional analytics |
| POST | `/api/orders` · `DELETE /api/orders/{id}` | Paper trading |
| GET | `/api/portfolio` · `/api/trades` · `/api/equity-history` | Account state |
| POST | `/api/backtest` | Run a strategy backtest |
| WS | `/ws` | Live quotes + order book streaming |

Interactive docs: `http://localhost:8000/docs`

---

## 🗂 Project structure
```
stock-simulator/
├─ backend/
│  ├─ app/
│  │  ├─ main.py          # FastAPI app, REST + WebSocket
│  │  ├─ marketdata.py    # simulation engine (regimes, OHLCV, order book)
│  │  ├─ indicators.py    # 22 TA indicators (numpy/pandas)
│  │  ├─ analysis.py      # data-science metrics & analytics
│  │  ├─ backtest.py      # strategy backtesting engine
│  │  ├─ portfolio.py     # paper-trading order engine
│  │  └─ models.py        # pydantic schemas
│  ├─ tests/test_app.py
│  └─ requirements.txt
├─ frontend/
│  ├─ src/
│  │  ├─ components/      # Chart, OrderBook, Watchlist, Trading, Portfolio, Analysis, Backtest
│  │  ├─ hooks/useWebSocket.ts
│  │  ├─ api.ts · types.ts
│  │  └─ App.tsx · styles.css
│  └─ package.json
├─ docker-compose.yml
└─ start.bat / run_backend.bat / run_frontend.bat
```

---

## 🛠 Tech stack
- **Backend:** Python 3.12 · FastAPI · Uvicorn · pandas · numpy
- **Frontend:** React 18 · TypeScript · Vite · lightweight-charts (TradingView)
- **Infra:** Docker Compose

## 📌 Roadmap / ideas
- [ ] Historical price import (real data via yfinance)
- [ ] Reinforcement-learning trading agent
- [ ] Multi-user accounts & auth
- [ ] Mobile-responsive trading layout
- [ ] Alert engine + notifications

MIT licensed.
