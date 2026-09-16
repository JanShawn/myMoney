import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { fetchTwseEtfNavs, fetchTwseOddLotQuotes } from '../utils/twse-market-quote.js'
import { fetchYahooChartQuote } from '../utils/yahoo-quote.js'

const MAX_SYMBOLS = 30

export default defineEventHandler(async (event) => {
  const symbols = [...new Set(String(getQuery(event).symbols || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean))]

  if (!symbols.length) throw createError({ statusCode: 400, statusMessage: '請提供股票代號。' })
  if (symbols.length > MAX_SYMBOLS) throw createError({ statusCode: 400, statusMessage: `一次最多查詢 ${MAX_SYMBOLS} 檔股票。` })
  if (symbols.some((symbol) => !/^[0-9A-Z]{2,12}\.(?:TW|TWO)$/.test(symbol))) {
    throw createError({ statusCode: 400, statusMessage: '股票代號格式不正確。' })
  }

  const [results, oddLotResult, etfNavResult] = await Promise.all([
    Promise.all(symbols.map(async (symbol) => {
      try {
        return { status: 'fulfilled', quote: await fetchYahooChartQuote(symbol) }
      } catch (error) {
        return { status: 'rejected', symbol, message: error?.message || '行情查詢失敗。' }
      }
    })),
    fetchTwseOddLotQuotes(symbols)
      .then((quotes) => ({ status: 'fulfilled', quotes }))
      .catch((error) => ({ status: 'rejected', message: error?.message || '盤中零股行情查詢失敗。' })),
    fetchTwseEtfNavs(symbols)
      .then((navs) => ({ status: 'fulfilled', navs }))
      .catch((error) => ({ status: 'rejected', message: error?.message || 'ETF 即時估計淨值查詢失敗。' }))
  ])
  const yahooQuotes = {}
  const quotes = {}
  const warnings = []

  for (const result of results) {
    if (result.status === 'fulfilled') yahooQuotes[result.quote.ticker] = result.quote
    else warnings.push(`${result.symbol}：${result.message}`)
  }

  if (oddLotResult.status === 'rejected') warnings.push(oddLotResult.message)
  if (etfNavResult.status === 'rejected') warnings.push(etfNavResult.message)

  for (const symbol of symbols) {
    const ticker = symbol.replace(/\.(?:TW|TWO)$/, '')
    const yahooQuote = yahooQuotes[ticker] || null
    const oddLotQuote = oddLotResult.status === 'fulfilled'
      ? oddLotResult.quotes[ticker] || null
      : null
    const etfNav = etfNavResult.status === 'fulfilled'
      ? etfNavResult.navs[ticker] || null
      : null
    const currentPrice = yahooQuote?.currentPrice
      ?? oddLotQuote?.oddLotPrice
      ?? oddLotQuote?.oddLotAskPrice
      ?? etfNav?.navMarketPrice

    if (currentPrice == null) continue
    quotes[ticker] = {
      symbol,
      ticker,
      name: yahooQuote?.name || oddLotQuote?.name || '',
      market: yahooQuote?.market || oddLotQuote?.market || (symbol.endsWith('.TWO') ? 'TPEx' : 'TWSE'),
      currentPrice,
      regularMarketPrice: yahooQuote?.currentPrice ?? null,
      openPrice: yahooQuote?.openPrice ?? oddLotQuote?.oddLotOpenPrice ?? null,
      previousClose: yahooQuote?.previousClose ?? oddLotQuote?.oddLotPreviousClose ?? null,
      marketDate: yahooQuote?.marketDate || oddLotQuote?.oddLotMarketDate || etfNav?.navMarketDate || null,
      quoteTime: yahooQuote?.quoteTime || oddLotQuote?.oddLotQuoteTime || etfNav?.navQuoteTime || null,
      source: yahooQuote?.source || oddLotQuote?.oddLotSource || etfNav?.navSource || '台股行情',
      ...(oddLotQuote || {}),
      ...(etfNav || {})
    }
  }

  setResponseHeader(event, 'Cache-Control', 'public, max-age=5, s-maxage=5')
  return { quotes, warnings, fetchedAt: new Date().toISOString() }
})
