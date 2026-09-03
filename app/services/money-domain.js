export const SYSTEM_CASH_GROUP_ID = 'group-cash'
export const SYSTEM_CASH_ITEM_ID = 'item-cash'

export const CONFIG_LIMITS = Object.freeze({
  maxJsonBytes: 5 * 1024 * 1024,
  maxGroups: 200,
  maxItems: 1000,
  maxHoldings: 500,
  maxSnapshots: 4000,
  maxRecurringCashflowItems: 500,
  maxCashDrafts: 500,
  maxCashDraftRows: 200,
  maxNameLength: 80,
  maxNoteLength: 500,
  maxTickerLength: 12
})

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
const SNAPSHOT_NUMBER_KEYS = [
  'totalAssets', 'totalLiabilities', 'netWorth', 'availableCash', 'availableAssets',
  'totalStocks', 'stockRatio', 'totalBonds', 'bondRatio', 'totalCash', 'totalForeign',
  'totalOther', 'restrictedCash', 'totalStockExposure', 'totalBondExposure', 'totalInvestmentExposure',
  'taiex', 'ma240'
]

const matchesGroupOrder = (groups, orders) => Object.entries(orders)
  .every(([id, order]) => groups.some((group) => group.id === id && Number(group.order) === order))
const createSystemCashGroup = (order = DEFAULT_GROUP_ORDERS[SYSTEM_CASH_GROUP_ID]) => ({ id: SYSTEM_CASH_GROUP_ID, name: '現金', order, archived: false, system: true })
const createSystemCashItem = () => ({
  id: SYSTEM_CASH_ITEM_ID, groupId: SYSTEM_CASH_GROUP_ID, name: '身上現金', behavior: 'cash',
  assetClass: 'cash', liquidity: 'available', includeInAssets: true,
  amount: 0, currency: 'TWD', exchangeRate: 1, order: 0, archived: false, system: true
})

const clipString = (value, max = CONFIG_LIMITS.maxNameLength) => String(value ?? '').trim().slice(0, max)
const finiteNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
const limitArray = (value, max) => (Array.isArray(value) ? value : []).slice(0, max)

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

export function normalizeTicker(value) {
  return clipString(String(value || '').toUpperCase(), CONFIG_LIMITS.maxTickerLength).replace(/[^0-9A-Z]/g, '')
}

export function normalizeAccountItem(input = {}, fallbackOrder = 0) {
  const behavior = ['manual', 'foreign', 'cash', 'liability'].includes(input.behavior) ? input.behavior : 'manual'
  const foreign = behavior === 'foreign'
  return {
    id: String(input.id || ''),
    groupId: String(input.groupId || ''),
    name: clipString(input.name, CONFIG_LIMITS.maxNameLength),
    behavior,
    assetClass: behavior === 'liability' ? 'liability' : foreign ? 'foreign' : 'cash',
    includeInAssets: behavior !== 'liability',
    liquidity: behavior === 'liability' ? 'locked' : behavior === 'cash' ? 'available' : input.liquidity === 'locked' ? 'locked' : 'available',
    amount: Math.max(0, finiteNumber(input.amount)),
    currency: foreign ? (['USD', 'JPY'].includes(input.currency) ? input.currency : 'USD') : 'TWD',
    exchangeRate: foreign ? Math.max(0, finiteNumber(input.exchangeRate)) : 1,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : fallbackOrder,
    archived: Boolean(input.archived),
    system: Boolean(input.system)
  }
}

function normalizeGroup(input = {}, fallbackOrder = 0) {
  return {
    id: String(input.id || ''),
    name: clipString(input.name || '未命名群組', CONFIG_LIMITS.maxNameLength),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : fallbackOrder,
    archived: Boolean(input.archived),
    system: Boolean(input.system)
  }
}

function normalizeCashDraft(input = {}) {
  return {
    expectedAmount: finiteNumber(input.expectedAmount ?? input.baseAmount),
    rows: limitArray(input.rows, CONFIG_LIMITS.maxCashDraftRows).map((row) => ({
      label: clipString(row?.label, CONFIG_LIMITS.maxNameLength),
      operation: row?.operation === 'subtract' ? 'subtract' : 'add',
      amount: Math.max(0, finiteNumber(row?.amount))
    }))
  }
}

function normalizeCashDrafts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const drafts = {}
  for (const [accountId, draft] of Object.entries(input).slice(0, CONFIG_LIMITS.maxCashDrafts)) {
    if (!accountId || accountId === '__proto__' || accountId === 'constructor' || accountId === 'prototype') continue
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) continue
    drafts[String(accountId)] = normalizeCashDraft(draft)
  }
  return drafts
}

function normalizeHolding(input = {}, fallbackOrder = 0) {
  const leverageInput = Number(input.leverage ?? input.multiplier)
  const inverse = input.direction === 'inverse'
  const leverage = Number.isFinite(leverageInput) ? Math.trunc(leverageInput) : 1
  return {
    id: String(input.id || ''),
    ticker: normalizeTicker(input.ticker),
    name: clipString(input.name, CONFIG_LIMITS.maxNameLength),
    market: ['TWSE', 'TPEx'].includes(input.market) ? input.market : '',
    quantity: Math.max(0, finiteNumber(input.quantity)),
    assetClass: input.assetClass === 'bond' ? 'bond' : 'equity',
    leverage: inverse ? -Math.abs(leverage) : leverage,
    price: Math.max(0, finiteNumber(input.price)),
    priceSource: input.priceSource === 'manual' ? 'manual' : 'auto',
    priceAsOfDate: typeof input.priceAsOfDate === 'string' ? clipString(input.priceAsOfDate, 32) || null : null,
    priceSourceLabel: clipString(input.priceSourceLabel || '', CONFIG_LIMITS.maxNameLength),
    liquidity: input.liquidity === 'locked' ? 'locked' : 'convertible',
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : fallbackOrder,
    archived: Boolean(input.archived)
  }
}

function normalizeSnapshot(input = {}) {
  const snapshot = {
    date: clipString(input.date, 32),
    verifiedAt: typeof input.verifiedAt === 'string' ? clipString(input.verifiedAt, 64) : null,
    note: clipString(input.note || '', CONFIG_LIMITS.maxNoteLength)
  }
  for (const key of SNAPSHOT_NUMBER_KEYS) {
    if (input[key] == null || input[key] === '') continue
    snapshot[key] = finiteNumber(input[key])
  }
  return snapshot
}

function normalizeMarket(input = {}, defaults) {
  const fxRates = { TWD: 1 }
  for (const currency of ['USD', 'JPY']) {
    const rate = finiteNumber(input?.fxRates?.[currency], NaN)
    if (Number.isFinite(rate) && rate > 0) fxRates[currency] = rate
  }
  return {
    taiex: input?.taiex == null ? null : finiteNumber(input.taiex),
    ma240: input?.ma240 == null ? null : finiteNumber(input.ma240),
    lastUpdatedAt: typeof input?.lastUpdatedAt === 'string' ? clipString(input.lastUpdatedAt, 64) : null,
    source: clipString(input?.source || defaults.source, 120) || defaults.source,
    fxRates,
    fxUpdatedAt: typeof input?.fxUpdatedAt === 'string' ? clipString(input.fxUpdatedAt, 64) : null,
    fxNextUpdateAt: typeof input?.fxNextUpdateAt === 'string' ? clipString(input.fxNextUpdateAt, 64) : null,
    fxSource: typeof input?.fxSource === 'string' ? clipString(input.fxSource, 120) : null
  }
}

function normalizeSettings(input = {}, defaults) {
  return {
    baseCurrency: 'TWD',
    snapshotDisplayLimit: Math.min(365, Math.max(1, Math.trunc(finiteNumber(input.snapshotDisplayLimit, defaults.snapshotDisplayLimit)))),
    cashReconciliationEnabled: input.cashReconciliationEnabled !== false,
    lastSavedAt: typeof input.lastSavedAt === 'string' ? clipString(input.lastSavedAt, 64) : null
  }
}

function normalizeRecurringCashflowItem(input = {}, fallbackOrder = 0) {
  return {
    id: String(input.id || ''),
    name: clipString(input.name, CONFIG_LIMITS.maxNameLength),
    type: input.type === 'expense' ? 'expense' : 'income',
    amount: Math.max(0, finiteNumber(input.amount)),
    frequency: ['monthly', 'quarterly', 'semiannual', 'annual'].includes(input.frequency) ? input.frequency : 'monthly',
    occurrenceMonth: Math.min(12, Math.max(1, Math.trunc(finiteNumber(input.occurrenceMonth, 1)))),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : fallbackOrder
  }
}

export function assertConfigCollectionLimits(input = {}) {
  const checks = [
    ['groups', CONFIG_LIMITS.maxGroups],
    ['items', CONFIG_LIMITS.maxItems],
    ['holdings', CONFIG_LIMITS.maxHoldings],
    ['snapshots', CONFIG_LIMITS.maxSnapshots],
    ['recurringCashflowItems', CONFIG_LIMITS.maxRecurringCashflowItems]
  ]
  for (const [key, max] of checks) {
    if (Array.isArray(input[key]) && input[key].length > max) {
      throw new Error(`備份的 ${key} 超過上限（最多 ${max} 筆）。`)
    }
  }
  if (input.cashDrafts && typeof input.cashDrafts === 'object' && !Array.isArray(input.cashDrafts)
    && Object.keys(input.cashDrafts).length > CONFIG_LIMITS.maxCashDrafts) {
    throw new Error(`備份的現金驗算草稿超過上限（最多 ${CONFIG_LIMITS.maxCashDrafts} 筆）。`)
  }
}

export function normalizeConfig(input) {
  const defaults = createDefaultConfig()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults
  const settings = normalizeSettings(input.settings || {}, defaults.settings)
  const cashReconciliationEnabled = settings.cashReconciliationEnabled
  const groups = limitArray(input.groups ?? defaults.groups, CONFIG_LIMITS.maxGroups)
    .map((group, index) => normalizeGroup(group, index))
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

  const items = limitArray(input.items ?? defaults.items, CONFIG_LIMITS.maxItems).map(normalizeAccountItem)
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
    version: CONFIG_VERSION,
    settings,
    groups,
    items,
    cashDrafts: normalizeCashDrafts(input.cashDrafts),
    recurringCashflowItems: limitArray(input.recurringCashflowItems, CONFIG_LIMITS.maxRecurringCashflowItems)
      .map((item, index) => normalizeRecurringCashflowItem(item, index)),
    holdings: limitArray(input.holdings, CONFIG_LIMITS.maxHoldings)
      .map((holding, index) => normalizeHolding(holding, index)),
    snapshots: limitArray(input.snapshots, CONFIG_LIMITS.maxSnapshots).map(normalizeSnapshot),
    market: normalizeMarket(input.market || {}, defaults.market)
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

export function calculateRecurringCashflowForMonth(items = [], month = 1) {
  const targetMonth = Math.min(12, Math.max(1, Math.trunc(Number(month) || 1)))
  const activeItems = items.filter((item) => item
    && Number(item.amount) > 0
    && recurringCashflowOccurrenceMonths(item).includes(targetMonth))
  const income = activeItems
    .filter((item) => item.type === 'income')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
  const expense = activeItems
    .filter((item) => item.type === 'expense')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
  return {
    income: round(income),
    expense: round(expense),
    netCashflow: round(income - expense)
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
  const normalized = normalizeSnapshot(snapshot)
  const index = result.findIndex((entry) => entry.date === normalized.date)
  if (index >= 0) result[index] = normalized
  else result.push(normalized)
  return result.sort((a, b) => a.date.localeCompare(b.date))
}
