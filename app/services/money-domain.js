export const SYSTEM_CASH_GROUP_ID = 'group-cash'
export const SYSTEM_CASH_ITEM_ID = 'item-cash'

const CONFIG_VERSION = 7
const DEFAULT_GROUP_ORDERS = {
  [SYSTEM_CASH_GROUP_ID]: 0,
  'group-bank': 1,
  'group-invest': 2,
  'group-debt': 3,
  'group-other': 4
}
const LEGACY_DEFAULT_GROUP_ORDERS = {
  'group-bank': 0,
  'group-invest': 1,
  [SYSTEM_CASH_GROUP_ID]: 2,
  'group-other': 3,
  'group-debt': 4
}
const LEGACY_DEFAULT_GROUP_ORDERS_WITHOUT_CASH = {
  'group-bank': 0,
  'group-invest': 1,
  'group-other': 2,
  'group-debt': 3
}
const matchesGroupOrder = (groups, orders) => Object.entries(orders)
  .every(([id, order]) => groups.some((group) => group.id === id && Number(group.order) === order))
const createSystemCashGroup = (order = DEFAULT_GROUP_ORDERS[SYSTEM_CASH_GROUP_ID]) => ({ id: SYSTEM_CASH_GROUP_ID, name: '現金', order, archived: false, system: true })
const createSystemCashItem = () => ({
  id: SYSTEM_CASH_ITEM_ID, groupId: SYSTEM_CASH_GROUP_ID, name: '身上現金', behavior: 'cash',
  assetClass: 'cash', liquidity: 'available', includeInAssets: true,
  amount: 0, currency: 'TWD', exchangeRate: 1, order: 0, archived: false, system: true
})

export function createDefaultConfig() {
  return {
    version: CONFIG_VERSION,
    settings: {
      baseCurrency: 'TWD',
      snapshotDisplayLimit: 30,
      cashReconciliationEnabled: true,
      lastSavedAt: null
    },
    groups: [
      createSystemCashGroup(),
      { id: 'group-bank', name: '銀行帳戶', order: DEFAULT_GROUP_ORDERS['group-bank'], archived: false },
      { id: 'group-invest', name: '投資帳戶', order: DEFAULT_GROUP_ORDERS['group-invest'], archived: false },
      { id: 'group-debt', name: '貸款', order: DEFAULT_GROUP_ORDERS['group-debt'], archived: false },
      { id: 'group-other', name: '其他項目', order: DEFAULT_GROUP_ORDERS['group-other'], archived: false }
    ],
    items: [createSystemCashItem()],
    cashDrafts: {},
    recurringCashflowItems: [],
    holdings: [],
    snapshots: [],
    market: {
      taiex: null, ma240: null, lastUpdatedAt: null, source: 'manual',
      fxRates: { TWD: 1 }, fxUpdatedAt: null, fxNextUpdateAt: null, fxSource: null
    }
  }
}

export function normalizeAccountItem(input = {}, fallbackOrder = 0) {
  const item = { ...input }
  const behavior = ['manual', 'foreign', 'cash', 'liability'].includes(item.behavior) ? item.behavior : 'manual'
  const foreign = behavior === 'foreign'
  item.behavior = behavior
  item.assetClass = behavior === 'liability' ? 'liability' : foreign ? 'foreign' : 'cash'
  item.includeInAssets = behavior !== 'liability'
  item.liquidity = behavior === 'liability' ? 'locked' : behavior === 'cash' ? 'available' : item.liquidity === 'locked' ? 'locked' : 'available'
  item.currency = foreign ? (item.currency || 'USD') : 'TWD'
  item.exchangeRate = foreign ? Number(item.exchangeRate || 0) : 1
  item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : fallbackOrder
  delete item.assetClassDetail
  return item
}

export function normalizeConfig(input) {
  const defaults = createDefaultConfig()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults
  const currentSettings = { ...(input.settings || {}) }
  delete currentSettings.allocationTargets
  const cashReconciliationEnabled = currentSettings.cashReconciliationEnabled !== false
  const groups = (Array.isArray(input.groups) ? input.groups : defaults.groups).map((group) => ({ ...group }))
  let cashGroup = groups.find((group) => group.id === SYSTEM_CASH_GROUP_ID)
  const usesLegacyDefaultOrder = Number(input.version || 0) < CONFIG_VERSION
    && (matchesGroupOrder(groups, LEGACY_DEFAULT_GROUP_ORDERS)
      || matchesGroupOrder(groups, LEGACY_DEFAULT_GROUP_ORDERS_WITHOUT_CASH))
  if (cashReconciliationEnabled) {
    if (!cashGroup) {
      for (const group of groups) {
        group.order = Number(group.order) + 1
      }
      cashGroup = createSystemCashGroup()
      groups.push(cashGroup)
    } else {
      Object.assign(cashGroup, { name: '現金', archived: false, system: true })
    }
  } else if (cashGroup) {
    cashGroup.system = false
  }
  if (usesLegacyDefaultOrder) {
    for (const group of groups) {
      if (DEFAULT_GROUP_ORDERS[group.id] != null) group.order = DEFAULT_GROUP_ORDERS[group.id]
    }
  }

  const items = (Array.isArray(input.items) ? input.items : defaults.items).map(normalizeAccountItem)
  let cashItem = items.find((item) => item.id === SYSTEM_CASH_ITEM_ID)
  if (cashReconciliationEnabled) {
    if (!cashItem) {
      cashItem = createSystemCashItem()
      items.push(cashItem)
    } else {
      Object.assign(cashItem, {
        groupId: SYSTEM_CASH_GROUP_ID,
        name: cashItem.name || '身上現金',
        behavior: 'cash',
        assetClass: 'cash',
        liquidity: 'available',
        includeInAssets: true,
        currency: 'TWD',
        exchangeRate: 1,
        archived: false,
        system: true
      })
    }
  } else if (cashItem) {
    cashItem.system = false
    if (cashItem.behavior === 'cash') Object.assign(cashItem, normalizeAccountItem({ ...cashItem, behavior: 'manual' }))
  }
  return {
    ...defaults,
    ...input,
    version: CONFIG_VERSION,
    settings: {
      ...defaults.settings,
      ...currentSettings
    },
    groups,
    items,
    cashDrafts: input.cashDrafts && typeof input.cashDrafts === 'object' && !Array.isArray(input.cashDrafts) ? input.cashDrafts : {},
    recurringCashflowItems: (Array.isArray(input.recurringCashflowItems) ? input.recurringCashflowItems : []).map((item, index) => ({
      ...item,
      name: String(item.name || '').trim(),
      type: item.type === 'expense' ? 'expense' : 'income',
      amount: Math.max(0, Number(item.amount || 0)),
      frequency: ['monthly', 'quarterly', 'semiannual', 'annual'].includes(item.frequency) ? item.frequency : 'monthly',
      occurrenceMonth: Math.min(12, Math.max(1, Math.trunc(Number(item.occurrenceMonth || 1)))),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index
    })),
    holdings: (Array.isArray(input.holdings) ? input.holdings : []).map((holding, index) => {
      const currentHolding = { ...holding }
      const leverageInput = Number(currentHolding.leverage ?? currentHolding.multiplier)
      const inverse = currentHolding.direction === 'inverse'
      delete currentHolding.multiplier
      delete currentHolding.direction
      delete currentHolding.includeInAssets
      delete currentHolding.assetClassDetail
      const leverage = Number.isFinite(leverageInput) ? Math.trunc(leverageInput) : 1
      return {
        ...currentHolding,
        assetClass: currentHolding.assetClass === 'bond' ? 'bond' : 'equity',
        leverage: inverse ? -Math.abs(leverage) : leverage,
        order: Number.isFinite(Number(holding.order)) ? Number(holding.order) : index
      }
    }),
    snapshots: Array.isArray(input.snapshots) ? input.snapshots : [],
    market: {
      ...defaults.market,
      ...(input.market || {}),
      fxRates: { ...defaults.market.fxRates, ...(input.market?.fxRates || {}) }
    }
  }
}

const recurringPaymentsPerYear = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }

export function recurringCashflowAnnualAmount(item) {
  return round(Number(item?.amount || 0) * (recurringPaymentsPerYear[item?.frequency] || 12))
}

export function recurringCashflowMonthlyAmount(item) {
  return round(recurringCashflowAnnualAmount(item) / 12)
}

export function recurringCashflowOccurrenceMonths(item) {
  if (item?.frequency === 'monthly') return Array.from({ length: 12 }, (_, index) => index + 1)
  const step = item?.frequency === 'quarterly' ? 3 : item?.frequency === 'semiannual' ? 6 : 12
  const result = []
  for (let month = Number(item?.occurrenceMonth || 1); result.length < 12 / step; month += step) result.push(((month - 1) % 12) + 1)
  return result.sort((left, right) => left - right)
}

export function calculateRecurringCashflow(items = []) {
  const activeItems = items.filter((item) => item && Number(item.amount) > 0)
  const annualIncome = activeItems
    .filter((item) => item.type === 'income')
    .reduce((total, item) => total + recurringCashflowAnnualAmount(item), 0)
  const annualExpense = activeItems
    .filter((item) => item.type === 'expense')
    .reduce((total, item) => total + recurringCashflowAnnualAmount(item), 0)
  return {
    monthlyIncome: round(annualIncome / 12),
    monthlyExpense: round(annualExpense / 12),
    monthlyNetCashflow: round((annualIncome - annualExpense) / 12),
    annualIncome: round(annualIncome),
    annualExpense: round(annualExpense),
    annualNetCashflow: round(annualIncome - annualExpense)
  }
}

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits))
const itemValue = (item) => Number(item.amount || 0) * (item.currency === 'TWD' ? 1 : Number(item.exchangeRate || 0))
const holdingMarketValue = (holding) => Number(holding.quantity || 0) * Number(holding.price || 0)
const holdingExposure = (holding) => holdingMarketValue(holding) * Number(holding.leverage ?? 1)

export function calculateSummary(config) {
  const items = (config?.items || []).filter((item) => !item.archived)
  const holdings = (config?.holdings || []).filter((holding) => !holding.archived)
  const assets = items.filter((item) => item.includeInAssets && item.assetClass !== 'liability')
  const liabilities = items.filter((item) => item.assetClass === 'liability')
  const includedHoldings = holdings
  const totalAssets = assets.reduce((sum, item) => sum + itemValue(item), 0) + includedHoldings.reduce((sum, holding) => sum + holdingMarketValue(holding), 0)
  const totalLiabilities = liabilities.reduce((sum, item) => sum + Math.abs(itemValue(item)), 0)
  const stockHoldings = includedHoldings.filter((holding) => holding.assetClass === 'equity')
  const bondHoldings = includedHoldings.filter((holding) => holding.assetClass === 'bond')
  const totalStocks = stockHoldings.reduce((sum, holding) => sum + holdingMarketValue(holding), 0)
  const totalBonds = bondHoldings.reduce((sum, holding) => sum + holdingMarketValue(holding), 0)
  const totalStockExposure = stockHoldings.reduce((sum, holding) => sum + holdingExposure(holding), 0)
  const totalBondExposure = bondHoldings.reduce((sum, holding) => sum + holdingExposure(holding), 0)
  const totalCash = assets.filter((item) => item.assetClass === 'cash').reduce((sum, item) => sum + itemValue(item), 0)
  const totalForeign = assets.filter((item) => item.assetClass === 'foreign').reduce((sum, item) => sum + itemValue(item), 0)
  const availableAssets = assets.filter((item) => item.liquidity === 'available').reduce((sum, item) => sum + itemValue(item), 0)
  const availableCash = assets
    .filter((item) => ['cash', 'foreign'].includes(item.assetClass) && item.liquidity !== 'locked')
    .reduce((sum, item) => sum + itemValue(item), 0)
  const restrictedCash = totalCash + totalForeign - availableCash

  return {
    totalAssets: round(totalAssets), totalLiabilities: round(totalLiabilities),
    netWorth: round(totalAssets - totalLiabilities), availableAssets: round(availableAssets),
    availableCash: round(availableCash), restrictedCash: round(restrictedCash),
    totalStocks: round(totalStocks), stockRatio: totalAssets ? round(totalStocks / totalAssets, 6) : 0,
    totalBonds: round(totalBonds), bondRatio: totalAssets ? round(totalBonds / totalAssets, 6) : 0,
    totalStockExposure: round(totalStockExposure), totalBondExposure: round(totalBondExposure),
    totalInvestmentExposure: round(totalStockExposure + totalBondExposure),
    totalCash: round(totalCash), totalForeign: round(totalForeign),
    totalOther: round(Math.max(0, totalAssets - totalStocks - totalBonds - totalCash - totalForeign))
  }
}

export function upsertSnapshot(snapshots, snapshot) {
  const result = [...(snapshots || [])]
  const index = result.findIndex((entry) => entry.date === snapshot.date)
  if (index >= 0) result[index] = snapshot
  else result.push(snapshot)
  return result.sort((a, b) => a.date.localeCompare(b.date))
}
