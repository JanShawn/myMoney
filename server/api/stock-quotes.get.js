import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
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

  const results = await Promise.all(symbols.map(async (symbol) => {
    try {
      return { status: 'fulfilled', quote: await fetchYahooChartQuote(symbol) }
    } catch (error) {
      return { status: 'rejected', symbol, message: error?.message || '行情查詢失敗。' }
    }
  }))
  const quotes = {}
  const warnings = []

  for (const result of results) {
    if (result.status === 'fulfilled') quotes[result.quote.ticker] = result.quote
    else warnings.push(`${result.symbol}：${result.message}`)
  }

  setResponseHeader(event, 'Cache-Control', 'public, max-age=5, s-maxage=5')
  return { quotes, warnings, fetchedAt: new Date().toISOString() }
})
