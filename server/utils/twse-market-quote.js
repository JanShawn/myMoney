const TWSE_MIS_BASE_URL = 'https://mis.twse.com.tw/stock'

const finiteNumber = (value) => {
  const raw = String(value ?? '').replaceAll(',', '').trim()
  if (!raw || raw === '-') return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

const positiveNumber = (value) => {
  const number = finiteNumber(value)
  return number != null && number > 0 ? number : null
}

const firstPrice = (value) =>
  String(value || '')
    .split('_')
    .map(positiveNumber)
    .find((price) => price != null) ?? null

const marketDate = (value) => {
  const date = String(value || '').trim()
  if (!/^\d{8}$/.test(date)) return null
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

const taipeiTime = (dateValue, timeValue) => {
  const date = marketDate(dateValue)
  const time = String(timeValue || '').trim()
  if (!date || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null
  const timestamp = new Date(`${date}T${time}+08:00`)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

const tickerFromSymbol = (symbol) =>
  String(symbol || '').trim().toUpperCase().replace(/\.(?:TW|TWO)$/, '')

const channelFromSymbol = (symbol) => {
  const normalized = String(symbol || '').trim().toUpperCase()
  const ticker = tickerFromSymbol(normalized)
  return `${normalized.endsWith('.TWO') ? 'otc' : 'tse'}_${ticker}.tw`
}

export function parseTwseOddLotQuotes(payload = {}) {
  const quotes = {}

  for (const row of Array.isArray(payload?.msgArray) ? payload.msgArray : []) {
    const ticker = String(row?.c || '').trim().toUpperCase()
    if (!ticker) continue

    quotes[ticker] = {
      ticker,
      name: String(row.n || row.nf || '').trim(),
      market: String(row.ex || '').toLowerCase() === 'otc' ? 'TPEx' : 'TWSE',
      oddLotPrice: positiveNumber(row.trade?.z) ?? positiveNumber(row.z),
      oddLotBidPrice: firstPrice(row.b),
      oddLotAskPrice: firstPrice(row.a),
      oddLotOpenPrice: positiveNumber(row.o),
      oddLotPreviousClose: positiveNumber(row.y),
      oddLotMarketDate: marketDate(row.d),
      oddLotQuoteTime: taipeiTime(row.d, row.trade?.t || row.t || row.tt),
      oddLotSource: '臺灣證券交易所 MIS 盤中零股行情'
    }
  }

  return quotes
}

export function parseTwseEtfNavs(payload = {}) {
  const navs = {}

  for (const provider of Array.isArray(payload?.a1) ? payload.a1 : []) {
    for (const row of Array.isArray(provider?.msgArray) ? provider.msgArray : []) {
      const ticker = String(row?.a || '').trim().toUpperCase()
      if (!ticker) continue

      navs[ticker] = {
        ticker,
        estimatedNetAssetValue: positiveNumber(row.f),
        navMarketPrice: positiveNumber(row.e),
        premiumDiscountPercent: finiteNumber(row.g),
        previousNetAssetValue: positiveNumber(row.h),
        navMarketDate: marketDate(row.i),
        navQuoteTime: taipeiTime(row.i, row.j),
        navReferenceUrl: String(provider.refURL || '').trim(),
        navSource: '臺灣證券交易所 ETF 即時估計淨值'
      }
    }
  }

  return navs
}

async function fetchJson(url, description) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error(`${description}請求失敗（HTTP ${response.status}）。`)
  return response.json()
}

export async function fetchTwseOddLotQuotes(symbols = []) {
  const channels = [...new Set(symbols.map(channelFromSymbol).filter(Boolean))]
  if (!channels.length) return {}
  const query = channels.map(encodeURIComponent).join('|')
  const payload = await fetchJson(
    `${TWSE_MIS_BASE_URL}/api/getOddInfo.jsp?ex_ch=${query}&json=1&delay=0`,
    '盤中零股行情'
  )
  return parseTwseOddLotQuotes(payload)
}

export async function fetchTwseEtfNavs(tickers = []) {
  const wanted = new Set(tickers.map(tickerFromSymbol).filter(Boolean))
  if (!wanted.size) return {}

  const payload = await fetchJson(
    `${TWSE_MIS_BASE_URL}/data/all_etf.txt`,
    'ETF 即時估計淨值'
  )
  const navs = parseTwseEtfNavs(payload)
  return Object.fromEntries(
    Object.entries(navs).filter(([ticker]) => wanted.has(ticker))
  )
}
