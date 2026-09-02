const TWSE_STOCK_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const TWSE_INDEX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX'
const TWSE_MARKET_HISTORY_URL = 'https://www.twse.com.tw/exchangeReport/FMTQIK?response=json'
const TPEX_STOCK_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const FINMIND_PRICE_URL = 'https://api.finmindtrade.com/api/v4/data'
const LOCAL_CATALOG_URL = '/data/market-instruments.json'
const LOCAL_MARKET_URL = '/data/market-summary.json'

let instrumentCache = null
let instrumentCacheExpiresAt = 0
const latestPriceCache = new Map()

const toNumber = (value) => {
  const number = Number(String(value ?? '').replaceAll(',', '').replace('--', ''))
  return Number.isFinite(number) ? number : null
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' }, ...options })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const toMarketDate = (value) => {
  const raw = String(value || '').trim()
  if (/^\d{7}$/.test(raw)) return `${Number(raw.slice(0, 3)) + 1911}-${raw.slice(3, 5)}-${raw.slice(5, 7)}`
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  const slashDate = raw.match(/^(\d{3,4})\/(\d{2})\/(\d{2})$/)
  if (slashDate) return `${Number(slashDate[1]) < 1911 ? Number(slashDate[1]) + 1911 : slashDate[1]}-${slashDate[2]}-${slashDate[3]}`
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

const normalizeMarketHistory = (rows = []) => rows
  .map((row) => ({
    date: toMarketDate(Array.isArray(row) ? row[0] : row?.Date ?? row?.日期 ?? row?.date),
    close: toNumber(Array.isArray(row) ? row[4] : row?.TAIEX ?? row?.收盤指數 ?? row?.ClosingIndex ?? row?.close)
  }))
  .filter((row) => row.date && row.close != null)
  .sort((left, right) => left.date.localeCompare(right.date))

async function fetchLatestTaiexHistory() {
  try {
    const payload = await fetchJson(TWSE_MARKET_HISTORY_URL, { cache: 'no-store' })
    const history = normalizeMarketHistory(Array.isArray(payload) ? payload : payload?.data)
    if (history.length) return history
  } catch {
    // 官網月資料若暫時不可用，改讀 OpenAPI 的最新大盤統計。
  }

  const indices = await fetchJson(TWSE_INDEX_URL, { cache: 'no-store' })
  const candidate = indices.find((entry) => String(entry.指數 || entry.Index || entry.Name || '').includes('發行量加權'))
  const history = normalizeMarketHistory(candidate ? [candidate] : [])
  if (!history.length) throw new Error('證交所沒有回傳可用的加權指數。')
  return history
}

const taipeiDate = (date) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date)

const yahooQuoteUrl = (ticker, market) => `https://tw.stock.yahoo.com/quote/${ticker}.${market === 'TPEx' ? 'TWO' : 'TW'}`

async function fetchLatestPrice(ticker) {
  const cached = latestPriceCache.get(ticker)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const start = new Date()
  start.setDate(start.getDate() - 14)
  const query = new URLSearchParams({
    dataset: 'TaiwanStockPrice',
    data_id: ticker,
    start_date: taipeiDate(start),
    end_date: taipeiDate(new Date())
  })
  const payload = await fetchJson(`${FINMIND_PRICE_URL}?${query}`)
  if (Number(payload?.status) !== 200 || !Array.isArray(payload?.data)) {
    throw new Error(payload?.msg || 'FinMind 沒有回傳可用資料。')
  }
  const latest = payload.data
    .filter((row) => String(row.stock_id || '').toUpperCase() === ticker && toNumber(row.close) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1)
  if (!latest) throw new Error(`FinMind 查不到 ${ticker} 最近的收盤價。`)
  const value = { price: toNumber(latest.close), marketDate: toMarketDate(latest.date) }
  latestPriceCache.set(ticker, { value, expiresAt: Date.now() + 5 * 60 * 1000 })
  return value
}

async function fetchInstrumentCatalog() {
  if (instrumentCache && Date.now() < instrumentCacheExpiresAt) return instrumentCache

  const instruments = new Map()
  const warnings = []
  let hasLocalCatalog = false

  try {
    const catalog = await fetchJson(LOCAL_CATALOG_URL)
    const rows = Array.isArray(catalog) ? catalog : catalog.instruments
    hasLocalCatalog = Array.isArray(rows) && rows.length > 0
    for (const row of rows || []) {
      const ticker = String(row.ticker || '').trim().toUpperCase()
      if (!ticker) continue
      instruments.set(ticker, {
        ticker,
        name: String(row.name || '').trim(),
        price: toNumber(row.price),
        market: row.market,
        marketDate: toMarketDate(row.marketDate),
        cachedAt: catalog.generatedAt || null
      })
    }
  } catch {
    // 沒有本機快取時，才使用下方的官方線上端點作為備援。
  }

  if (hasLocalCatalog) {
    instrumentCache = { instruments, warnings, hasLocalCatalog }
    instrumentCacheExpiresAt = Date.now() + 5 * 60 * 1000
    return instrumentCache
  }

  const [twseResult, tpexResult] = await Promise.allSettled([
    fetchJson(TWSE_STOCK_URL),
    fetchJson(TPEX_STOCK_URL)
  ])

  if (twseResult.status === 'fulfilled') {
    for (const row of twseResult.value) {
      const ticker = String(row.Code || '').trim().toUpperCase()
      if (!ticker) continue
      instruments.set(ticker, {
        ticker,
        name: String(row.Name || '').trim(),
        price: toNumber(row.ClosingPrice),
        market: 'TWSE',
        marketDate: toMarketDate(row.Date),
        cachedAt: null
      })
    }
  } else {
    warnings.push('無法取得證交所上市商品資料。')
  }

  if (tpexResult.status === 'fulfilled') {
    for (const row of tpexResult.value) {
      const ticker = String(row.SecuritiesCompanyCode || row.Code || '').trim().toUpperCase()
      if (!ticker || instruments.has(ticker)) continue
      instruments.set(ticker, {
        ticker,
        name: String(row.CompanyName || row.Name || '').trim(),
        price: toNumber(row.Close || row.ClosingPrice),
        market: 'TPEx',
        marketDate: toMarketDate(row.Date),
        cachedAt: null
      })
    }
  } else {
    warnings.push('無法取得櫃買中心上櫃商品資料。')
  }

  instrumentCache = { instruments, warnings, hasLocalCatalog }
  instrumentCacheExpiresAt = Date.now() + 5 * 60 * 1000
  return instrumentCache
}

export async function lookupMarketInstrument(input) {
  const ticker = String(input || '').trim().toUpperCase()
  if (!ticker) throw new Error('請先輸入股票或商品代號。')
  const { instruments, warnings, hasLocalCatalog } = await fetchInstrumentCatalog()
  const instrument = instruments.get(ticker)
  if (!instrument) {
    if (warnings.length === 2 && !hasLocalCatalog) throw new Error('官方線上資料與本機商品快取都無法讀取，請重新整理後再試或改用手動輸入。')
    throw new Error(`查不到代號 ${ticker}；目前自動查詢支援台灣上市與上櫃商品。`)
  }
  let latest = null
  try {
    latest = await fetchLatestPrice(ticker)
  } catch {
    // 線上日行情失敗時保留官方商品快取，讓使用者仍可建立持倉。
  }
  const resolved = { ...instrument, ...(latest || {}) }
  if (!resolved.name || !resolved.price) {
    throw new Error(`已找到 ${ticker}，但官方資料沒有可用的名稱或收盤價，請改用手動輸入。`)
  }
  const organization = resolved.market === 'TWSE' ? '臺灣證券交易所' : '證券櫃檯買賣中心'
  const cachedDate = resolved.cachedAt ? new Date(resolved.cachedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''
  const marketDate = resolved.marketDate ? new Date(`${resolved.marketDate}T12:00:00+08:00`).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''
  return {
    ...resolved,
    source: latest
      ? `FinMind 公開日行情（收盤日：${marketDate}）`
      : resolved.cachedAt
        ? `${organization}官方資料快取（收盤日：${marketDate || cachedDate}）`
        : `${organization}${marketDate ? `（收盤日：${marketDate}）` : ''}`,
    yahooUrl: yahooQuoteUrl(ticker, resolved.market),
    fallback: !latest
  }
}

export async function fetchMarketPreview(tickers = []) {
  const warnings = []
  const prices = {}
  const priceDates = {}
  const priceSources = {}
  const yahooUrls = {}
  let taiex = null
  try {
    const catalog = await fetchInstrumentCatalog()
    const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()))
    const latestResults = await Promise.allSettled([...wanted].map(async (ticker) => ({ ticker, latest: await fetchLatestPrice(ticker) })))
    for (const result of latestResults) {
      if (result.status !== 'fulfilled') continue
      const { ticker, latest } = result.value
      prices[ticker] = latest.price
      priceDates[ticker] = latest.marketDate
      priceSources[ticker] = 'FinMind 公開日行情'
    }
    if (!catalog.hasLocalCatalog) warnings.push(...catalog.warnings)
    for (const ticker of wanted) {
      const instrument = catalog.instruments.get(ticker)
      yahooUrls[ticker] = yahooQuoteUrl(ticker, instrument?.market)
      if (prices[ticker] != null) continue
      if (instrument?.price != null) {
        prices[ticker] = instrument.price
        priceDates[ticker] = instrument.marketDate
        priceSources[ticker] = '官方資料快取'
        warnings.push(`無法取得 ${ticker} 的最新日行情，暫時使用 ${instrument.marketDate || '先前交易日'} 官方快取。`)
      } else {
        warnings.push(`查不到 ${ticker} 的最新收盤價，已保留原本價格。`)
      }
    }
  } catch {
    warnings.push('瀏覽器無法取得上市／上櫃收盤價，已保留手動價格。')
  }
  const [localMarketResult, onlineMarketResult] = await Promise.allSettled([
    fetchJson(LOCAL_MARKET_URL),
    fetchLatestTaiexHistory()
  ])
  const localMarket = localMarketResult.status === 'fulfilled' ? localMarketResult.value : null
  const onlineHistory = onlineMarketResult.status === 'fulfilled' ? onlineMarketResult.value : []
  const mergedHistory = new Map()
  for (const row of normalizeMarketHistory(localMarket?.history || [])) mergedHistory.set(row.date, row.close)
  for (const row of onlineHistory) mergedHistory.set(row.date, row.close)
  const marketHistory = [...mergedHistory].map(([date, close]) => ({ date, close })).sort((left, right) => left.date.localeCompare(right.date))
  const latestOnline = onlineHistory.at(-1)
  const latestKnown = marketHistory.at(-1)
  taiex = latestKnown?.close ?? toNumber(localMarket?.taiex)
  const recent240 = marketHistory.slice(-240)
  const ma240 = recent240.length >= 240
    ? Math.round((recent240.reduce((total, row) => total + row.close, 0) / recent240.length) * 100) / 100
    : toNumber(localMarket?.ma240)
  if (onlineMarketResult.status === 'rejected' && localMarket) warnings.push(`無法取得證交所最新大盤資料，暫時使用 ${localMarket.asOfDate || '本機'} 快取。`)
  if (taiex == null) warnings.push('證交所線上資料與本機官方快取都沒有可用的加權指數。')
  if (ma240 == null) warnings.push('本機官方快取沒有足夠的 240 個交易日，無法計算 240MA。')
  return {
    prices,
    priceDates,
    priceSources,
    yahooUrls,
    taiex,
    ma240,
    asOfDate: latestKnown?.date || localMarket?.asOfDate || null,
    fetchedAt: new Date().toISOString(),
    source: latestOnline && latestOnline.date === latestKnown?.date ? '臺灣證券交易所 FMTQIK 最新交易日資料' : '臺灣證券交易所 FMTQIK 官方資料快取',
    warnings
  }
}
