export function createDefaultConfig() {
  return {
    version: 2,
    settings: {
      baseCurrency: 'TWD',
      snapshotDisplayLimit: 30,
      lastSavedAt: null
    },
    groups: [
      { id: 'group-bank', name: '銀行帳戶', order: 0, archived: false },
      { id: 'group-invest', name: '投資帳戶', order: 1, archived: false },
      { id: 'group-other', name: '其他項目', order: 2, archived: false },
      { id: 'group-debt', name: '貸款', order: 3, archived: false }
    ],
    items: [
      {
        id: 'item-cash', groupId: 'group-other', name: '身上現金', behavior: 'cash',
        assetClass: 'cash', liquidity: 'available', includeInAssets: true,
        amount: 0, currency: 'TWD', exchangeRate: 1, archived: false
      }
    ],
    holdings: [],
    snapshots: [],
    market: { taiex: null, ma240: null, lastUpdatedAt: null, source: 'manual' }
  }
}

export function normalizeConfig(input) {
  const defaults = createDefaultConfig()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults
  return {
    ...defaults,
    ...input,
    version: 2,
    settings: { ...defaults.settings, ...(input.settings || {}) },
    groups: Array.isArray(input.groups) ? input.groups : defaults.groups,
    items: Array.isArray(input.items) ? input.items : defaults.items,
    holdings: Array.isArray(input.holdings) ? input.holdings : [],
    snapshots: Array.isArray(input.snapshots) ? input.snapshots : [],
    market: { ...defaults.market, ...(input.market || {}) }
  }
}

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits))
const itemValue = (item) => Number(item.amount || 0) * (item.currency === 'TWD' ? 1 : Number(item.exchangeRate || 0))
const holdingValue = (holding) => Number(holding.quantity || 0) * Number(holding.price || 0) * Number(holding.multiplier || 1)

export function calculateSummary(config) {
  const items = (config?.items || []).filter((item) => !item.archived)
  const holdings = (config?.holdings || []).filter((holding) => !holding.archived)
  const assets = items.filter((item) => item.includeInAssets && item.assetClass !== 'liability')
  const liabilities = items.filter((item) => item.assetClass === 'liability')
  const includedHoldings = holdings.filter((holding) => holding.includeInAssets)
  const totalAssets = assets.reduce((sum, item) => sum + itemValue(item), 0) + includedHoldings.reduce((sum, holding) => sum + holdingValue(holding), 0)
  const totalLiabilities = liabilities.reduce((sum, item) => sum + Math.abs(itemValue(item)), 0)
  const totalStocks = includedHoldings.filter((holding) => holding.assetClass === 'equity').reduce((sum, holding) => sum + holdingValue(holding), 0)
  const totalBonds = includedHoldings.filter((holding) => holding.assetClass === 'bond').reduce((sum, holding) => sum + holdingValue(holding), 0)
  const totalCash = assets.filter((item) => item.assetClass === 'cash').reduce((sum, item) => sum + itemValue(item), 0)
  const availableAssets = assets.filter((item) => item.liquidity === 'available').reduce((sum, item) => sum + itemValue(item), 0)

  return {
    totalAssets: round(totalAssets), totalLiabilities: round(totalLiabilities),
    netWorth: round(totalAssets - totalLiabilities), availableAssets: round(availableAssets),
    totalStocks: round(totalStocks), stockRatio: totalAssets ? round(totalStocks / totalAssets, 6) : 0,
    totalBonds: round(totalBonds), bondRatio: totalAssets ? round(totalBonds / totalAssets, 6) : 0,
    totalCash: round(totalCash), totalOther: round(Math.max(0, totalAssets - totalStocks - totalBonds - totalCash))
  }
}

export function upsertSnapshot(snapshots, snapshot) {
  const result = [...(snapshots || [])]
  const index = result.findIndex((entry) => entry.date === snapshot.date)
  if (index >= 0) result[index] = snapshot
  else result.push(snapshot)
  return result.sort((a, b) => a.date.localeCompare(b.date))
}
