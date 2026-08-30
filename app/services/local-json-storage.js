import { normalizeConfig } from './money-domain'

const DB_NAME = 'mymoney-local'
const STORE_NAME = 'key-value'
const CACHE_KEY = 'current-data'
const HANDLE_KEY = 'json-file-handle'
const FILE_META_KEY = 'json-file-meta'
const BACKUPS_KEY = 'json-backups'
const BACKUP_LIMIT = 3

let activeHandle = null
let lastKnownModified = null
let pendingConnection = null

function toPlainConfig(input) {
  return normalizeConfig(JSON.parse(JSON.stringify(input ?? null)))
}

function hasUserData(input) {
  const data = toPlainConfig(input)
  const cashDrafts = Object.values(data.cashDrafts || {})
  return data.items.some((item) => !item.system)
    || data.recurringCashflowItems.length > 0
    || data.holdings.length > 0
    || data.snapshots.length > 0
    || data.items.some((item) => item.system && Number(item.amount) !== 0)
    || cashDrafts.some((draft) => Number(draft.expectedAmount) !== 0 || draft.rows?.some((row) => row.label || Number(row.amount) !== 0))
}

function configSummary(input) {
  const data = toPlainConfig(input)
  return {
    lastSavedAt: data.settings?.lastSavedAt || null,
    accounts: data.items.filter((item) => !item.archived).length,
    holdings: data.holdings.filter((item) => !item.archived).length,
    snapshots: data.snapshots.length,
    recurringCashflowItems: data.recurringCashflowItems.length
  }
}

function configFingerprint(input) {
  const text = JSON.stringify(toPlainConfig(input))
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function summaryDelta(summary, reference) {
  if (!reference) return null
  return {
    accounts: summary.accounts - Number(reference.accounts || 0),
    holdings: summary.holdings - Number(reference.holdings || 0),
    snapshots: summary.snapshots - Number(reference.snapshots || 0),
    recurringCashflowItems: summary.recurringCashflowItems - Number(reference.recurringCashflowItems || 0)
  }
}

function recordsById(records = []) {
  return new Map(records.map((record) => [record.id, record]))
}

function formatChangedNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number.toLocaleString('zh-TW', { maximumFractionDigits: 4 }) : String(value ?? '')
}

function holdingLabel(holding = {}) {
  return [holding.ticker, holding.name].filter(Boolean).join(' ') || '未命名持倉'
}

function changedFields(before, after, fields) {
  return fields.filter(([key]) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
}

export function summarizeConfigChanges(beforeInput, afterInput) {
  const before = toPlainConfig(beforeInput)
  const after = toPlainConfig(afterInput)
  const changes = []

  const beforeGroups = recordsById(before.groups)
  const afterGroups = recordsById(after.groups)
  for (const [id, group] of afterGroups) {
    if (!beforeGroups.has(id)) changes.push(`新增帳戶群組「${group.name}」`)
    else if (changedFields(beforeGroups.get(id), group, [['name'], ['archived'], ['order']]).length) changes.push(`調整帳戶群組「${group.name}」`)
  }
  for (const [id, group] of beforeGroups) {
    if (!afterGroups.has(id)) changes.push(`移除帳戶群組「${group.name}」`)
  }

  const beforeItems = recordsById(before.items)
  const afterItems = recordsById(after.items)
  for (const [id, item] of afterItems) {
    const previous = beforeItems.get(id)
    if (!previous) {
      changes.push(`新增帳戶「${item.name}」`)
      continue
    }
    const details = []
    if (previous.name !== item.name) details.push(`名稱「${previous.name}」→「${item.name}」`)
    if (Number(previous.amount || 0) !== Number(item.amount || 0)) details.push(`金額 ${formatChangedNumber(previous.amount)} → ${formatChangedNumber(item.amount)} ${item.currency || 'TWD'}`)
    const otherFields = changedFields(previous, item, [
      ['currency'], ['assetClass'], ['liquidity'], ['includeInAssets'], ['archived'], ['groupId'], ['behavior']
    ])
    if (otherFields.length) details.push('帳戶分類或設定')
    if (details.length) changes.push(`帳戶「${item.name}」：${details.join('、')}`)
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) changes.push(`移除帳戶「${item.name}」`)
  }

  const beforeHoldings = recordsById(before.holdings)
  const afterHoldings = recordsById(after.holdings)
  for (const [id, holding] of afterHoldings) {
    const previous = beforeHoldings.get(id)
    if (!previous) {
      changes.push(`新增持倉「${holdingLabel(holding)}」`)
      continue
    }
    const details = []
    if (previous.ticker !== holding.ticker || previous.name !== holding.name) details.push(`名稱或代號改為「${holdingLabel(holding)}」`)
    if (Number(previous.quantity || 0) !== Number(holding.quantity || 0)) details.push(`股數 ${formatChangedNumber(previous.quantity)} → ${formatChangedNumber(holding.quantity)}`)
    // 自動行情仍會寫入目前資料與 data.json，但不視為使用者資料異動。
    if (holding.priceSource !== 'auto' && Number(previous.price || 0) !== Number(holding.price || 0)) details.push(`價格 ${formatChangedNumber(previous.price)} → ${formatChangedNumber(holding.price)}`)
    const otherFields = changedFields(previous, holding, [
      ['assetClass'], ['direction'], ['multiplier'], ['includeInAssets'], ['archived'], ['accountId'], ['order']
    ])
    if (otherFields.length) details.push('持倉分類、排序或設定')
    if (details.length) changes.push(`持倉「${holdingLabel(holding)}」：${details.join('、')}`)
  }
  for (const [id, holding] of beforeHoldings) {
    if (!afterHoldings.has(id)) changes.push(`移除持倉「${holdingLabel(holding)}」`)
  }

  const beforeSnapshots = new Map(before.snapshots.map((snapshot) => [snapshot.date, snapshot]))
  const afterSnapshots = new Map(after.snapshots.map((snapshot) => [snapshot.date, snapshot]))
  for (const [date, snapshot] of afterSnapshots) {
    if (!beforeSnapshots.has(date)) changes.push(`新增 ${date} 資產盤點`)
    else if (JSON.stringify(beforeSnapshots.get(date)) !== JSON.stringify(snapshot)) changes.push(`更新 ${date} 資產盤點`)
  }
  for (const date of beforeSnapshots.keys()) {
    if (!afterSnapshots.has(date)) changes.push(`刪除 ${date} 資產盤點`)
  }

  const draftIds = new Set([...Object.keys(before.cashDrafts || {}), ...Object.keys(after.cashDrafts || {})])
  for (const id of draftIds) {
    if (JSON.stringify(before.cashDrafts?.[id] ?? null) !== JSON.stringify(after.cashDrafts?.[id] ?? null)) {
      const account = afterItems.get(id) || beforeItems.get(id)
      changes.push(`更新現金驗算「${account?.name || '現金帳戶'}」`)
    }
  }

  const beforeRecurring = recordsById(before.recurringCashflowItems)
  const afterRecurring = recordsById(after.recurringCashflowItems)
  const frequencyLabels = { monthly: '每月', quarterly: '每季', semiannual: '每半年', annual: '每年' }
  for (const [id, item] of afterRecurring) {
    const previous = beforeRecurring.get(id)
    if (!previous) {
      changes.push(`新增週期收支「${item.name}」`)
      continue
    }
    const details = []
    if (previous.name !== item.name) details.push(`名稱「${previous.name}」→「${item.name}」`)
    if (previous.type !== item.type) details.push(`類型改為${item.type === 'expense' ? '固定支出' : '固定收入'}`)
    if (Number(previous.amount || 0) !== Number(item.amount || 0)) details.push(`金額 ${formatChangedNumber(previous.amount)} → ${formatChangedNumber(item.amount)} TWD`)
    if (previous.frequency !== item.frequency) details.push(`週期改為${frequencyLabels[item.frequency] || '每月'}`)
    if (Number(previous.occurrenceMonth || 1) !== Number(item.occurrenceMonth || 1)) details.push(`發生月份改為 ${item.occurrenceMonth} 月`)
    if (Number(previous.order || 0) !== Number(item.order || 0)) details.push('調整顯示順序')
    if (details.length) changes.push(`週期收支「${item.name}」：${details.join('、')}`)
  }
  for (const [id, item] of beforeRecurring) {
    if (!afterRecurring.has(id)) changes.push(`刪除週期收支「${item.name}」`)
  }

  // market 與自動匯率屬於可重新取得的資料，不占用近期備份的異動摘要。
  const beforeSettings = { ...before.settings }
  const afterSettings = { ...after.settings }
  delete beforeSettings.lastSavedAt
  delete beforeSettings.dataFileCreatedAt
  delete afterSettings.lastSavedAt
  delete afterSettings.dataFileCreatedAt
  if (JSON.stringify(beforeSettings) !== JSON.stringify(afterSettings)) changes.push('調整系統或資產配置設定')

  return changes
}

function fileTimestamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ]
  const time = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
  return `${parts.join('-')}-${time}`
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function dbGet(key) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())
}

async function dbSet(key, value) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(value, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }).finally(() => db.close())
}

async function dbDelete(key) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }).finally(() => db.close())
}

async function readHandle(handle) {
  const file = await handle.getFile()
  const text = await file.text()
  const data = normalizeConfig(JSON.parse(text))
  lastKnownModified = file.lastModified
  return data
}

async function getPermission(handle, request = false) {
  const options = { mode: 'readwrite' }
  if ((await handle.queryPermission(options)) === 'granted') return true
  if (request && (await handle.requestPermission(options)) === 'granted') return true
  return false
}

async function addBackup(data) {
  if (!data) return
  const backups = (await dbGet(BACKUPS_KEY)) || []
  backups.push({ createdAt: new Date().toISOString(), data })
  await dbSet(BACKUPS_KEY, backups.slice(-BACKUP_LIMIT))
}

async function saveFileMeta(handle, data, lastSyncedAt = new Date().toISOString()) {
  await dbSet(FILE_META_KEY, {
    fileName: handle.name,
    lastSyncedAt,
    fingerprint: configFingerprint(data),
    summary: configSummary(data)
  })
}

export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window
}

export async function loadLocalData() {
  const cached = await dbGet(CACHE_KEY)
  const handle = supportsFileSystemAccess() ? await dbGet(HANDLE_KEY) : null
  const fileMeta = await dbGet(FILE_META_KEY)
  if (handle) {
    activeHandle = handle
    if (await getPermission(handle)) {
      const data = await readHandle(handle)
      await dbSet(CACHE_KEY, data)
      await saveFileMeta(handle, data)
      return { data, mode: 'file', fileName: handle.name, permission: 'granted' }
    }
    activeHandle = null
    return { data: normalizeConfig(cached), mode: 'indexeddb', fileName: handle.name, permission: 'prompt' }
  }
  return { data: normalizeConfig(cached), mode: 'indexeddb', fileName: fileMeta?.fileName || '', permission: fileMeta ? 'missing' : 'none' }
}

export async function connectExistingJson(currentInput) {
  if (!supportsFileSystemAccess()) throw new Error('此瀏覽器不支援直接連結本機檔案')
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: 'myMoney JSON', accept: { 'application/json': ['.json'] } }]
  })
  if (!(await getPermission(handle, true))) throw new Error('未取得 data.json 的寫入權限')
  const data = await readHandle(handle)
  const fileModified = lastKnownModified
  const current = toPlainConfig(currentInput)
  const differs = JSON.stringify(current) !== JSON.stringify(data)
  if (differs && hasUserData(current)) {
    activeHandle = null
    lastKnownModified = null
    await dbDelete(HANDLE_KEY)
    pendingConnection = { handle, current, fileData: data, fileModified }
    await addBackup(current)
    return {
      data: current,
      mode: 'indexeddb',
      fileName: '',
      permission: 'none',
      conflict: {
        fileName: handle.name,
        browser: configSummary(current),
        file: configSummary(data),
        fileIsEmpty: !hasUserData(data)
      }
    }
  }
  activeHandle = handle
  pendingConnection = null
  await dbSet(HANDLE_KEY, handle)
  await dbSet(CACHE_KEY, data)
  await saveFileMeta(handle, data)
  return { data, mode: 'file', fileName: handle.name, permission: 'granted' }
}

export async function resolveJsonConnection(strategy) {
  if (!pendingConnection) throw new Error('沒有等待確認的 data.json 連結')
  const { handle, current, fileData, fileModified } = pendingConnection
  activeHandle = handle
  lastKnownModified = fileModified
  await dbSet(HANDLE_KEY, handle)
  let data
  if (strategy === 'keep-browser') {
    data = current
    await writeConnectedFile(data, false)
  } else if (strategy === 'load-file') {
    data = fileData
  } else {
    throw new Error('未知的 data.json 連結方式')
  }
  await dbSet(CACHE_KEY, data)
  await saveFileMeta(handle, data)
  pendingConnection = null
  return { data, mode: 'file', fileName: handle.name, permission: 'granted' }
}

export function cancelJsonConnection() {
  pendingConnection = null
}

export async function createJsonFile(data) {
  if (!supportsFileSystemAccess()) throw new Error('此瀏覽器不支援直接建立本機檔案')
  const handle = await window.showSaveFilePicker({
    suggestedName: `myMoney-data-${fileTimestamp()}.json`,
    types: [{ description: 'myMoney JSON', accept: { 'application/json': ['.json'] } }]
  })
  activeHandle = handle
  lastKnownModified = null
  const normalized = toPlainConfig(data)
  normalized.settings.lastSavedAt = new Date().toISOString()
  normalized.settings.dataFileCreatedAt = normalized.settings.lastSavedAt
  await dbSet(HANDLE_KEY, handle)
  await writeConnectedFile(normalized, false)
  await dbSet(CACHE_KEY, normalized)
  await saveFileMeta(handle, normalized, normalized.settings.lastSavedAt)
  return { data: normalized, mode: 'file', fileName: handle.name, permission: 'granted' }
}

async function writeConnectedFile(data, detectConflict = true) {
  if (!activeHandle) return
  if (!(await getPermission(activeHandle))) {
    const error = new Error('本機 JSON 權限已失效，請在設定頁重新授權')
    error.code = 'FILE_PERMISSION_REQUIRED'
    throw error
  }
  const currentFile = await activeHandle.getFile()
  if (detectConflict && lastKnownModified && currentFile.lastModified !== lastKnownModified) {
    const error = new Error('data.json 已在程式外被修改，請先重新載入')
    error.code = 'FILE_CHANGED'
    throw error
  }
  const writable = await activeHandle.createWritable()
  await writable.write(`${JSON.stringify(data, null, 2)}\n`)
  await writable.close()
  lastKnownModified = (await activeHandle.getFile()).lastModified
}

export async function persistLocalData(input, options = {}) {
  // IndexedDB 的 structured clone 無法保存 Vue Proxy；先轉成純 JSON 資料。
  const data = toPlainConfig(input)
  const previous = await dbGet(CACHE_KEY)
  if (activeHandle) {
    try {
      await writeConnectedFile(data)
    } catch (error) {
      if (error?.code !== 'FILE_PERMISSION_REQUIRED') throw error
      activeHandle = null
      lastKnownModified = null
      if (options.createBackup !== false) await addBackup(previous)
      await dbSet(CACHE_KEY, data)
      return { data, fileSyncPaused: true }
    }
    try {
      if (options.createBackup !== false) await addBackup(previous)
      await dbSet(CACHE_KEY, data)
      await saveFileMeta(activeHandle, data, data.settings?.lastSavedAt || new Date().toISOString())
    } catch {
      // 本機 JSON 已成功寫入時，不因 IndexedDB 備援失敗而回報整次保存失敗。
    }
  } else {
    if (options.createBackup !== false) await addBackup(previous)
    await dbSet(CACHE_KEY, data)
  }
  return { data, fileSyncPaused: false }
}

export async function reloadConnectedJson(requestPermission = false) {
  if (!activeHandle) activeHandle = await dbGet(HANDLE_KEY)
  if (!activeHandle) throw new Error('尚未連結本機 data.json')
  if (!(await getPermission(activeHandle, requestPermission))) throw new Error('需要重新授權 data.json')
  const data = await readHandle(activeHandle)
  await dbSet(CACHE_KEY, data)
  await saveFileMeta(activeHandle, data)
  return { data, mode: 'file', fileName: activeHandle.name, permission: 'granted' }
}

export async function disconnectJson() {
  activeHandle = null
  lastKnownModified = null
  pendingConnection = null
  await dbDelete(HANDLE_KEY)
  await dbDelete(FILE_META_KEY)
}

export async function inspectConnectedJson(currentInput, requestPermission = false) {
  if (!activeHandle) activeHandle = await dbGet(HANDLE_KEY)
  if (!activeHandle) throw new Error('尚未連結本機 data.json')
  if (!(await getPermission(activeHandle, requestPermission))) throw new Error('需要重新授權 data.json')
  const file = await activeHandle.getFile()
  const fileData = normalizeConfig(JSON.parse(await file.text()))
  const current = toPlainConfig(currentInput)
  const handle = activeHandle
  const matches = JSON.stringify(current) === JSON.stringify(fileData)
  if (!matches) {
    pendingConnection = { handle, current, fileData, fileModified: file.lastModified }
    activeHandle = null
    lastKnownModified = null
    await dbDelete(HANDLE_KEY)
    await addBackup(current)
  }
  return {
    matches,
    fileName: handle.name,
    fileModifiedAt: new Date(file.lastModified).toISOString(),
    browser: configSummary(current),
    file: configSummary(fileData),
    fileIsEmpty: !hasUserData(fileData)
  }
}

export async function listLocalBackups() {
  const storedBackups = (await dbGet(BACKUPS_KEY)) || []
  const backups = storedBackups.slice(-BACKUP_LIMIT)
  if (storedBackups.length > BACKUP_LIMIT) await dbSet(BACKUPS_KEY, backups)
  const current = await dbGet(CACHE_KEY)
  const fileMeta = await dbGet(FILE_META_KEY)
  const currentFingerprint = current ? configFingerprint(current) : null
  return backups.map((entry, index) => {
    const summary = configSummary(entry.data)
    const fingerprint = configFingerprint(entry.data)
    const sizeBytes = new TextEncoder().encode(JSON.stringify(entry.data)).byteLength
    const nextVersion = backups[index + 1]?.data || current
    return {
      createdAt: entry.createdAt,
      sizeBytes,
      ...summary,
      matchesCurrent: fingerprint === currentFingerprint,
      matchesSyncedFile: Boolean(fileMeta?.fingerprint) && fingerprint === fileMeta.fingerprint,
      syncedFileName: fileMeta?.fileName || '',
      lastFileSyncedAt: fileMeta?.lastSyncedAt || null,
      syncedSummary: fileMeta?.summary || null,
      syncDelta: summaryDelta(summary, fileMeta?.summary),
      changes: nextVersion ? summarizeConfigChanges(entry.data, nextVersion) : []
    }
  }).reverse()
}

export async function restoreLocalBackup(createdAt) {
  const backups = (await dbGet(BACKUPS_KEY)) || []
  const selected = [...backups].reverse().find((entry) => entry.createdAt === createdAt)
  if (!selected) throw new Error('找不到這份瀏覽器備份，可能已超過最近 3 份的保留範圍')
  const current = await dbGet(CACHE_KEY)
  await addBackup(current)
  const data = toPlainConfig(selected.data)
  if (activeHandle) {
    await writeConnectedFile(data)
    await saveFileMeta(activeHandle, data, data.settings?.lastSavedAt || new Date().toISOString())
  }
  await dbSet(CACHE_KEY, data)
  return {
    data,
    mode: activeHandle ? 'file' : 'indexeddb',
    fileName: activeHandle?.name || '',
    permission: activeHandle ? 'granted' : 'none'
  }
}

export async function importJsonFile(file) {
  const data = normalizeConfig(JSON.parse(await file.text()))
  return persistLocalData(data)
}

export function downloadJson(data) {
  const blob = new Blob([`${JSON.stringify(toPlainConfig(data), null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `myMoney-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
