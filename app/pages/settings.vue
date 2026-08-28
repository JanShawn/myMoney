<script setup>
import { Database, Download, FileJson, FileSpreadsheet, RefreshCw, Save, Unplug, Upload } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const limit = ref(30)
const status = ref('')
const jsonInput = ref(null)
const excelInput = ref(null)

watch(() => store.config?.settings, (settings) => {
  if (settings) limit.value = settings.snapshotDisplayLimit || 30
}, { immediate: true })

async function perform(action, message) {
  status.value = ''
  try {
    const result = await action()
    status.value = typeof message === 'function' ? message(result) : message
  } catch {
    status.value = ''
  }
}

const saveSettings = () => perform(
  () => store.updateSettings({ snapshotDisplayLimit: Number(limit.value) }),
  '顯示設定已儲存。'
)
const connectJson = () => perform(store.connectJson, '已連結並載入本機 data.json。')
const createJson = () => perform(store.createJson, '已建立並連結新的 myMoney data.json。')
const reloadJson = () => perform(() => store.reloadJson(true), '已重新讀取本機 data.json。')
const disconnect = () => perform(store.disconnectFile, '已中斷檔案連結；資料仍保存在這個瀏覽器。')
const exportJson = () => { store.exportJson(); status.value = 'JSON 備份已下載。' }
const exportExcel = () => perform(store.exportExcel, 'Excel 快照已下載。')

async function importJson(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await perform(() => store.importJson(file), 'JSON 已匯入目前資料。')
  event.target.value = ''
}
async function importExcel(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await perform(() => store.importExcel(file), (count) => '已匯入 ' + count + ' 筆 Excel 快照。')
  event.target.value = ''
}

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '尚未儲存'
</script>

<template>
  <div>
    <header class="page-header">
      <div><div class="eyebrow">Local-first storage</div><h1 class="page-title">設定</h1><p class="page-subtitle">連結本機 data.json，或使用瀏覽器儲存。整個網站可以純靜態部署。</p></div>
    </header>
    <div v-if="status" class="notice" role="status" aria-live="polite" style="margin-bottom: 16px">{{ status }}</div>

    <div class="grid-2" style="align-items: start">
      <section class="card card-body">
        <div class="toolbar">
          <div><h2 class="section-title">本機 JSON</h2><p class="row-meta">JSON 是帳戶、持倉與快照的主要資料來源</p></div>
          <span class="pill" :class="{ 'pill-blue': store.storageStatus.mode === 'file' }">
            {{ store.storageStatus.mode === 'file' ? '已連結檔案' : '瀏覽器儲存' }}
          </span>
        </div>
        <div class="stack" style="margin-top: 18px">
          <div class="notice">
            <Database :size="20" aria-hidden="true" />
            <div><strong>{{ store.storageStatus.fileName || '尚未連結 data.json' }}</strong><br />{{ store.storageStatus.mode === 'file' ? '修改後會直接寫回這個檔案。' : '目前自動保存在 IndexedDB；可以隨時下載 JSON 備份。' }}</div>
          </div>

          <template v-if="store.storageStatus.supportsFileSystemAccess">
            <button class="btn btn-primary" :disabled="store.saving" @click="connectJson"><FileJson :size="18" />選擇既有 data.json</button>
            <button class="btn btn-secondary" :disabled="store.saving" @click="createJson"><Save :size="18" />建立新的 data.json</button>
            <button v-if="store.storageStatus.fileName" class="btn btn-secondary" :disabled="store.saving" @click="reloadJson"><RefreshCw :size="18" />重新授權／載入檔案</button>
            <button v-if="store.storageStatus.fileName" class="btn btn-ghost" :disabled="store.saving" @click="disconnect"><Unplug :size="18" />中斷檔案連結</button>
          </template>
          <div v-else class="notice notice-warning">這個瀏覽器不支援直接寫回本機檔案，請使用 JSON 匯入／下載；Chrome 或 Edge 桌面版支援最完整。</div>

          <div class="divider" />
          <input ref="jsonInput" class="sr-only" type="file" accept=".json,application/json" @change="importJson" />
          <button class="btn btn-secondary" :disabled="store.saving" @click="jsonInput.click()"><Upload :size="18" />匯入 JSON</button>
          <button class="btn btn-secondary" :disabled="store.saving" @click="exportJson"><Download :size="18" />下載 JSON 備份</button>
        </div>
      </section>

      <section class="card card-body">
        <h2 class="section-title">顯示與狀態</h2>
        <div class="stack" style="margin-top: 18px">
          <div class="field"><label for="snapshot-limit">儀表板預設顯示筆數</label><input id="snapshot-limit" v-model.number="limit" class="input" type="number" min="5" max="500" /><span class="row-meta">JSON 會保留全部快照，這裡只控制圖表顯示範圍。</span></div>
          <button class="btn btn-primary" :disabled="store.saving" @click="saveSettings"><Save :size="18" />儲存顯示設定</button>
          <div class="divider" />
          <div><div class="field-label">最後保存</div><div class="row-meta">{{ formatDate(store.config?.settings?.lastSavedAt) }}</div></div>
          <div><div class="field-label">快照筆數</div><div class="row-meta">{{ store.snapshots.length }} 筆</div></div>
          <div><div class="field-label">檔案權限</div><div class="row-meta">{{ store.storageStatus.permission }}</div></div>
        </div>
      </section>
    </div>

    <section class="card card-body" style="margin-top: 16px">
      <div class="toolbar"><div><h2 class="section-title">Excel 交換</h2><p class="row-meta">Excel 不再是資料庫，而是歷史快照的匯入／匯出格式。</p></div><FileSpreadsheet :size="22" aria-hidden="true" /></div>
      <div class="grid-2" style="margin-top: 16px">
        <input ref="excelInput" class="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="importExcel" />
        <button class="btn btn-secondary" :disabled="store.saving" @click="excelInput.click()"><Upload :size="18" />從 Excel 匯入快照</button>
        <button class="btn btn-secondary" :disabled="store.saving || !store.snapshots.length" @click="exportExcel"><Download :size="18" />匯出 Excel 快照</button>
      </div>
    </section>

    <section class="card card-body" style="margin-top: 16px">
      <h2 class="section-title">安全機制</h2>
      <div class="grid-2" style="margin-top: 14px">
        <div class="notice"><div><strong>外部修改保護</strong><br />連結的 data.json 若被其他程式修改，myMoney 會阻擋下一次覆寫並要求重新載入。</div></div>
        <div class="notice"><div><strong>瀏覽器內備份</strong><br />每次保存前會把上一版 JSON 留在 IndexedDB，保留最近 10 份；仍建議定期下載 JSON 備份。</div></div>
      </div>
    </section>
  </div>
</template>
