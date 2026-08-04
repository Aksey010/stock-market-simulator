import { useEffect, useRef } from 'react'
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle, Indicators } from '../types'

interface Props {
  candles: Candle[]
  indicators?: Indicators | null
  live?: { price?: number; ts?: number }
}

interface Ctx {
  priceChart: IChartApi
  volumeChart: IChartApi
  rsiChart: IChartApi
  macdChart: IChartApi
  candle: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
  rsi: ISeriesApi<'Line'>
  rsiU: ISeriesApi<'Line'>
  rsiD: ISeriesApi<'Line'>
  macd: ISeriesApi<'Line'>
  macdS: ISeriesApi<'Line'>
  macdH: ISeriesApi<'Histogram'>
  bbU: ISeriesApi<'Line'>
  bbL: ISeriesApi<'Line'>
  sma10: ISeriesApi<'Line'>
  sma20: ISeriesApi<'Line'>
  sma50: ISeriesApi<'Line'>
  ema12: ISeriesApi<'Line'>
}

function line(idx: number, arr?: number[]): { time: UTCTimestamp; value: number }[] {
  if (!arr) return []
  return arr.map((v, i) => ({ time: i as UTCTimestamp, value: v }))
}

export function Chart({ candles, indicators, live }: Props) {
  const mainRef = useRef<HTMLDivElement>(null)
  const volRef = useRef<HTMLDivElement>(null)
  const rsiRef = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<Ctx | null>(null)

  const base: any = {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: '#0f1420' }, textColor: '#9aa4b2', fontSize: 11 },
    grid: { vertLines: { color: 'rgba(45,55,75,0.4)' }, horzLines: { color: 'rgba(45,55,75,0.4)' } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2a3550' },
    timeScale: { borderColor: '#2a3550', timeVisible: true, rightOffset: 5 },
  }

  useEffect(() => {
    if (!mainRef.current) return
    const priceChart = createChart(mainRef.current, { ...base, height: 500 })
    const volumeChart = createChart(volRef.current!, { ...base, height: 90 })
    const rsiChart = createChart(rsiRef.current!, { ...base, height: 130 })
    const macdChart = createChart(macdRef.current!, { ...base, height: 130 })
    volumeChart.timeScale().applyOptions({ visible: false })
    priceChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 } })

    const candle = priceChart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a', borderDownColor: '#ef5350',
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    })
    const bbU = priceChart.addLineSeries({ color: 'rgba(38,166,154,0.5)', lineWidth: 1 })
    const bbL = priceChart.addLineSeries({ color: 'rgba(38,166,154,0.5)', lineWidth: 1 })
    const sma10 = priceChart.addLineSeries({ color: '#f5b74a', lineWidth: 1 })
    const sma20 = priceChart.addLineSeries({ color: '#42a5f5', lineWidth: 1 })
    const sma50 = priceChart.addLineSeries({ color: '#ab47bc', lineWidth: 1 })
    const ema12 = priceChart.addLineSeries({ color: '#ef5350', lineWidth: 1 })

    const volume = volumeChart.addHistogramSeries({
      priceFormat: { type: 'volume' }, priceScaleId: '',
    })
    volumeChart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    const rsi = rsiChart.addLineSeries({ color: '#ab7bfd', lineWidth: 2 })
    const rsiU = rsiChart.addLineSeries({ color: 'rgba(171,123,253,0.2)', lineWidth: 1 })
    const rsiD = rsiChart.addLineSeries({ color: 'rgba(171,123,253,0.2)', lineWidth: 1 })

    const macd = macdChart.addLineSeries({ color: '#26a69a', lineWidth: 2 })
    const macdS = macdChart.addLineSeries({ color: '#f5b74a', lineWidth: 2 })
    const macdH = macdChart.addHistogramSeries({ priceFormat: { type: 'price', precision: 2 } })

    ctxRef.current = {
      priceChart, volumeChart, rsiChart, macdChart,
      candle, volume, rsi, rsiU, rsiD, macd, macdS, macdH, bbU, bbL, sma10, sma20, sma50, ema12,
    }

    const fit = () => { priceChart.timeScale().fitContent() }
    if (candles.length) setTimeout(fit, 100)

    const ro = new ResizeObserver(() => {})
    return () => {
      ro.disconnect()
      priceChart.remove(); volumeChart.remove(); rsiChart.remove(); macdChart.remove()
      ctxRef.current = null
    }
  }, [])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !candles.length) return
    const data = candles.map((c) => ({ time: c.t as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c }))
    const range = ctx.priceChart.timeScale().getVisibleLogicalRange()
    ctx.candle.setData(data)
    ctx.volume.setData(
      candles.map((c) => ({ time: c.t as UTCTimestamp, value: c.v, color: c.c >= c.o ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' })),
    )
    const ind = indicators
    if (ind) {
      const t = (v: number, i: number) => ({ time: candles[i].t as UTCTimestamp, value: v })
      ctx.sma10.setData(ind.sma_10 ? ind.sma_10.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.sma20.setData(ind.sma_20 ? ind.sma_20.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.sma50.setData(ind.sma_50 ? ind.sma_50.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.ema12.setData(ind.ema_12 ? ind.ema_12.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.bbU.setData(ind.bb_upper ? ind.bb_upper.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.bbL.setData(ind.bb_lower ? ind.bb_lower.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.rsi.setData(ind.rsi_14 ? ind.rsi_14.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.rsiU.setData(ind.rsi_14 ? ind.rsi_14.map((v, i) => ({ ...t(v, i), value: 70 })) : [])
      ctx.rsiD.setData(ind.rsi_14 ? ind.rsi_14.map((v, i) => ({ ...t(v, i), value: 30 })) : [])
      ctx.macd.setData(ind.macd ? ind.macd.map((v, i) => ({ ...t(v, i), value: v })) : [])
      ctx.macdS.setData(ind.macd_signal ? ind.macd_signal.map((v, i) => ({ ...t(v, i), value: v })) : [])
      const hist = (ind.macd_hist && candles ? ind.macd_hist.map((v, i) => ({
        time: candles[i].t as UTCTimestamp, value: v,
        color: v >= 0 ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      })) : []) as any[]
      ctx.macdH.setData(hist as never)
    }
    if (range) {
      try { ctx.priceChart.timeScale().setVisibleLogicalRange(range) } catch { /* ignore */ }
    }
  }, [candles, indicators])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !live?.price || !candles.length) return
    const last = candles[candles.length - 1]
    const price = live.price
    ctx.candle.update({
      time: last.t as UTCTimestamp,
      open: last.o,
      high: Math.max(last.h, price),
      low: Math.min(last.l, price),
      close: price,
    })
  }, [live?.price])

  return (
    <div className="chart-stack">
      <div ref={mainRef} className="main-chart" />
      <div ref={volRef} className="sub-chart" />
      <div ref={rsiRef} className="sub-chart" />
      <div ref={macdRef} className="sub-chart" />
    </div>
  )
}