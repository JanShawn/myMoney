const TWSE_STOCK_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const TWSE_INDEX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX'

const toNumber = (value) => {
  const number = Number(String(value ?? '').replaceAll(',', '').replace('--', ''))
  return Number.isFinite(number) ? number : null
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function fetchMarketPreview(tickers = []) {
  const warnings = []
  const prices = {}
  let taiex = null
  try {
    const stocks = await fetchJson(TWSE_STOCK_URL)
    const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()))
    for (const stock of stocks) {
      const ticker = String(stock.Code || '').toUpperCase()
      if (wanted.has(ticker)) prices[ticker] = toNumber(stock.ClosingPrice)
    }
  } catch {
    warnings.push('瀏覽器無法直接取得 TWSE 收盤價，已保留手動價格。')
  }
  try {
    const indices = await fetchJson(TWSE_INDEX_URL)
    const candidate = indices.find((entry) => String(entry.指數 || entry.Index || entry.Name || '').includes('發行量加權'))
    taiex = toNumber(candidate?.收盤指數 || candidate?.ClosingIndex || candidate?.ClosingPrice)
  } catch {
    warnings.push('瀏覽器無法直接取得加權指數，請手動輸入。')
  }
  warnings.push('240MA 第一版仍以手動值為準。')
  return { prices, taiex, ma240: null, fetchedAt: new Date().toISOString(), source: 'TWSE OpenAPI', warnings }
}
