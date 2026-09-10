const EXPORT_REGION = 'TW'
const MARKET_INDEX_ID = '^TWII'
const FIXED_STOCK_GROUPS = [
  {
    key: 1,
    stocks: [
      { id: '^TWII', region: 'TW' },
      { id: '0050.TW', region: 'TW' },
      { id: '2330.TW', region: 'TW' },
      { id: '2303.TW', region: 'TW' },
      { id: '4585.TW', region: 'TW' },
      { id: '2412.TW', region: 'TW' },
      { id: '00635U.TW', region: 'TW' },
      { id: '6505.TW', region: 'TW' }
    ]
  },
  {
    key: 2,
    stocks: [
      { id: '0050.TW', region: 'TW' },
      { id: '00795B.TWO', region: 'TW' },
      { id: '00981A.TW', region: 'TW' },
      { id: '00988A.TW', region: 'TW' }
    ]
  }
]

function toExportStockId(value) {
  const ticker = String(value || '').trim().toUpperCase()
  if (!ticker) return ''
  if (ticker === MARKET_INDEX_ID || ticker === 'TWII') return MARKET_INDEX_ID
  const tickerWithoutMarket = ticker.replace(/\.(?:TW|TWO)$/, '')
  return tickerWithoutMarket ? `${tickerWithoutMarket}.TW` : ''
}

function createStockBuyListEntries(items = []) {
  const stocks = [{ id: MARKET_INDEX_ID, region: EXPORT_REGION }]
  const includedIds = new Set([MARKET_INDEX_ID])

  for (const item of items) {
    const id = toExportStockId(item?.ticker)
    if (!id || includedIds.has(id)) continue
    includedIds.add(id)
    stocks.push({ id, region: EXPORT_REGION })
  }

  return stocks
}

export function createStockBuyListFormat(items = []) {
  const groups = [
    ...FIXED_STOCK_GROUPS,
    { key: 3, stocks: createStockBuyListEntries(items) },
    ...[4, 5, 6, 7].map((key) => ({ key, stocks: [] }))
  ]
  return JSON.stringify(groups)
}

export async function copyStockBuyListFormat(items = []) {
  const text = createStockBuyListFormat(items)
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('瀏覽器不允許寫入剪貼簿。')
  }
  return { text, count: createStockBuyListEntries(items).length }
}
