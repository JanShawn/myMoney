import { createDefaultConfig, normalizeConfig } from './money-domain'

const DB_NAME = 'mymoney-local'
const STORE_NAME = 'key-value'
const CACHE_KEY = 'current-data'
const LEGACY_HANDLE_KEY = 'json-file-handle'
const LEGACY_FILE_META_KEY = 'json-file-meta'
const JSON_BACKUP_META_KEY = 'json-backup-meta'
const JSON_BACKUP_DATA_KEY = 'json-backup-data'
const BACKUPS_KEY = 'json-backups'
const BACKUP_LIMIT = 3

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
      ['currency'], ['assetClass'], ['assetClassDetail'], ['liquidity'], ['includeInAssets'], ['archived'], ['groupId'], ['behavior']
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
    // 自動行情仍會寫入目前資料與手動 JSON 備份，但不視為使用者資料異動。
    if (holding.priceSource !== 'auto' && Number(previous.price || 0) !== Number(holding.price || 0)) details.push(`價格 ${formatChangedNumber(previous.price)} → ${formatChangedNumber(holding.price)}`)
    const otherFields = changedFields(previous, holding, [
      ['assetClass'], ['assetClassDetail'], ['direction'], ['multiplier'], ['liquidity'], ['includeInAssets'], ['archived'], ['accountId'], ['order']
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
  const time = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
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

async function addBackup(data) {
  if (!data) return
  const backups = (await dbGet(BACKUPS_KEY)) || []
  backups.push({ createdAt: new Date().toISOString(), data })
  await dbSet(BACKUPS_KEY, backups.slice(-BACKUP_LIMIT))
}

function backupFileName(date = new Date()) {
  return `myMoney-backup-${fileTimestamp(date)}.json`
}

function validateJsonConfig(parsed, fileName = 'JSON') {
  const isObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  const hasKnownData = isObject && (
    'version' in parsed || 'settings' in parsed || Array.isArray(parsed.groups)
    || Array.isArray(parsed.items) || Array.isArray(parsed.holdings) || Array.isArray(parsed.snapshots)
  )
  if (!hasKnownData) throw new Error(`「${fileName}」不是 myMoney 完整備份，未找到帳戶、持倉或設定資料。`)
  return normalizeConfig(parsed)
}

async function parseJsonFile(file) {
  let parsed
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error(`無法讀取「${file.name}」：檔案不是有效的 JSON 格式。`)
  }
  return validateJsonConfig(parsed, file.name)
}

async function getBackupStatus(currentInput) {
  const current = toPlainConfig(currentInput)
  let meta = await dbGet(JSON_BACKUP_META_KEY)
  const backupData = await dbGet(JSON_BACKUP_DATA_KEY)

  if (!meta) {
    const legacyMeta = await dbGet(LEGACY_FILE_META_KEY)
    if (legacyMeta) {
      meta = {
        fileName: legacyMeta.fileName,
        createdAt: legacyMeta.lastSyncedAt,
        fingerprint: legacyMeta.fingerprint,
        summary: legacyMeta.summary,
        migrated: true
      }
      await dbSet(JSON_BACKUP_META_KEY, meta)
    }
  }

  if (!meta) return { exists: false, isCurrent: false, fileName: '', createdAt: null, changes: [], summary: null }

  const changes = backupData ? summarizeConfigChanges(backupData, current) : []
  const isCurrent = backupData
    ? changes.length === 0
    : Boolean(meta.fingerprint) && meta.fingerprint === configFingerprint(current)
  return {
    exists: true,
    isCurrent,
    fileName: meta.fileName || '',
    createdAt: meta.createdAt || null,
    changes,
    summary: meta.summary || null,
    comparisonAvailable: Boolean(backupData)
  }
}

async function recordJsonBackup(data, fileName, createdAt = new Date().toISOString()) {
  const normalized = toPlainConfig(data)
  const meta = {
    fileName,
    createdAt,
    fingerprint: configFingerprint(normalized),
    summary: configSummary(normalized)
  }
  await dbSet(JSON_BACKUP_DATA_KEY, normalized)
  await dbSet(JSON_BACKUP_META_KEY, meta)
  return getBackupStatus(normalized)
}

export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

export async function loadLocalData() {
  const cached = await dbGet(CACHE_KEY)
  const data = normalizeConfig(cached)
  // 舊版可能保留檔案控制代碼；新流程不再長期連結檔案，僅保留最近備份資訊。
  await dbDelete(LEGACY_HANDLE_KEY)
  return { data, backupStatus: await getBackupStatus(data) }
}

export async function persistLocalData(input, options = {}) {
  const data = toPlainConfig(input)
  const previous = await dbGet(CACHE_KEY)
  if (options.createBackup !== false && summarizeConfigChanges(previous, data).length) await addBackup(previous)
  await dbSet(CACHE_KEY, data)
  return { data, backupStatus: await getBackupStatus(data) }
}

export async function saveJsonBackup(input) {
  const data = toPlainConfig(input)
  const createdAt = new Date().toISOString()
  let fileName = backupFileName(new Date(createdAt))

  try {
    if (supportsFileSystemAccess()) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'myMoney JSON 備份', accept: { 'application/json': ['.json'] } }]
      })
      const writable = await handle.createWritable()
      await writable.write(`${JSON.stringify(data, null, 2)}\n`)
      await writable.close()
      fileName = handle.name
    } else {
      const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error(`JSON 備份沒有儲存成功：${error?.message || 'Windows 無法寫入所選位置'}。瀏覽器中的資料仍已正常保存。`)
  }

  return { data, backupStatus: await recordJsonBackup(data, fileName, createdAt) }
}

export async function inspectJsonImport(file, currentInput) {
  const data = await parseJsonFile(file)
  return {
    fileName: file.name,
    data,
    summary: configSummary(data),
    changes: summarizeConfigChanges(currentInput, data),
    hasUserData: hasUserData(data)
  }
}

export async function listLocalBackups() {
  const storedBackups = (await dbGet(BACKUPS_KEY)) || []
  const backups = storedBackups.slice(-BACKUP_LIMIT)
  if (storedBackups.length > BACKUP_LIMIT) await dbSet(BACKUPS_KEY, backups)
  const current = await dbGet(CACHE_KEY)
  const jsonBackup = await dbGet(JSON_BACKUP_DATA_KEY)
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
      matchesJsonBackup: Boolean(jsonBackup) && summarizeConfigChanges(entry.data, jsonBackup).length === 0,
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
  await dbSet(CACHE_KEY, data)
  return { data, backupStatus: await getBackupStatus(data) }
}

export function createResetConfig(date = new Date()) {
  const data = createDefaultConfig()
  data.settings.lastSavedAt = date.toISOString()
  return data
}

export async function resetLocalData() {
  const current = await dbGet(CACHE_KEY)
  if (current) await addBackup(current)

  const data = createResetConfig()
  await dbSet(CACHE_KEY, data)

  return { data, backupStatus: await getBackupStatus(data) }
}

export async function importJsonFile(file) {
  const data = await parseJsonFile(file)
  const current = await dbGet(CACHE_KEY)
  if (current && summarizeConfigChanges(current, data).length) await addBackup(current)
  await dbSet(CACHE_KEY, data)
  const createdAt = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
  return { data, backupStatus: await recordJsonBackup(data, file.name, createdAt) }
}
