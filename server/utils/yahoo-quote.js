const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YAHOO_TW_QUOTE_URL = 'https://tw.stock.yahoo.com/quote'
const yahooNameCache = new Map()
const NAME_CACHE_TTL = 24 * 60 * 60 * 1000
const NAME_CACHE_LIMIT = 500

const toPositiveNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

const taipeiDateFromTimestamp = (timestamp) => {
  if (!(Number(timestamp) > 0)) return null
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(Number(timestamp) * 1000))
}

export function parseYahooChartQuote(payload, requestedSymbol = '') {
  const result = payload?.chart?.result?.[0]
  if (!result) throw new Error(payload?.chart?.error?.description || 'Yahoo Finance 沒有回傳行情。')

  const meta = result.meta || {}
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
  const minuteQuote = result.indicators?.quote?.[0] || {}
  const minuteCloses = Array.isArray(minuteQuote.close) ? minuteQuote.close : []
  const minuteOpens = Array.isArray(minuteQuote.open) ? minuteQuote.open : []
  let latestMinutePrice = null
  let latestMinuteTimestamp = null

  for (let index = minuteCloses.length - 1; index >= 0; index -= 1) {
    const price = toPositiveNumber(minuteCloses[index])
    if (price == null) continue
    latestMinutePrice = price
    latestMinuteTimestamp = Number(timestamps[index]) || null
    break
  }

  const symbol = String(meta.symbol || requestedSymbol).trim().toUpperCase()
  const name = String(meta.longName || meta.shortName || meta.displayName || '').trim()
  const currentPrice = toPositiveNumber(meta.regularMarketPrice) ?? latestMinutePrice
  const openPrice = minuteOpens.map(toPositiveNumber).find((value) => value != null)
    ?? toPositiveNumber(meta.regularMarketOpen)
  const quoteTimestamp = Number(meta.regularMarketTime) || latestMinuteTimestamp
  if (!symbol || currentPrice == null) throw new Error(`Yahoo Finance 暫時沒有 ${requestedSymbol || '這檔股票'} 的盤中價格。`)

  return {
    symbol,
    ticker: symbol.replace(/\.(?:TW|TWO)$/, ''),
    name,
    market: symbol.endsWith('.TWO') ? 'TPEx' : 'TWSE',
    currentPrice,
    openPrice,
    previousClose: toPositiveNumber(meta.chartPreviousClose ?? meta.previousClose),
    marketDate: taipeiDateFromTimestamp(quoteTimestamp),
    quoteTime: quoteTimestamp ? new Date(quoteTimestamp * 1000).toISOString() : null,
    source: 'Yahoo Finance 盤中行情'
  }
}

export function parseYahooQuotePageName(html) {
  const match = String(html || '').match(/"symbolName":"((?:\\.|[^"\\])*)"/)
  if (!match) return ''
  try {
    return JSON.parse(`"${match[1]}"`).trim()
  } catch {
    return ''
  }
}

async function fetchYahooQuoteName(symbol) {
  const cached = yahooNameCache.get(symbol)
  if (cached && cached.expiresAt > Date.now()) return cached.name

  const response = await fetch(`${YAHOO_TW_QUOTE_URL}/${encodeURIComponent(symbol)}`, {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error(`Yahoo Finance 名稱請求失敗（HTTP ${response.status}）。`)
  const name = parseYahooQuotePageName(await response.text())
  if (!name) throw new Error(`Yahoo Finance 沒有回傳 ${symbol} 的商品名稱。`)

  yahooNameCache.set(symbol, { name, expiresAt: Date.now() + NAME_CACHE_TTL })
  if (yahooNameCache.size > NAME_CACHE_LIMIT) yahooNameCache.delete(yahooNameCache.keys().next().value)
  return name
}

export async function fetchYahooChartQuote(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase()
  if (!/^[0-9A-Z]{2,12}\.(?:TW|TWO)$/.test(normalized)) throw new Error('股票代號格式不正確。')

  const query = new URLSearchParams({ interval: '1m', range: '1d', includePrePost: 'false' })
  const [response, localizedName] = await Promise.all([
    fetch(`${YAHOO_CHART_URL}/${encodeURIComponent(normalized)}?${query}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    }),
    fetchYahooQuoteName(normalized).catch(() => '')
  ])
  if (!response.ok) throw new Error(`Yahoo Finance 行情請求失敗（HTTP ${response.status}）。`)
  const quote = parseYahooChartQuote(await response.json(), normalized)
  return { ...quote, name: localizedName || quote.name }
}
