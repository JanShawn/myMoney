import { normalizeConfig } from './money-domain'

const DB_NAME = 'mymoney-local'
const STORE_NAME = 'key-value'
const CACHE_KEY = 'current-data'
const HANDLE_KEY = 'json-file-handle'
const BACKUPS_KEY = 'json-backups'

let activeHandle = null
let lastKnownModified = null

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
  await dbSet(BACKUPS_KEY, backups.slice(-10))
}

export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window
}

export async function loadLocalData() {
  const cached = await dbGet(CACHE_KEY)
  const handle = supportsFileSystemAccess() ? await dbGet(HANDLE_KEY) : null
  if (handle) {
    activeHandle = handle
    if (await getPermission(handle)) {
      const data = await readHandle(handle)
      await dbSet(CACHE_KEY, data)
      return { data, mode: 'file', fileName: handle.name, permission: 'granted' }
    }
    activeHandle = null
    return { data: normalizeConfig(cached), mode: 'indexeddb', fileName: handle.name, permission: 'prompt' }
  }
  return { data: normalizeConfig(cached), mode: 'indexeddb', fileName: '', permission: 'none' }
}

export async function connectExistingJson() {
  if (!supportsFileSystemAccess()) throw new Error('此瀏覽器不支援直接連結本機檔案')
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: 'myMoney JSON', accept: { 'application/json': ['.json'] } }]
  })
  if (!(await getPermission(handle, true))) throw new Error('未取得 data.json 的寫入權限')
  const data = await readHandle(handle)
  activeHandle = handle
  await dbSet(HANDLE_KEY, handle)
  await dbSet(CACHE_KEY, data)
  return { data, mode: 'file', fileName: handle.name, permission: 'granted' }
}

export async function createJsonFile(data) {
  if (!supportsFileSystemAccess()) throw new Error('此瀏覽器不支援直接建立本機檔案')
  const handle = await window.showSaveFilePicker({
    suggestedName: 'myMoney-data.json',
    types: [{ description: 'myMoney JSON', accept: { 'application/json': ['.json'] } }]
  })
  activeHandle = handle
  lastKnownModified = null
  await dbSet(HANDLE_KEY, handle)
  await writeConnectedFile(normalizeConfig(data), false)
  await dbSet(CACHE_KEY, normalizeConfig(data))
  return { data: normalizeConfig(data), mode: 'file', fileName: handle.name, permission: 'granted' }
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

export async function persistLocalData(input) {
  const data = normalizeConfig(input)
  const previous = await dbGet(CACHE_KEY)
  if (activeHandle) {
    await writeConnectedFile(data)
    try {
      await addBackup(previous)
      await dbSet(CACHE_KEY, data)
    } catch {
      // 本機 JSON 已成功寫入時，不因 IndexedDB 備援失敗而回報整次保存失敗。
    }
  } else {
    await addBackup(previous)
    await dbSet(CACHE_KEY, data)
  }
  return data
}

export async function reloadConnectedJson(requestPermission = false) {
  if (!activeHandle) activeHandle = await dbGet(HANDLE_KEY)
  if (!activeHandle) throw new Error('尚未連結本機 data.json')
  if (!(await getPermission(activeHandle, requestPermission))) throw new Error('需要重新授權 data.json')
  const data = await readHandle(activeHandle)
  await dbSet(CACHE_KEY, data)
  return { data, mode: 'file', fileName: activeHandle.name, permission: 'granted' }
}

export async function disconnectJson() {
  activeHandle = null
  lastKnownModified = null
  await dbDelete(HANDLE_KEY)
}

export async function importJsonFile(file) {
  const data = normalizeConfig(JSON.parse(await file.text()))
  await persistLocalData(data)
  return data
}

export function downloadJson(data) {
  const blob = new Blob([`${JSON.stringify(normalizeConfig(data), null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `myMoney-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
