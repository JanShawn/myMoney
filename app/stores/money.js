import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { calculateRecurringCashflow, calculateSummary, createDefaultConfig, normalizeConfig, SYSTEM_CASH_GROUP_ID, SYSTEM_CASH_ITEM_ID, upsertSnapshot } from '~/services/money-domain'
import {
  importJsonFile, inspectJsonImport, listLocalBackups, loadLocalData, persistLocalData,
  resetLocalData, restoreLocalBackup, saveJsonBackup
} from '~/services/local-json-storage'
import { fetchMarketPreview, lookupMarketInstrument } from '~/services/market-service'
import { fetchTwdExchangeRates } from '~/services/exchange-rate-service'
import { exportSnapshotsToExcel } from '~/services/excel-transfer'

export const useMoneyStore = defineStore('money', () => {
  const config = ref(createDefaultConfig())
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const storageStatus = reactive({
    lastSavedAt: null,
    jsonBackup: {
      exists: false,
      isCurrent: false,
      fileName: '',
      createdAt: null,
      changes: [],
      summary: null,
      comparisonAvailable: false
    }
  })

  const summary = computed(() => calculateSummary(config.value))
  const cashflowPlan = computed(() => calculateRecurringCashflow(config.value.recurringCashflowItems || []))
  const snapshots = computed(() => config.value.snapshots || [])
  const activeItems = computed(() => config.value.items.filter((item) => !item.archived))
  const activeHoldings = computed(() => config.value.holdings
    .filter((item) => !item.archived)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)))
  const recurringCashflowItems = computed(() => [...(config.value.recurringCashflowItems || [])]
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)))
  const lastSnapshot = computed(() => snapshots.value.at(-1) || null)
  const cloneConfig = (value) => structuredClone(toRaw(value))

  function applyStorageResult(result) {
    config.value = normalizeConfig(result.data)
    storageStatus.lastSavedAt = config.value.settings?.lastSavedAt || null
    if (result.backupStatus) Object.assign(storageStatus.jsonBackup, result.backupStatus)
  }

  function applyPersistResult(result) {
    applyStorageResult(result)
  }

  async function run(action) {
    saving.value = true
    error.value = ''
    try {
      return await action()
    } catch (actionError) {
      if (actionError?.name !== 'AbortError') error.value = actionError?.message || '操作失敗'
      throw actionError
    } finally {
      saving.value = false
    }
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      applyStorageResult(await loadLocalData())
    } catch (loadError) {
      config.value = createDefaultConfig()
      error.value = '無法讀取本機資料，已載入預設資料：' + loadError.message
    } finally {
      loading.value = false
    }
  }

  async function mutate(mutator) {
    return run(async () => {
      const previous = cloneConfig(config.value)
      const result = mutator(config.value)
      config.value.settings.lastSavedAt = new Date().toISOString()
      try {
        applyPersistResult(await persistLocalData(config.value))
      } catch (persistError) {
        config.value = previous
        throw persistError
      }
      return result
    })
  }

  const addGroup = (body) => mutate((draft) => {
    const group = { id: crypto.randomUUID(), name: body.name.trim(), order: body.order ?? draft.groups.length, archived: false }
    draft.groups.push(group)
    return group
  })

  const updateGroup = (id, body) => mutate((draft) => {
    const group = draft.groups.find((entry) => entry.id === id)
    if (!group) throw new Error('找不到這個群組')
    if (id === SYSTEM_CASH_GROUP_ID && body.archived === true) throw new Error('「現金」是現金驗算使用的系統群組，不能封存。')
    if (id === SYSTEM_CASH_GROUP_ID && body.name && body.name !== '現金') throw new Error('「現金」是系統群組，名稱不能變更。')
    Object.assign(group, body)
    if (body.archived === true) draft.items.filter((item) => item.groupId === id).forEach((item) => { item.archived = true })
    return group
  })

  const addItem = (body) => mutate((draft) => {
    const item = { id: crypto.randomUUID(), ...body, archived: false }
    draft.items.push(item)
    return item
  })

  const updateItem = (id, body) => mutate((draft) => {
    const item = draft.items.find((entry) => entry.id === id)
    if (!item) throw new Error('找不到這個項目')
    if (id === SYSTEM_CASH_ITEM_ID && body.archived === true) throw new Error('「身上現金」與現金驗算連動，不能封存。')
    if (id === SYSTEM_CASH_ITEM_ID && body.groupId && body.groupId !== SYSTEM_CASH_GROUP_ID) throw new Error('系統現金帳戶必須保留在「現金」群組。')
    Object.assign(item, body)
    if (id === SYSTEM_CASH_ITEM_ID) Object.assign(item, { groupId: SYSTEM_CASH_GROUP_ID, behavior: 'cash', assetClass: 'cash', liquidity: 'available', includeInAssets: true, currency: 'TWD', exchangeRate: 1, archived: false, system: true })
    return item
  })

  const deleteItem = (id) => mutate((draft) => {
    if (id === SYSTEM_CASH_ITEM_ID) throw new Error('「身上現金」是系統連動帳戶，不能刪除。')
    const index = draft.items.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('找不到要刪除的帳戶或項目。')
    const [item] = draft.items.splice(index, 1)
    delete draft.cashDrafts?.[id]
    return item
  })

  const addHolding = (body) => mutate((draft) => {
    const nextOrder = draft.holdings.reduce((highest, holding) => Math.max(highest, Number(holding.order ?? -1)), -1) + 1
    const holding = { id: crypto.randomUUID(), ...body, ticker: body.ticker.toUpperCase(), order: nextOrder, archived: false }
    draft.holdings.push(holding)
    return holding
  })

  const updateHolding = (id, body) => mutate((draft) => {
    const holding = draft.holdings.find((entry) => entry.id === id)
    if (!holding) throw new Error('找不到這筆持倉')
    Object.assign(holding, body)
    return holding
  })

  const deleteHolding = (id) => mutate((draft) => {
    const index = draft.holdings.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('找不到要刪除的投資持倉。')
    const [holding] = draft.holdings.splice(index, 1)
    return holding
  })

  const moveHolding = (id, direction) => mutate((draft) => {
    const ordered = draft.holdings
      .filter((holding) => !holding.archived)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    const index = ordered.findIndex((holding) => holding.id === id)
    const target = ordered[index + direction]
    if (index < 0) throw new Error('找不到要排序的投資持倉。')
    if (!target) return ordered[index]
    const currentOrder = ordered[index].order
    ordered[index].order = target.order
    target.order = currentOrder
    return ordered[index]
  })

  const updateSettings = (body) => mutate((draft) => {
    Object.assign(draft.settings, body)
    return draft.settings
  })

  const addRecurringCashflowItem = (body) => mutate((draft) => {
    const name = String(body.name || '').trim()
    const amount = Number(body.amount)
    if (!name) throw new Error('請填寫週期收支項目名稱。')
    if (!(amount > 0)) throw new Error('週期收支金額必須大於 0。')
    const type = body.type === 'expense' ? 'expense' : 'income'
    const nextOrder = (draft.recurringCashflowItems || [])
      .filter((item) => item.type === type)
      .reduce((highest, item) => Math.max(highest, Number(item.order ?? -1)), -1) + 1
    const item = {
      id: crypto.randomUUID(),
      name,
      type,
      amount,
      frequency: ['monthly', 'quarterly', 'semiannual', 'annual'].includes(body.frequency) ? body.frequency : 'monthly',
      occurrenceMonth: Math.min(12, Math.max(1, Math.trunc(Number(body.occurrenceMonth || 1)))),
      order: nextOrder
    }
    draft.recurringCashflowItems ||= []
    draft.recurringCashflowItems.push(item)
    return item
  })

  const updateRecurringCashflowItem = (id, body) => mutate((draft) => {
    const item = draft.recurringCashflowItems?.find((entry) => entry.id === id)
    if (!item) throw new Error('找不到這筆週期收支項目。')
    const name = String(body.name ?? item.name).trim()
    const amount = Number(body.amount ?? item.amount)
    if (!name) throw new Error('請填寫週期收支項目名稱。')
    if (!(amount > 0)) throw new Error('週期收支金額必須大於 0。')
    const type = body.type === 'expense' ? 'expense' : body.type === 'income' ? 'income' : item.type
    const order = type === item.type
      ? item.order
      : draft.recurringCashflowItems
          .filter((entry) => entry.id !== id && entry.type === type)
          .reduce((highest, entry) => Math.max(highest, Number(entry.order ?? -1)), -1) + 1
    Object.assign(item, {
      name,
      amount,
      type,
      frequency: ['monthly', 'quarterly', 'semiannual', 'annual'].includes(body.frequency) ? body.frequency : item.frequency,
      occurrenceMonth: Math.min(12, Math.max(1, Math.trunc(Number(body.occurrenceMonth || item.occurrenceMonth || 1)))),
      order
    })
    return item
  })

  const deleteRecurringCashflowItem = (id) => mutate((draft) => {
    const index = draft.recurringCashflowItems?.findIndex((entry) => entry.id === id) ?? -1
    if (index < 0) throw new Error('找不到要刪除的週期收支項目。')
    const [item] = draft.recurringCashflowItems.splice(index, 1)
    return item
  })

  const swapRecurringCashflowItems = (id, targetId) => mutate((draft) => {
    const item = draft.recurringCashflowItems?.find((entry) => entry.id === id)
    const target = draft.recurringCashflowItems?.find((entry) => entry.id === targetId)
    if (!item || !target) throw new Error('找不到要排序的週期收支項目。')
    if (item.type !== target.type) throw new Error('固定收入與固定支出必須分開排序。')
    const currentOrder = item.order
    item.order = target.order
    target.order = currentOrder
    return item
  })

  const deleteGroup = (id) => mutate((draft) => {
    if (id === SYSTEM_CASH_GROUP_ID) throw new Error('「現金」是現金驗算使用的系統群組，不能刪除。')
    const index = draft.groups.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('找不到要刪除的群組。')
    const itemIds = draft.items.filter((item) => item.groupId === id).map((item) => item.id)
    draft.groups.splice(index, 1)
    draft.items = draft.items.filter((item) => item.groupId !== id)
    for (const itemId of itemIds) delete draft.cashDrafts?.[itemId]
    return { removedItems: itemIds.length }
  })

  const updateCashDraft = (accountId, body) => mutate((draft) => {
    draft.cashDrafts ||= {}
    draft.cashDrafts[accountId] = {
      expectedAmount: Number(body.expectedAmount ?? body.baseAmount ?? 0),
      rows: (body.rows || []).map((row) => ({
        label: String(row.label || ''),
        operation: row.operation === 'subtract' ? 'subtract' : 'add',
        amount: Number(row.amount || 0)
      }))
    }
    return draft.cashDrafts[accountId]
  })

  async function marketPreview() {
    return run(async () => {
      const result = await fetchMarketPreview(activeHoldings.value.map((holding) => holding.ticker))
      const previous = cloneConfig(config.value)
      for (const holding of activeHoldings.value) {
        if (result.prices[holding.ticker] != null) {
          holding.price = result.prices[holding.ticker]
          holding.priceSource = 'auto'
          holding.priceAsOfDate = result.priceDates?.[holding.ticker] || null
          holding.priceSourceLabel = result.priceSources?.[holding.ticker] || '自動價格'
          holding.yahooUrl = result.yahooUrls?.[holding.ticker] || holding.yahooUrl || null
        }
      }
      try {
        applyPersistResult(await persistLocalData(config.value, { createBackup: false }))
      } catch (persistError) {
        config.value = previous
        throw persistError
      }
      return result
    })
  }

  const lookupHolding = (ticker) => lookupMarketInstrument(ticker)

  async function refreshExchangeRates(force = false) {
    const market = config.value.market || {}
    const hasRates = Number(market.fxRates?.USD) > 0 && Number(market.fxRates?.JPY) > 0
    const nextUpdate = market.fxNextUpdateAt ? new Date(market.fxNextUpdateAt).getTime() : 0
    if (!force && hasRates && nextUpdate > Date.now()) {
      return { rates: market.fxRates, updatedAt: market.fxUpdatedAt, nextUpdateAt: market.fxNextUpdateAt, source: market.fxSource, cached: true }
    }
    return run(async () => {
      const result = await fetchTwdExchangeRates()
      const previous = cloneConfig(config.value)
      Object.assign(config.value.market, {
        fxRates: result.rates,
        fxUpdatedAt: result.updatedAt,
        fxNextUpdateAt: result.nextUpdateAt,
        fxSource: result.source
      })
      for (const item of config.value.items) {
        if (item.behavior === 'foreign' && Number(result.rates[item.currency]) > 0) {
          item.assetClass = 'foreign'
          item.exchangeRate = result.rates[item.currency]
        }
      }
      try {
        applyPersistResult(await persistLocalData(config.value, { createBackup: false }))
      } catch (persistError) {
        config.value = previous
        throw persistError
      }
      return result
    })
  }

  const saveSnapshot = (snapshot) => mutate((draft) => {
    draft.snapshots = upsertSnapshot(draft.snapshots, snapshot)
    draft.market.taiex = snapshot.taiex
    draft.market.ma240 = snapshot.ma240
    draft.market.lastUpdatedAt = snapshot.verifiedAt
    return snapshot
  })

  const deleteSnapshot = (date) => mutate((draft) => {
    const index = draft.snapshots.findIndex((entry) => entry.date === date)
    if (index < 0) throw new Error('找不到要刪除的盤點紀錄。')
    const [snapshot] = draft.snapshots.splice(index, 1)
    const latest = draft.snapshots.at(-1)
    draft.market.taiex = latest?.taiex ?? null
    draft.market.ma240 = latest?.ma240 ?? null
    draft.market.lastUpdatedAt = latest?.verifiedAt ?? null
    return snapshot
  })

  const saveJson = () => run(async () => {
    const result = await saveJsonBackup(config.value)
    applyStorageResult(result)
    return result.backupStatus
  })
  const previewJsonImport = (file) => run(() => inspectJsonImport(file, config.value))
  const importJson = (file) => run(async () => { applyPersistResult(await importJsonFile(file)) })
  const getBackups = () => run(() => listLocalBackups())
  const restoreBackup = (createdAt) => run(async () => applyStorageResult(await restoreLocalBackup(createdAt)))
  const resetAllData = () => run(async () => applyStorageResult(await resetLocalData()))
  const exportExcel = () => run(() => exportSnapshotsToExcel(snapshots.value))

  return {
    config, summary, cashflowPlan, snapshots, loading, saving, error, storageStatus,
    activeItems, activeHoldings, recurringCashflowItems, lastSnapshot,
    load, addGroup, updateGroup, deleteGroup, addItem, updateItem, deleteItem, addHolding, updateHolding, deleteHolding, moveHolding,
    updateSettings, updateCashDraft, addRecurringCashflowItem, updateRecurringCashflowItem, deleteRecurringCashflowItem, swapRecurringCashflowItems,
    lookupHolding, marketPreview, refreshExchangeRates, saveSnapshot, deleteSnapshot,
    saveJson, previewJsonImport, importJson,
    getBackups, restoreBackup, resetAllData,
    exportExcel
  }
})
