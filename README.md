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

### Real market data (yfinance)
- Toggle **SIM / REAL** in the header
- REAL loads historical OHLCV straight from Yahoo Finance (all 6 timeframes, cached), with a real live quote for the selected ticker
- If yfinance is unreachable it gracefully falls back to the simulator

### Reinforcement-Learning trading agent
- Tabular **Q-learning** agent trained on the selected symbol/timeframe (Authenticator: RSI + momentum + position state, buy/sell/hold actions)
- Train in the browser with progress bar; see equity curve, per-episode rewards, action breakdown
- **Live signal** (buy/sell/hold) with confidence from the trained agent
- Data source-aware (train on simulated or real candles)

### Backtesting
- 7 strategies: SMA cross, EMA cross, RSI mean-revert, MACD signal, Bollinger revert, momentum, buy & hold
- Equity curve, Sharpe, return vs benchmark, max drawdown, win rate, trade log
- Choose simulated or real data

### Mobile responsive
- Adaptive layout for tablets and phones (collapsible watchlist, stacked panels, scrollable tabs)

---

## 🚀 Quick start

> **Prerequisites**
> - **Python 3.12+** (on Windows use `py`, on macOS/Linux `python3`)
> - **Node.js 20+** and **npm**
> - You need **two terminal windows**: one for the backend, one for the frontend.

---

### ▶ Method 1 — Console (fastest, copy-paste)

**Terminal 1 — Backend** (API + live data, port `8000`):
```bash
# Windows
cd backend
py -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# macOS / Linux
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Terminal 2 — Frontend** (UI, port `5173`):
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** → the app should connect to the backend automatically.

---

### ✋ Method 2 — By hand (manual, no ready-made scripts)

Use this when you don't want the one-liner scripts and prefer to do every step yourself.

**Step 1 — Start the backend:**
1. Open a terminal and go into the backend folder: `cd backend`
2. Create a virtual environment: `py -m venv venv`
3. Activate it: `venv\Scripts\activate` (macOS/Linux: `source venv/bin/activate`)
4. Install dependencies: `pip install -r requirements.txt`
5. Start the server: `uvicorn app.main:app --reload`
6. Verify it's alive: open http://localhost:8000/docs (Swagger UI) — or run `curl http://localhost:8000/`

**Step 2 — Start the frontend:**
1. Open a **second** terminal and go into the frontend folder: `cd frontend`
2. Install packages: `npm install`
3. Start the dev server: `npm run dev`
4. Open **http://localhost:5173** in your browser

**Step 3 — Check the connection:**
- The header badge should turn green **LIVE**
- The ticker tape at the top starts scrolling
- The watchlist on the left shows 20 tickers with prices
- Click a symbol → chart, order book and indicators load

**Step 4 — Stop everything** (when done): press `Ctrl+C` in both terminals.

---

### 🐳 Method 3 — Docker (one command, optional)
```bash
docker compose up --build
# frontend http://localhost:5173 · backend http://localhost:8000/docs
```

---

### 💡 Windows one-click scripts (optional shortcut)
If you prefer not to type commands, the repo includes ready scripts:
```bash
start.bat            # launches backend + frontend and opens the browser
backend\run_backend.bat     # backend only (auto-creates venv on first run)
frontend\run_frontend.bat   # frontend only
```
> Note: `run_backend.bat` uses `py` and creates the `venv` automatically on first launch.

---

## 🧪 Tests
```bash
cd backend
venv\Scripts\python -m unittest tests.test_app -v
```
19 tests covering the price engine, indicators, analytics, backtesting, the paper-trading engine, the RL agent and the real-data provider.

---

## 🔌 API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/symbols` | Symbol catalog |
| GET | `/api/candles/{symbol}?timeframe=&limit=&source=` | OHLCV bars (sim or real) |
| GET | `/api/indicators/{symbol}` | 22 technical indicator series |
| GET | `/api/orderbook/{symbol}` | Simulated order book |
| GET | `/api/quotes` | All live quotes |
| GET | `/api/quote/{symbol}` | Real live quote (yfinance) |
| GET | `/api/market/sources` | Real-data availability |
| GET | `/api/index` · `/api/sectors/performance` | Index & sector heat |
| GET | `/api/analysis/{symbol}` | Stats, regime, forecast |
| GET | `/api/analysis/correlations` · `/portfolio_risk` · `/insights` | Cross-sectional analytics |
| POST | `/api/orders` · `DELETE /api/orders/{id}` | Paper trading |
| GET | `/api/portfolio` · `/api/trades` · `/api/equity-history` | Account state |
| POST | `/api/backtest` | Run a strategy backtest |
| POST | `/api/rl/train` · `GET /api/rl/train/{id}` | Train RL agent / poll progress |
| GET | `/api/rl/signal/{symbol}` · `/api/rl/agents` | RL live signal / agents |
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
│  │  ├─ dataprovider.py  # real market data via yfinance (cached, w/ fallback)
│  │  ├─ indicators.py    # 22 TA indicators (numpy/pandas)
│  │  ├─ analysis.py      # data-science metrics & analytics
│  │  ├─ backtest.py      # strategy backtesting engine
│  │  ├─ rlagent.py       # Q-learning trading agent
│  │  ├─ portfolio.py     # paper-trading order engine
│  │  └─ models.py        # pydantic schemas
│  ├─ tests/test_app.py
│  └─ requirements.txt
├─ frontend/
│  ├─ src/
│  │  ├─ components/      # Chart, OrderBook, Watchlist, Trading, Portfolio, Analysis, Backtest, RLAgent
│  │  ├─ hooks/useWebSocket.ts
│  │  ├─ api.ts · types.ts
│  │  └─ App.tsx · styles.css
│  └─ package.json
├─ docker-compose.yml
└─ start.bat / run_backend.bat / run_frontend.bat
```

---

## 🛠 Tech stack
- **Backend:** Python 3.12 · FastAPI · Uvicorn · pandas · numpy · yfinance (real data)
- **Frontend:** React 18 · TypeScript · Vite · lightweight-charts (TradingView)
- **ML:** Tabular Q-learning RL agent (numpy)
- **Infra:** Docker Compose

## 📌 Roadmap / ideas
- [x] Historical price import (real data via yfinance)
- [x] Reinforcement-learning trading agent
- [ ] Multi-user accounts & auth
- [x] Mobile-responsive trading layout
- [ ] Alert engine + notifications

MIT licensed.
