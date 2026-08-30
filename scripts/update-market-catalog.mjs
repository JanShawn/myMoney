import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const TWSE_TAIEX_URL = 'https://www.twse.com.tw/exchangeReport/FMTQIK'
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/market-instruments.json')
const marketOutputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/market-summary.json')

const toNumber = (value) => {
  const number = Number(String(value ?? '').replaceAll(',', '').replace('--', ''))
  return Number.isFinite(number) && number > 0 ? number : null
}

const toMarketDate = (value) => {
  const raw = String(value || '').trim()
  if (!/^\d{7}$/.test(raw)) return null
  return `${Number(raw.slice(0, 3)) + 1911}-${raw.slice(3, 5)}-${raw.slice(5, 7)}`
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url} 回傳 HTTP ${response.status}`)
  return response.json()
}

const monthKeys = (count) => {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}01`
  }).reverse()
}

const rocDateToIso = (value) => {
  const match = String(value || '').match(/^(\d{3})\/(\d{2})\/(\d{2})$/)
  return match ? `${Number(match[1]) + 1911}-${match[2]}-${match[3]}` : null
}

async function fetchTaiexHistory() {
  const rowsByDate = new Map()
  for (const month of monthKeys(16)) {
    const payload = await fetchJson(`${TWSE_TAIEX_URL}?response=json&date=${month}`)
    for (const row of payload.data || []) {
      const date = rocDateToIso(row[0])
      const close = toNumber(row[4])
      if (date && close) rowsByDate.set(date, { date, close })
    }
  }
  return [...rowsByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const [twseRows, tpexRows] = await Promise.all([fetchJson(TWSE_URL), fetchJson(TPEX_URL)])
const instruments = new Map()

for (const row of twseRows) {
  const ticker = String(row.Code || '').trim().toUpperCase()
  const name = String(row.Name || '').trim()
  const price = toNumber(row.ClosingPrice)
  if (ticker && name && price) instruments.set(ticker, { ticker, name, price, market: 'TWSE', marketDate: toMarketDate(row.Date) })
}

for (const row of tpexRows) {
  const ticker = String(row.SecuritiesCompanyCode || row.Code || '').trim().toUpperCase()
  const name = String(row.CompanyName || row.Name || '').trim()
  const price = toNumber(row.Close || row.ClosingPrice)
  if (ticker && name && price && !instruments.has(ticker)) instruments.set(ticker, { ticker, name, price, market: 'TPEx', marketDate: toMarketDate(row.Date) })
}

const payload = {
  generatedAt: new Date().toISOString(),
  sources: [TWSE_URL, TPEX_URL],
  instruments: [...instruments.values()].sort((a, b) => a.ticker.localeCompare(b.ticker, 'zh-TW'))
}

const taiexHistory = await fetchTaiexHistory()
const latestTaiex = taiexHistory.at(-1)
const movingAverageWindow = taiexHistory.slice(-240)
if (!latestTaiex || movingAverageWindow.length < 240) throw new Error(`加權指數歷史資料不足 240 筆，目前只有 ${movingAverageWindow.length} 筆。`)
const marketPayload = {
  generatedAt: new Date().toISOString(),
  source: TWSE_TAIEX_URL,
  asOfDate: latestTaiex.date,
  taiex: latestTaiex.close,
  ma240: Number((movingAverageWindow.reduce((sum, row) => sum + row.close, 0) / movingAverageWindow.length).toFixed(2)),
  tradingDays: movingAverageWindow.length,
  history: taiexHistory.slice(-320)
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8')
await writeFile(marketOutputPath, `${JSON.stringify(marketPayload)}\n`, 'utf8')
console.log(`已更新 ${payload.instruments.length} 筆商品資料：${outputPath}`)
console.log(`已更新加權指數 ${marketPayload.taiex}、240MA ${marketPayload.ma240}（${marketPayload.asOfDate}）：${marketOutputPath}`)
