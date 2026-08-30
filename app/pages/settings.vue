<script setup>
import { Database, Download, FileJson, FileSpreadsheet, History, RefreshCw, RotateCcw, Save, Unplug, Upload } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const status = ref('')
const versionStatus = ref(null)
const jsonInput = ref(null)
const currentOrigin = ref('')
const backups = ref([])
const pendingRestoreAt = ref('')
const pendingStorageAction = ref('')
const backupTotalBytes = computed(() => backups.value.reduce((total, backup) => total + Number(backup.sizeBytes || 0), 0))
const storagePresentation = computed(() => {
  if (store.storageStatus.mode === 'file') return {
    badge: '雙重保存中',
    title: `自動同步：${store.storageStatus.fileName}`,
    description: '每次新增或編輯後，系統會自動更新 IndexedDB 與這個 data.json，不需要另外按同步。'
  }
  if (store.storageStatus.fileName) return {
    badge: 'JSON 已暫停',
    title: `等待重新連結：${store.storageStatus.fileName}`,
    description: '目前修改仍會自動保存在 IndexedDB，但 data.json 不會更新；重新選擇同一檔案即可恢復雙重保存。'
  }
  return {
    badge: '瀏覽器自動保存',
    title: '資料自動保存在這個瀏覽器',
    description: '每次新增或編輯後都會自動寫入 IndexedDB，不需要按保存；尚未連結 data.json。'
  }
})
const storageActionGuide = computed(() => {
  const guides = {
    connect: {
      tone: 'info',
      title: store.storageStatus.fileName ? '重新選擇同步檔案？' : '選擇既有 data.json？',
      detail: '選擇檔案後會先比較 data.json 與目前 IndexedDB，不會立刻覆蓋任何一邊。',
      note: '如果內容不同，下一步才會讓你選擇保留瀏覽器資料或載入檔案資料。',
      confirmLabel: '選擇並比較檔案'
    },
    create: {
      tone: 'info',
      title: '用目前資料建立 data.json？',
      detail: '系統會把目前 IndexedDB 的完整資料寫入一個新 JSON，完成後開始雙重自動保存。',
      note: '之後每次編輯都會自動更新 IndexedDB 與這個新檔案。',
      confirmLabel: '建立新檔案'
    },
    import: {
      tone: 'danger',
      title: '匯入 JSON 並取代目前資料？',
      detail: store.storageStatus.mode === 'file'
        ? `匯入內容會取代目前 IndexedDB，並同步寫入已連結的 ${store.storageStatus.fileName}。`
        : '匯入內容會取代目前 IndexedDB 的資料。',
      note: '取代前的目前資料會先保留在 IndexedDB 近期備份。',
      confirmLabel: '選擇要匯入的 JSON'
    },
    disconnect: {
      tone: 'warning',
      title: store.storageStatus.mode === 'file' ? '停止 data.json 自動同步？' : '移除 data.json 連結紀錄？',
      detail: 'IndexedDB 內的目前資料不會刪除，後續編輯仍會自動保存在這個瀏覽器。',
      note: 'data.json 將不再更新；之後仍可重新選擇檔案恢復同步。',
      confirmLabel: store.storageStatus.mode === 'file' ? '停止同步' : '移除連結紀錄'
    }
  }
  return guides[pendingStorageAction.value] || null
})

async function perform(action, message) {
  status.value = ''
  try {
    const result = await action()
    status.value = typeof message === 'function' ? message(result) : message
  } catch {
    status.value = ''
  }
}

async function loadBackups() {
  try {
    backups.value = await store.getBackups()
  } catch {
    backups.value = []
  }
}

async function connectJson() {
  status.value = ''
  try {
    const result = await store.connectJson()
    if (!result.conflict) {
      status.value = '已載入並連結 data.json；後續修改會同時保存到檔案與瀏覽器。'
      versionStatus.value = { matches: true, fileName: result.fileName, fileModifiedAt: new Date().toISOString() }
    } else {
      versionStatus.value = null
    }
    await loadBackups()
  } catch {
    status.value = ''
  }
}
async function resolveJson(strategy) {
  await perform(
    () => store.resolveJson(strategy),
    strategy === 'keep-browser' ? '已保留瀏覽器資料，並寫入連結的 data.json。' : '已載入 data.json，原瀏覽器資料仍保留在近期備份。'
  )
  if (store.storageStatus.fileName) versionStatus.value = { matches: true, fileName: store.storageStatus.fileName, fileModifiedAt: new Date().toISOString() }
  await loadBackups()
}
function cancelJson() {
  store.cancelJson()
  status.value = '已取消連結；瀏覽器資料沒有變更。'
}
async function createJson() {
  await perform(store.createJson, '已建立含時間的 data.json，並開始同步保存到檔案與 IndexedDB。')
  if (store.storageStatus.fileName) versionStatus.value = { matches: true, fileName: store.storageStatus.fileName, fileModifiedAt: new Date().toISOString() }
}
async function checkJsonVersion() {
  status.value = ''
  try {
    const result = await store.checkJsonVersion()
    versionStatus.value = result.matches ? result : null
  } catch {
    versionStatus.value = null
  }
}
const disconnect = async () => {
  versionStatus.value = null
  await perform(store.disconnectFile, '已中斷檔案連結；資料仍保存在這個瀏覽器。')
}
const exportJson = () => { store.exportJson(); status.value = 'JSON 備份已下載。' }
const exportExcel = () => perform(store.exportExcel, '盤點歷史 Excel（.xlsx）已下載。')

async function confirmStorageAction() {
  const action = pendingStorageAction.value
  pendingStorageAction.value = ''
  if (action === 'connect') await connectJson()
  else if (action === 'create') await createJson()
  else if (action === 'import') jsonInput.value?.click()
  else if (action === 'disconnect') await disconnect()
}

async function importJson(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await perform(() => store.importJson(file), 'JSON 已匯入目前資料。')
  event.target.value = ''
}
async function restoreBackup(createdAt) {
  await perform(() => store.restoreBackup(createdAt), 'IndexedDB 備份已復原；復原前的目前資料也已另外保留。')
  pendingRestoreAt.value = ''
  await loadBackups()
}

onMounted(() => {
  currentOrigin.value = window.location.origin
  loadBackups()
})

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '尚未儲存'
const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function backupDifferenceText(backup) {
  if (!backup.syncDelta) return '尚未建立 JSON 同步比較基準。'
  const labels = { accounts: '帳戶', holdings: '持倉', snapshots: '盤點', recurringCashflowItems: '週期收支' }
  const differences = Object.entries(backup.syncDelta)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${labels[key]} ${value > 0 ? '+' : ''}${value}`)
  return differences.length ? `相較 JSON 同步版：${differences.join('、')}` : '與 JSON 筆數相同，但內容、金額或價格不同。'
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Local-first storage" title="設定" description="所有編輯都會自動保存；這裡只需要管理 data.json 連結、復原版本與手動匯出。" />
    <AppNotice v-if="status" tone="success" class="space-after" aria-live="polite">{{ status }}</AppNotice>

    <UiPanel title="自動保存" description="IndexedDB 永遠是瀏覽器內的主要資料；連結 data.json 後，系統會在每次編輯時同步更新兩邊。">
        <template #action><span class="pill" :class="{ 'pill-blue': store.storageStatus.mode === 'file' }">{{ storagePresentation.badge }}</span></template>
        <div class="stack">
          <div class="file-status">
            <div class="file-status__icon"><Database :size="21" aria-hidden="true" /></div>
            <div class="file-status__copy">
              <strong>{{ storagePresentation.title }}</strong>
              <span>{{ storagePresentation.description }}</span>
            </div>
          </div>

          <AppNotice v-if="store.storageStatus.mode === 'file'" title="不需要手動更新">現在每次修改都會自動更新瀏覽器與 data.json。只有檔案被其他程式改過時，系統才會停止覆寫並請你確認版本。</AppNotice>
          <AppNotice v-else-if="store.storageStatus.fileName" tone="warning" title="目前只有瀏覽器會更新">data.json 的授權可能在瀏覽器重新啟動後失效；這不是資料遺失，重新選擇同一檔案即可繼續同步。</AppNotice>
          <AppNotice v-else title="需要跨電腦時再連結 JSON">建立的檔名會包含時間；完成後，後續修改會自動同時保存到該 JSON 與 IndexedDB。</AppNotice>

          <AppNotice v-if="versionStatus" tone="success" title="目前資料與 data.json 一致">
            {{ versionStatus.fileName }} 已同步；檔案時間 {{ formatDate(versionStatus.fileModifiedAt) }}。
          </AppNotice>

          <AppNotice v-if="store.jsonConflict" tone="warning" title="data.json 與瀏覽器資料不同，尚未覆蓋">
            <div class="conflict-comparison">
              <span><strong>目前瀏覽器</strong>{{ store.jsonConflict.browser.accounts }} 個帳戶、{{ store.jsonConflict.browser.holdings }} 筆持倉、{{ store.jsonConflict.browser.recurringCashflowItems || 0 }} 筆週期收支、{{ store.jsonConflict.browser.snapshots }} 筆盤點</span>
              <span><strong>{{ store.jsonConflict.fileName }}</strong>{{ store.jsonConflict.file.accounts }} 個帳戶、{{ store.jsonConflict.file.holdings }} 筆持倉、{{ store.jsonConflict.file.recurringCashflowItems || 0 }} 筆週期收支、{{ store.jsonConflict.file.snapshots }} 筆盤點</span>
            </div>
            <span>即使筆數相同，金額、股數、價格、名稱、設定或保存時間仍可能不同；請選擇要保留的完整版本。</span>
            <span v-if="store.jsonConflict.fileIsEmpty">選到的檔案沒有使用者資料，建議保留目前瀏覽器資料。</span>
            <template #action>
              <div class="conflict-actions">
                <button class="btn btn-primary conflict-choice" type="button" :disabled="store.saving" @click="resolveJson('keep-browser')"><strong>保留瀏覽器資料</strong><small>以 IndexedDB 為準，覆蓋 data.json</small></button>
                <button class="btn btn-secondary conflict-choice" type="button" :disabled="store.saving" @click="resolveJson('load-file')"><strong>載入檔案資料</strong><small>以 data.json 為準，取代目前資料</small></button>
                <button class="btn btn-ghost" type="button" :disabled="store.saving" @click="cancelJson">取消</button>
              </div>
            </template>
          </AppNotice>

          <template v-if="store.storageStatus.supportsFileSystemAccess">
            <div v-if="!store.jsonConflict" class="button-grid">
              <template v-if="store.storageStatus.mode === 'file'">
                <button class="btn btn-secondary" :disabled="store.saving" @click="checkJsonVersion"><RefreshCw :size="18" />檢查資料版本</button>
                <button class="btn btn-ghost" :disabled="store.saving" @click="pendingStorageAction = 'disconnect'"><Unplug :size="18" />停止 data.json 同步</button>
              </template>
              <template v-else-if="store.storageStatus.fileName">
                <button class="btn btn-primary" :disabled="store.saving" @click="pendingStorageAction = 'connect'"><RefreshCw :size="18" />重新選擇同步檔案</button>
                <button class="btn btn-ghost" :disabled="store.saving" @click="pendingStorageAction = 'disconnect'"><Unplug :size="18" />移除連結紀錄</button>
              </template>
              <template v-else>
                <button class="btn btn-primary" :disabled="store.saving" @click="pendingStorageAction = 'connect'"><FileJson :size="18" />選擇既有 data.json</button>
                <button class="btn btn-secondary" :disabled="store.saving" @click="pendingStorageAction = 'create'"><Save :size="18" />以目前資料建立 data.json</button>
              </template>
            </div>
          </template>
          <AppNotice v-else tone="warning">這個瀏覽器不支援直接寫回本機檔案，請使用 JSON 匯入／下載；Chrome 或 Edge 桌面版支援最完整。</AppNotice>

          <div class="divider" />
          <div class="section-copy"><strong>手動 JSON 備份</strong><span>JSON 包含帳戶、持倉、現金明細、設定與全部盤點紀錄，是完整備份格式。</span></div>
          <input ref="jsonInput" class="sr-only" type="file" accept=".json,application/json" @change="importJson" />
          <div class="button-grid">
            <button class="btn btn-secondary" :disabled="store.saving" @click="pendingStorageAction = 'import'"><Upload :size="18" />匯入 JSON 取代目前資料</button>
            <button class="btn btn-secondary" :disabled="store.saving" title="只下載一次性備份，不會建立自動同步" @click="exportJson"><Download :size="18" />下載一次性 JSON 備份</button>
          </div>

          <details class="technical-details">
            <summary>網址與 Port 說明</summary>
            <div class="storage-origin"><strong>目前 IndexedDB 網址</strong><code>{{ currentOrigin }}</code><span>網址或 Port 改變時，瀏覽器會使用另一份資料庫。</span></div>
          </details>
        </div>
    </UiPanel>

    <UiPanel title="IndexedDB 近期備份" description="每次保存前留下上一版，最多保留最新 3 份；可查看異動並復原資料。" class="settings-section">
      <template #action><div class="backup-panel-action"><History :size="20" aria-hidden="true" /><span class="pill pill-neutral">{{ backups.length }}/3 份 · 約 {{ formatBytes(backupTotalBytes) }}</span></div></template>
      <AppNotice class="space-after" title="自動保留 3 份，不用手動備份">每份是修改前的完整 JSON；第 4 份出現時會移除最舊的一份。只記錄帳戶、持倉、現金與盤點等實際編輯；自動市場資料、匯率與最新股價不列入，也不會占用備份名額。</AppNotice>
      <div v-if="backups.length" class="backup-list">
        <div v-for="backup in backups" :key="backup.createdAt" class="backup-item">
          <div class="backup-item__copy">
            <strong>{{ formatDate(backup.createdAt) }}</strong>
            <span>{{ backup.accounts }} 個帳戶 · {{ backup.holdings }} 筆持倉 · {{ backup.recurringCashflowItems || 0 }} 筆週期收支 · {{ backup.snapshots }} 筆盤點</span>
            <small>資料最後保存：{{ formatDate(backup.lastSavedAt) }}</small>
            <div class="backup-version-tags">
              <span v-if="backup.matchesCurrent" class="pill pill-blue">目前瀏覽器版本</span>
              <span v-if="backup.matchesSyncedFile" class="pill">JSON 同步版本</span>
            </div>
            <details class="backup-changes">
              <summary>{{ backup.changes.length ? `這份備份後有 ${backup.changes.length} 項異動` : '這份備份後沒有實質資料異動' }}</summary>
              <ul v-if="backup.changes.length">
                <li v-for="change in backup.changes" :key="change">{{ change }}</li>
              </ul>
              <p v-else>只有保存時間等系統資訊更新，帳戶、金額、持倉與盤點內容沒有改變。</p>
            </details>
            <small v-if="backup.syncedFileName && !backup.matchesSyncedFile" class="backup-difference">{{ backupDifferenceText(backup) }}</small>
            <small v-else-if="!backup.syncedFileName" class="backup-difference">尚未建立 JSON 同步比較基準。</small>
          </div>
          <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="pendingRestoreAt = backup.createdAt"><RotateCcw :size="17" />復原這一版</button>
          <AppNotice v-if="pendingRestoreAt === backup.createdAt" class="backup-confirm" tone="warning" title="確定復原這一版？">
            {{ store.storageStatus.mode === 'file'
              ? `IndexedDB 與已連結的 ${store.storageStatus.fileName} 都會切換成這份資料；復原前的目前版本會先保留在近期備份。`
              : '目前 IndexedDB 會切換成這份資料；復原前的目前版本會先保留在近期備份。' }}
            <template #action><div class="confirm-actions"><button class="btn btn-ghost" type="button" @click="pendingRestoreAt = ''">取消</button><button class="btn btn-primary" type="button" :disabled="store.saving" @click="restoreBackup(backup.createdAt)">確認復原</button></div></template>
          </AppNotice>
        </div>
      </div>
      <EmptyState v-else title="目前沒有可復原版本" description="只有在這個瀏覽器曾成功保存過資料，才會出現 IndexedDB 近期備份。" />
    </UiPanel>

    <UiPanel title="Excel 匯出（盤點歷史）" description="Excel 只用來下載、查看與分析盤點歷史，不作為資料復原格式；完整備份請使用 JSON。" class="settings-section">
      <template #action><FileSpreadsheet :size="22" aria-hidden="true" /></template>
      <button class="btn btn-secondary" :disabled="store.saving || !store.snapshots.length" @click="exportExcel"><Download :size="18" />下載盤點 Excel</button>
    </UiPanel>

    <ConfirmDialog :open="Boolean(storageActionGuide)" :title="storageActionGuide?.title || ''" :confirm-label="storageActionGuide?.confirmLabel || '繼續'" :tone="storageActionGuide?.tone || 'info'" :busy="store.saving" @close="pendingStorageAction = ''" @confirm="confirmStorageAction">
      <p>{{ storageActionGuide?.detail }}</p>
      <p>{{ storageActionGuide?.note }}</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.settings-section { margin-top: 18px; }
.file-status { display: flex; align-items: center; gap: 13px; padding: 15px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-muted); }
.file-status__icon { flex: 0 0 auto; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--primary-soft); color: var(--primary); }
.file-status__copy { min-width: 0; }
.file-status__copy strong, .file-status__copy span { display: block; }
.file-status__copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-status__copy span { margin-top: 4px; color: var(--muted); font-size: .75rem; line-height: 1.45; }
.storage-origin { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 9px; padding: 9px 11px; border-radius: 10px; background: var(--surface-muted); color: var(--muted); font-size: .72rem; }
.storage-origin strong { color: var(--text-soft); }
.storage-origin code { padding: 2px 6px; border-radius: 6px; background: var(--surface); color: var(--primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.storage-origin span { flex-basis: 100%; }
.section-copy { display: grid; gap: 4px; }
.section-copy strong { font-size: .86rem; }
.section-copy span { color: var(--muted); font-size: .75rem; line-height: 1.5; }
.button-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.conflict-comparison { display: grid; gap: 7px; margin-bottom: 7px; }
.conflict-comparison span { display: grid; gap: 1px; }
.conflict-actions, .confirm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.conflict-choice { height: auto; display: grid; justify-items: start; gap: 2px; text-align: left; }
.conflict-choice small { color: inherit; font-size: .67rem; font-weight: 600; opacity: .82; }
.backup-panel-action { display: flex; align-items: center; justify-content: flex-end; gap: 8px; color: var(--muted); }
.backup-list { display: grid; gap: 10px; }
.technical-details { border-top: 1px solid var(--border); padding-top: 10px; }
.technical-details summary { width: fit-content; color: var(--muted); cursor: pointer; font-size: .74rem; font-weight: 700; }
.technical-details[open] summary { margin-bottom: 9px; color: var(--text-soft); }
.backup-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.backup-item__copy { display: grid; gap: 3px; min-width: 0; }
.backup-item__copy strong { font-size: .86rem; }
.backup-item__copy span, .backup-item__copy small { color: var(--muted); font-size: .75rem; }
.backup-version-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
.backup-version-tags .pill { min-height: 22px; padding: 2px 7px; font-size: .64rem; }
.backup-item__copy .backup-difference { margin-top: 2px; color: var(--text-soft); }
.backup-changes { margin-top: 4px; color: var(--text-soft); font-size: .75rem; }
.backup-changes summary { width: fit-content; cursor: pointer; color: var(--primary); font-weight: 700; }
.backup-changes ul { display: grid; gap: 4px; margin: 7px 0 2px; padding-left: 18px; color: var(--muted); line-height: 1.45; }
.backup-changes p { margin: 7px 0 2px; color: var(--muted); line-height: 1.45; }
.backup-confirm { grid-column: 1 / -1; }
@media (max-width: 620px) {
  .button-grid, .backup-item { grid-template-columns: 1fr; }
  .backup-item > .btn { width: 100%; }
  .conflict-actions, .confirm-actions { flex-direction: column; }
}
</style>
