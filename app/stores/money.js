import { defineStore } from 'pinia'
import { calculateSummary, createDefaultConfig, normalizeConfig, upsertSnapshot } from '~/services/money-domain'
import {
  connectExistingJson, createJsonFile, disconnectJson, downloadJson, importJsonFile,
  loadLocalData, persistLocalData, reloadConnectedJson, supportsFileSystemAccess
} from '~/services/local-json-storage'
import { fetchMarketPreview } from '~/services/market-service'
import { exportSnapshotsToExcel, importSnapshotsFromExcel } from '~/services/excel-transfer'

export const useMoneyStore = defineStore('money', () => {
  const config = ref(createDefaultConfig())
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const storageStatus = reactive({
    mode: 'indexeddb',
    fileName: '',
    permission: 'none',
    supportsFileSystemAccess: false
  })

  const summary = computed(() => calculateSummary(config.value))
  const snapshots = computed(() => config.value.snapshots || [])
  const activeItems = computed(() => config.value.items.filter((item) => !item.archived))
  const activeHoldings = computed(() => config.value.holdings.filter((item) => !item.archived))
  const lastSnapshot = computed(() => snapshots.value.at(-1) || null)

  function applyStorageResult(result) {
    config.value = normalizeConfig(result.data)
    storageStatus.mode = result.mode
    storageStatus.fileName = result.fileName || ''
    storageStatus.permission = result.permission || 'none'
  }

  async function run(action) {
    saving.value = true
    error.value = ''
    try {
      return await action()
    } catch (actionError) {
      error.value = actionError?.message || '操作失敗'
      throw actionError
    } finally {
      saving.value = false
    }
  }

  async function load() {
    loading.value = true
    error.value = ''
    storageStatus.supportsFileSystemAccess = supportsFileSystemAccess()
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
      const previous = structuredClone(config.value)
      const result = mutator(config.value)
      config.value.settings.lastSavedAt = new Date().toISOString()
      try {
        config.value = await persistLocalData(config.value)
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
    Object.assign(item, body)
    return item
  })

  const addHolding = (body) => mutate((draft) => {
    const holding = { id: crypto.randomUUID(), ...body, ticker: body.ticker.toUpperCase(), archived: false }
    draft.holdings.push(holding)
    return holding
  })

  const updateHolding = (id, body) => mutate((draft) => {
    const holding = draft.holdings.find((entry) => entry.id === id)
    if (!holding) throw new Error('找不到這筆持倉')
    Object.assign(holding, body)
    return holding
  })

  const updateSettings = (body) => mutate((draft) => {
    Object.assign(draft.settings, body)
    return draft.settings
  })

  async function marketPreview() {
    return run(async () => {
      const result = await fetchMarketPreview(activeHoldings.value.map((holding) => holding.ticker))
      const previous = structuredClone(config.value)
      for (const holding of activeHoldings.value) {
        if (result.prices[holding.ticker] != null) {
          holding.price = result.prices[holding.ticker]
          holding.priceSource = 'auto'
        }
      }
      try {
        config.value = await persistLocalData(config.value)
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

  const connectJson = () => run(async () => applyStorageResult(await connectExistingJson()))
  const createJson = () => run(async () => applyStorageResult(await createJsonFile(config.value)))
  const reloadJson = (requestPermission = true) => run(async () => applyStorageResult(await reloadConnectedJson(requestPermission)))
  const disconnectFile = () => run(async () => {
    await disconnectJson()
    storageStatus.mode = 'indexeddb'
    storageStatus.fileName = ''
    storageStatus.permission = 'none'
  })
  const importJson = (file) => run(async () => { config.value = await importJsonFile(file) })
  const exportJson = () => downloadJson(config.value)
  const exportExcel = () => run(() => exportSnapshotsToExcel(snapshots.value))
  const importExcel = (file) => run(async () => {
    const imported = await importSnapshotsFromExcel(file)
    await mutate((draft) => {
      draft.snapshots = imported.reduce((result, snapshot) => upsertSnapshot(result, snapshot), draft.snapshots)
    })
    return imported.length
  })

  return {
    config, summary, snapshots, loading, saving, error, storageStatus,
    activeItems, activeHoldings, lastSnapshot,
    load, addGroup, updateGroup, addItem, updateItem, addHolding, updateHolding,
    updateSettings, marketPreview, saveSnapshot,
    connectJson, createJson, reloadJson, disconnectFile, importJson, exportJson,
    importExcel, exportExcel
  }
})
