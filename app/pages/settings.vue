<script setup>
import { AlertCircle, CheckCircle2, ChevronDown, Cloud, CloudDownload, CloudUpload, Database, Download, FileJson, FilePlus2, FileSpreadsheet, History, Link2, Link2Off, RotateCcw, Save, Trash2, Upload, WalletMinimal } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const jsonInput = ref(null)
const currentOrigin = ref('')
const backups = ref([])
const pendingRestoreAt = ref('')
const pendingReset = ref(false)
const pendingImport = shallowRef(null)
const pendingSyncImport = shallowRef(null)
const pendingSyncConflict = shallowRef(null)

const cashReconciliationEnabled = computed(() => store.config?.settings?.cashReconciliationEnabled !== false)
const jsonBackup = computed(() => store.storageStatus.jsonBackup)
const syncFile = computed(() => store.storageStatus.syncFile)
const pendingChanges = computed(() => jsonBackup.value.changes || [])
const backupTotalBytes = computed(() => backups.value.reduce((total, backup) => total + Number(backup.sizeBytes || 0), 0))
const syncPermissionLabel = computed(() => ({
  granted: '已允許讀寫',
  prompt: '使用時會請你允許',
  denied: '權限已拒絕',
  unavailable: '尚未取得權限'
})[syncFile.value.permission] || '尚未確認')
const backupPresentation = computed(() => {
  if (!jsonBackup.value.exists) return {
    badge: '尚未建立備份', tone: 'neutral', title: '瀏覽器資料尚未建立獨立備份',
    description: '目前資料已自動保存在這個瀏覽器；需要額外留存時，再下載一份獨立備份。'
  }
  if (jsonBackup.value.isCurrent) return {
    badge: '備份已是最新版', tone: 'current', title: '目前資料與最近一次獨立備份一致',
    description: `${jsonBackup.value.fileName} · ${formatDate(jsonBackup.value.createdAt)}`
  }
  if (!jsonBackup.value.comparisonAvailable) return {
    badge: '建議重新備份', tone: 'pending', title: '找到舊版備份紀錄，但無法完整比較內容',
    description: '重新下載一次獨立備份後，系統就能準確判斷後續是否有未備份變更。'
  }
  return {
    badge: pendingChanges.value.length ? `${pendingChanges.value.length} 項待備份` : '有變更待備份',
    tone: 'pending', title: '瀏覽器內有尚未備份的變更',
    description: `最近一次獨立備份：${jsonBackup.value.fileName} · ${formatDate(jsonBackup.value.createdAt)}`
  }
})

async function loadBackups() {
  try { backups.value = await store.getBackups() } catch { backups.value = [] }
}

async function saveJson() {
  try {
    const result = await store.saveJson()
    showToast({ tone: 'success', title: '獨立備份完成', message: `已建立「${result.fileName}」；目前資料已完整保留。` })
  } catch (error) {
    if (error?.name === 'AbortError') showToast({ title: '已取消儲存', message: '瀏覽器中的資料仍然安全，不受影響。' })
  }
}

async function selectJson(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const preview = await store.previewJsonImport(file)
    pendingImport.value = { file, ...preview }
  } catch { pendingImport.value = null }
}

async function confirmImport() {
  if (!pendingImport.value?.file) return
  const fileName = pendingImport.value.fileName
  try {
    await store.importJson(pendingImport.value.file)
    pendingImport.value = null
    showToast({ tone: 'success', title: '備份還原完成', message: `已從「${fileName}」還原；原本資料已保留在近期版本。` })
    await loadBackups()
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function restoreBackup(createdAt) {
  try {
    await store.restoreBackup(createdAt)
    pendingRestoreAt.value = ''
    showToast({ tone: 'success', title: '近期版本復原完成', message: '復原前的資料也已另外保留。' })
    await loadBackups()
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function resetAllData() {
  try {
    await store.resetAllData()
    pendingReset.value = false
    showToast({ tone: 'success', title: '資料已重設', message: '重設前的內容已保留在近期版本。' })
    await loadBackups()
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function exportExcel() {
  try {
    await store.exportExcel()
    showToast({ tone: 'success', title: 'Excel 匯出完成', message: '盤點歷史 Excel（.xlsx）已下載。' })
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function connectSyncFile() {
  try {
    const result = await store.connectSyncFile()
    if (result.requiresImport) {
      pendingSyncImport.value = result
      showToast({ tone: 'info', title: '同步檔案已連結', message: `請確認是否載入「${result.fileName}」的最新內容。` })
      return
    }
    showToast({
      tone: 'success',
      title: '同步檔案已連結',
      message: `「${result.fileName}」與目前資料一致。`
    })
  } catch (error) {
    if (error?.name === 'AbortError') showToast({ title: '已取消連結', message: '原本的瀏覽器資料不受影響。' })
  }
}

async function createSyncFile() {
  try {
    const result = await store.createSyncFile()
    showToast({ tone: 'success', title: '同步檔案已建立', message: `目前資料已寫入「${result.fileName}」。` })
  } catch (error) {
    if (error?.name === 'AbortError') showToast({ title: '已取消建立', message: '原本的瀏覽器資料不受影響。' })
  }
}

async function uploadSyncFile(force = false) {
  try {
    const result = await store.uploadSyncFile({ force })
    if (result.conflict) {
      pendingSyncConflict.value = result
      return
    }
    pendingSyncConflict.value = null
    if (result.requiresPull) {
      showToast({ tone: 'warning', title: '請先載入同步檔案最新版', message: `「${result.fileName}」有較新的內容，尚未覆蓋。請先載入、確認資料後再繼續修改。` })
      return
    }
    showToast({
      tone: 'success',
      title: result.unchanged ? '同步檔案已是最新版' : '同步檔案已更新',
      message: result.unchanged ? '目前瀏覽器與同步檔案內容一致。' : `已將目前資料寫入「${result.fileName}」。`
    })
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function previewSyncFile() {
  try {
    pendingSyncImport.value = await store.previewSyncFile()
  } catch { pendingSyncImport.value = null }
}

async function confirmSyncImport() {
  if (!pendingSyncImport.value?.fingerprint) return
  const fileName = pendingSyncImport.value.fileName
  try {
    await store.downloadSyncFile(pendingSyncImport.value.fingerprint)
    pendingSyncImport.value = null
    pendingSyncConflict.value = null
    showToast({ tone: 'success', title: '已從同步檔案更新', message: `已載入「${fileName}」；原本資料已保留在近期版本。` })
    await loadBackups()
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function disconnectSyncFile() {
  try {
    await store.disconnectSync()
    pendingSyncImport.value = null
    pendingSyncConflict.value = null
    showToast({ title: '已解除連結', message: '同步檔案沒有被刪除，本機自動保存仍會繼續運作。' })
  } catch { /* 詳細原因由全站錯誤提示呈現。 */ }
}

async function toggleCashReconciliation() {
  const enabled = !cashReconciliationEnabled.value
  try {
    await store.updateSettings({ cashReconciliationEnabled: enabled })
    showToast({
      tone: 'success',
      title: enabled ? '現金驗算已啟用' : '已切換為帳戶直接管理',
      message: enabled
        ? '「身上現金」的金額改由現金驗算頁管理。'
        : '現金驗算資料仍會保留；現金帳戶現在可在帳戶結構自由編輯、移動或刪除。'
    })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '偏好設定保存失敗', message: error?.message || '無法寫入資料。' })
  }
}

onMounted(() => {
  currentOrigin.value = window.location.origin
  loadBackups()
})

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未儲存'
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Preferences & storage" title="設定" description="平常操作會自動保存在瀏覽器；需要跨電腦使用時，可選擇連結同步檔案。" />
    <UiPanel class="feature-panel" title="功能偏好" description="每位使用者都能選擇是否需要現金明細驗算。">
      <template #action><span class="pill" :class="{ 'pill-neutral': !cashReconciliationEnabled }">{{ cashReconciliationEnabled ? '已啟用現金驗算' : '帳戶直接管理' }}</span></template>
      <div class="feature-setting">
        <div class="feature-setting__icon"><WalletMinimal :size="21" aria-hidden="true" /></div>
        <div class="feature-setting__copy">
          <strong>現金驗算</strong>
          <span v-if="cashReconciliationEnabled">「身上現金」金額由現金驗算頁管理，帳戶結構只負責名稱與分類。</span>
          <span v-else>隱藏現金驗算入口；現金帳戶會和其他帳戶一樣，可編輯、移動或刪除。</span>
          <small>關閉本身不會刪除既有驗算明細；重新啟用時，若系統現金帳戶已刪除，會自動補回。</small>
        </div>
        <button class="feature-switch" type="button" role="switch" :aria-checked="cashReconciliationEnabled" :aria-label="cashReconciliationEnabled ? '關閉現金驗算' : '啟用現金驗算'" :disabled="store.saving" @click="toggleCashReconciliation"><span /></button>
      </div>
    </UiPanel>

    <UiPanel class="storage-panel" title="保存狀態" description="瀏覽器自動保存是主要資料來源；獨立備份用於救援，同步檔案用於跨電腦更新。">
      <template #action>
        <span class="pill" :class="{ 'pill-blue': backupPresentation.tone === 'current', 'pill-warning': backupPresentation.tone === 'pending' }">{{ backupPresentation.badge }}</span>
      </template>

      <div class="storage-status-grid">
        <div class="storage-status-card storage-status-card--browser">
          <div class="storage-status-card__icon"><Database :size="21" aria-hidden="true" /></div>
          <div class="storage-status-card__copy"><strong>瀏覽器已自動保存</strong><span>最後更新：{{ formatDate(store.storageStatus.lastSavedAt) }}</span></div>
          <CheckCircle2 :size="20" class="storage-status-card__state" aria-label="保存正常" />
        </div>

        <div class="storage-status-card" :class="`storage-status-card--${backupPresentation.tone}`">
          <div class="storage-status-card__icon"><FileJson :size="21" aria-hidden="true" /></div>
          <div class="storage-status-card__copy"><strong>{{ backupPresentation.title }}</strong><span>{{ backupPresentation.description }}</span></div>
          <AlertCircle v-if="backupPresentation.tone === 'pending'" :size="20" class="storage-status-card__state" aria-label="有資料待備份" />
          <CheckCircle2 v-else-if="backupPresentation.tone === 'current'" :size="20" class="storage-status-card__state" aria-label="獨立備份已是最新版" />
        </div>
      </div>

      <AppNotice v-if="jsonBackup.exists && !jsonBackup.isCurrent && jsonBackup.comparisonAvailable" tone="warning" :title="`${pendingChanges.length || '有'}項變更尚未備份`">
        <ul v-if="pendingChanges.length" class="pending-change-list"><li v-for="change in pendingChanges.slice(0, 5)" :key="change">{{ change }}</li></ul>
        <span v-if="pendingChanges.length > 5">另有 {{ pendingChanges.length - 5 }} 項變更。</span>
      </AppNotice>

      <div class="backup-actions">
        <button class="btn btn-primary" type="button" :disabled="store.saving" @click="saveJson"><Save :size="18" />{{ store.saving ? '處理中…' : '下載獨立備份' }}</button>
        <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="jsonInput?.click()"><Upload :size="18" />從備份檔還原</button>
        <input ref="jsonInput" class="sr-only" type="file" accept=".json,application/json" @change="selectJson" />
      </div>
      <p class="backup-action-note">檔名會自動加入日期時間，例如 myMoney-backup-2026-09-18-1730.json，避免不同時間的備份互相覆蓋。</p>

      <details class="technical-details">
        <summary>網址與 Port 說明</summary>
        <div class="storage-origin"><strong>目前瀏覽器資料位置</strong><code>{{ currentOrigin }}</code><span>網址或 Port 改變時，瀏覽器會使用另一份獨立資料。</span></div>
      </details>
    </UiPanel>

    <UiPanel class="settings-section sync-panel" title="同步檔案（選用）" description="手動讀寫 Google Drive 電腦版或其他同步資料夾裡的固定 JSON；未啟用時不影響任何既有功能。">
      <template #action>
        <div class="backup-panel-action"><Cloud :size="20" aria-hidden="true" /><span class="pill" :class="{ 'pill-blue': syncFile.connected, 'pill-neutral': !syncFile.connected }">{{ syncFile.connected ? '已連結' : '未啟用' }}</span></div>
      </template>

      <AppNotice v-if="!syncFile.supported" tone="warning" title="此瀏覽器不支援固定同步檔案">
        本機自動保存與一般 JSON 備份仍可正常使用；若要使用固定同步檔案，請改用最新版 Chrome 或 Edge。
      </AppNotice>

      <template v-else-if="!syncFile.connected">
        <AppNotice tone="info" title="不使用 Google Drive 也能正常使用">
          這是完全選用的功能。若要啟用，可選擇 Google Drive 電腦版「我的雲端硬碟」裡的 JSON；myMoney 不會登入或讀取你的 Google 帳號。
        </AppNotice>
        <div class="sync-connect-actions">
          <button class="btn btn-primary" type="button" :disabled="store.saving" @click="connectSyncFile"><Link2 :size="18" />連結既有同步檔案</button>
          <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="createSyncFile"><FilePlus2 :size="18" />建立新的同步檔案</button>
        </div>
        <p class="backup-action-note">連結既有檔案後會立即顯示內容摘要並詢問是否載入；建立新檔則會直接寫入目前瀏覽器資料。</p>
      </template>

      <template v-else>
        <div class="sync-status-card">
          <div class="sync-status-card__icon"><Cloud :size="22" aria-hidden="true" /></div>
          <div class="sync-status-card__copy">
            <strong>{{ syncFile.fileName }}</strong>
            <span>上次同步：{{ formatDate(syncFile.lastSyncedAt) }}</span>
            <span>檔案版本：{{ formatDate(syncFile.lastRemoteUpdatedAt) }}</span>
            <small>{{ syncPermissionLabel }}</small>
          </div>
          <span class="pill" :class="{ 'pill-warning': syncFile.hasLocalChanges, 'pill-blue': !syncFile.hasLocalChanges }">{{ syncFile.hasLocalChanges ? '本機有變更' : '內容已同步' }}</span>
        </div>

        <div class="sync-actions">
          <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="previewSyncFile"><CloudDownload :size="18" />① 載入同步檔案最新版</button>
          <button class="btn btn-primary" type="button" :disabled="store.saving" @click="uploadSyncFile(false)"><CloudUpload :size="18" />② 將目前資料存到同步檔案</button>
          <button class="btn btn-ghost" type="button" :disabled="store.saving" @click="disconnectSyncFile"><Link2Off :size="18" />解除連結</button>
        </div>

        <AppNotice tone="info" title="建議流程：先載入，修改後再儲存">
          開始修改前先按「① 載入同步檔案最新版」，完成修改後再按「② 將目前資料存到同步檔案」。儲存前仍會重新檢查版本；若別台電腦已更新，系統會停止寫入，避免蓋掉較新的檔案。
        </AppNotice>
        <p class="backup-action-note">解除連結只會讓這個瀏覽器忘記檔案，不會刪除 Google Drive 裡的 JSON；之後仍可重新連結。</p>
      </template>
    </UiPanel>

    <UiPanel title="瀏覽器近期版本" description="每次實際編輯前保留上一版，最多保留最新 3 份。" class="settings-section">
      <template #action><div class="backup-panel-action"><History :size="20" aria-hidden="true" /><span class="pill pill-neutral">{{ backups.length }}/3 份 · 約 {{ formatBytes(backupTotalBytes) }}</span></div></template>
      <details class="history-details">
        <summary class="history-summary"><span>{{ backups.length ? '查看與復原近期版本' : '目前沒有可復原版本' }}</span><ChevronDown :size="18" aria-hidden="true" /></summary>
        <div v-if="backups.length" class="backup-list">
          <div v-for="backup in backups" :key="backup.createdAt" class="backup-item">
            <div class="backup-item__copy">
              <strong>{{ formatDate(backup.createdAt) }}</strong>
              <span>{{ backup.accounts }} 個帳戶 · {{ backup.holdings }} 筆持倉 · {{ backup.stockBuyListItems || 0 }} 檔待買股票 · {{ backup.recurringCashflowItems || 0 }} 筆週期收支 · {{ backup.snapshots }} 筆盤點</span>
              <small>資料最後保存：{{ formatDate(backup.lastSavedAt) }}</small>
              <div class="backup-version-tags">
                <span v-if="backup.matchesCurrent" class="pill pill-blue">目前瀏覽器版本</span>
                <span v-if="backup.matchesJsonBackup" class="pill">最近獨立備份版本</span>
              </div>
              <details class="backup-changes">
                <summary>{{ backup.changes.length ? `這份版本後有 ${backup.changes.length} 項異動` : '這份版本後沒有實質資料異動' }}</summary>
                <ul v-if="backup.changes.length"><li v-for="change in backup.changes" :key="change">{{ change }}</li></ul>
                <p v-else>只有保存時間等系統資訊更新，帳戶、金額、持倉與盤點內容沒有改變。</p>
              </details>
            </div>
            <button class="btn btn-secondary" type="button" :disabled="store.saving" @click="pendingRestoreAt = backup.createdAt"><RotateCcw :size="17" />復原這一版</button>
            <AppNotice v-if="pendingRestoreAt === backup.createdAt" class="backup-confirm" tone="warning" title="確定復原這一版？">
              目前瀏覽器資料會切換成這份版本；復原前的資料會先保留在近期版本，JSON 檔案不會被修改。
              <template #action><div class="confirm-actions"><button class="btn btn-ghost" type="button" @click="pendingRestoreAt = ''">取消</button><button class="btn btn-primary" type="button" :disabled="store.saving" @click="restoreBackup(backup.createdAt)">確認復原</button></div></template>
            </AppNotice>
          </div>
        </div>
        <EmptyState v-else title="目前沒有可復原版本" description="完成一次實際資料編輯後，這裡會自動保留修改前的版本。" />
      </details>
    </UiPanel>

    <UiPanel title="其他匯出" description="Excel 只包含資產盤點歷史，完整還原仍請使用獨立備份。" class="settings-section">
      <template #action><FileSpreadsheet :size="22" aria-hidden="true" /></template>
      <button class="btn btn-secondary" type="button" :disabled="store.saving || !store.snapshots.length" @click="exportExcel"><Download :size="18" />下載盤點 Excel</button>
    </UiPanel>

    <UiPanel title="重設資料" description="清空目前的帳戶、持倉、待買股票、盤點與週期收支，回到初始狀態。" class="settings-section danger-zone">
      <template #action><Trash2 :size="22" aria-hidden="true" /></template>
      <p class="danger-zone__description">重設前會自動保留一份近期版本；電腦上的獨立備份不會被刪除，瀏覽器中的尚未備份狀態會一併清除。</p>
      <button class="btn btn-danger" type="button" :disabled="store.saving" @click="pendingReset = true"><Trash2 :size="18" />重設所有資料</button>
    </UiPanel>

    <ConfirmDialog :open="Boolean(pendingImport)" :title="`從「${pendingImport?.fileName || '備份檔'}」還原？`" confirm-label="確認還原" tone="warning" :busy="store.saving" @close="pendingImport = null" @confirm="confirmImport">
      <p>檔案內有 {{ pendingImport?.summary?.accounts || 0 }} 個帳戶、{{ pendingImport?.summary?.holdings || 0 }} 筆持倉、{{ pendingImport?.summary?.stockBuyListItems || 0 }} 檔待買股票、{{ pendingImport?.summary?.recurringCashflowItems || 0 }} 筆週期收支、{{ pendingImport?.summary?.snapshots || 0 }} 筆盤點。</p>
      <p v-if="pendingImport?.changes?.length">與目前瀏覽器資料相比，會產生 {{ pendingImport.changes.length }} 項變更。</p>
      <p v-else>檔案內容與目前瀏覽器資料沒有實質差異。</p>
      <AppNotice v-if="pendingImport && !pendingImport.hasUserData" tone="warning" title="這份檔案沒有使用者資料">復原後會只剩下系統預設帳戶，請確認這是你要的版本。</AppNotice>
      <p>確認前，原本的瀏覽器資料會先保留在近期版本；不會與檔案建立長期連結。</p>
    </ConfirmDialog>

    <ConfirmDialog :open="Boolean(pendingSyncImport)" :title="`從「${pendingSyncImport?.fileName || '同步檔案'}」更新？`" confirm-label="使用同步檔案" tone="warning" :busy="store.saving" @close="pendingSyncImport = null" @confirm="confirmSyncImport">
      <p>同步檔案內有 {{ pendingSyncImport?.summary?.accounts || 0 }} 個帳戶、{{ pendingSyncImport?.summary?.holdings || 0 }} 筆持倉、{{ pendingSyncImport?.summary?.stockBuyListItems || 0 }} 檔待買股票、{{ pendingSyncImport?.summary?.snapshots || 0 }} 筆盤點。</p>
      <p v-if="pendingSyncImport?.changes?.length">套用後會產生 {{ pendingSyncImport.changes.length }} 項資料變更；檔案更新時間為 {{ formatDate(pendingSyncImport.updatedAt) }}。</p>
      <p v-else>同步檔案與目前瀏覽器資料沒有實質差異。</p>
      <AppNotice v-if="pendingSyncImport && !pendingSyncImport.hasUserData" tone="warning" title="同步檔案沒有使用者資料">套用後會只剩系統預設帳戶，請確認這是你要的版本。</AppNotice>
      <p>套用前會先保留目前瀏覽器版本，且不會自動修改同步檔案。</p>
    </ConfirmDialog>

    <ConfirmDialog :open="Boolean(pendingSyncConflict)" title="本機與同步檔案都有變更" confirm-label="仍以上傳覆蓋" tone="warning" :busy="store.saving" @close="pendingSyncConflict = null" @confirm="uploadSyncFile(true)">
      <p>「{{ pendingSyncConflict?.fileName }}」與目前瀏覽器內容不同，檔案更新時間為 {{ formatDate(pendingSyncConflict?.remoteUpdatedAt) }}。</p>
      <p>直接上傳會以目前瀏覽器資料覆蓋該版本。若不確定，請取消後先使用「從同步檔案更新」查看內容。</p>
    </ConfirmDialog>

    <ConfirmDialog :open="pendingReset" title="確定要重設所有資料？" confirm-label="確認重設" :busy="store.saving" @close="pendingReset = false" @confirm="resetAllData">
      <p>目前的帳戶、持倉、待買股票、盤點、現金驗算與週期收支都會清空，系統會回到初始狀態。</p>
      <p><strong>重設前的內容會先保留在近期版本</strong>，之後仍可從上方的「瀏覽器近期版本」復原。</p>
      <p>「變更尚未備份」狀態也會清除；電腦上的 JSON 與同步檔案不會被刪除，既有同步連結也會保留。</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.settings-section { margin-top: 18px; }
.feature-panel { margin-bottom: 18px; }
.feature-setting { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.feature-setting__icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--surface); color: var(--primary); box-shadow: 0 3px 10px rgba(19, 72, 66, .06); }
.feature-setting__copy { display: grid; gap: 3px; min-width: 0; }
.feature-setting__copy strong { font-size: .88rem; }
.feature-setting__copy span, .feature-setting__copy small { color: var(--muted); font-size: .77rem; line-height: 1.5; }
.feature-switch { position: relative; width: 48px; height: 28px; padding: 3px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--neutral-soft); cursor: pointer; transition: background-color .18s ease, border-color .18s ease; }
.feature-switch span { display: block; width: 20px; height: 20px; border-radius: 50%; background: var(--surface); box-shadow: 0 2px 6px rgba(15, 50, 47, .2); transition: transform .18s ease; }
.feature-switch[aria-checked="true"] { border-color: var(--primary); background: var(--primary); }
.feature-switch[aria-checked="true"] span { transform: translateX(18px); }
.feature-switch:disabled { cursor: not-allowed; opacity: .55; }
.danger-zone { border-color: var(--danger-border); }
.danger-zone :deep(.panel__action) { color: var(--danger); }
.danger-zone__description { margin: 0 0 12px; color: var(--muted); font-size: .78rem; line-height: 1.55; }
.storage-panel :deep(.panel__header) { flex-wrap: wrap; }
.storage-panel :deep(.panel__body) { display: grid; gap: 14px; }
.storage-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 12px; }
.storage-status-card { min-height: 104px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 20px; align-items: start; gap: 12px; padding: 15px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.storage-status-card--browser, .storage-status-card--current { background: linear-gradient(145deg, var(--primary-soft), var(--surface)); border-color: var(--notice-border); }
.storage-status-card--pending { background: var(--warning-soft); border-color: var(--warning-border); }
.storage-status-card__icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--surface); color: var(--primary); box-shadow: 0 3px 10px rgba(19, 72, 66, .06); }
.storage-status-card__copy { min-width: 0; }
.storage-status-card strong, .storage-status-card span { display: block; }
.storage-status-card strong { font-size: .86rem; line-height: 1.4; }
.storage-status-card span { margin-top: 5px; overflow-wrap: anywhere; color: var(--muted); font-size: .78rem; line-height: 1.5; }
.storage-status-card__state { margin-top: 10px; color: var(--primary); }
.storage-status-card--pending .storage-status-card__state { color: var(--warning); }
.pill-warning { background: var(--warning-soft); color: var(--warning); }
.pending-change-list { display: grid; gap: 4px; margin: 0; padding-left: 18px; overflow-wrap: anywhere; }
.backup-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.backup-action-note { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: .77rem; line-height: 1.5; }
.sync-panel :deep(.panel__header) { flex-wrap: wrap; }
.sync-panel :deep(.panel__body) { display: grid; gap: 14px; }
.sync-connect-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.sync-status-card { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 15px; border: 1px solid var(--notice-border); border-radius: var(--radius-md); background: linear-gradient(145deg, var(--primary-soft), var(--surface)); }
.sync-status-card__icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; background: var(--surface); color: var(--primary); box-shadow: 0 3px 10px rgba(19, 72, 66, .06); }
.sync-status-card__copy { display: grid; gap: 3px; min-width: 0; }
.sync-status-card__copy strong { overflow-wrap: anywhere; font-size: .88rem; }
.sync-status-card__copy span, .sync-status-card__copy small { color: var(--muted); font-size: .76rem; line-height: 1.45; }
.sync-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; }
.technical-details { border-top: 1px solid var(--border); padding-top: 10px; }
.technical-details summary { width: fit-content; color: var(--muted); cursor: pointer; font-size: .78rem; font-weight: 700; }
.technical-details[open] summary { margin-bottom: 9px; color: var(--text-soft); }
.storage-origin { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 9px; padding: 9px 11px; border-radius: 10px; background: var(--surface-muted); color: var(--muted); font-size: .77rem; }
.storage-origin strong { color: var(--text-soft); }
.storage-origin code { max-width: 100%; padding: 2px 6px; overflow-wrap: anywhere; border-radius: 6px; background: var(--surface); color: var(--primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: normal; }
.storage-origin span { flex-basis: 100%; }
.backup-panel-action { display: flex; align-items: center; justify-content: flex-end; gap: 8px; color: var(--muted); }
.history-details { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.history-summary { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; cursor: pointer; color: var(--text-soft); font-size: .8rem; font-weight: 720; list-style: none; }
.history-summary span { min-width: 0; overflow-wrap: anywhere; }
.history-summary::-webkit-details-marker { display: none; }
.history-summary svg { transition: transform .18s ease; }
.history-details[open] .history-summary svg { transform: rotate(180deg); }
.backup-list { display: grid; gap: 10px; padding: 0 12px 12px; }
.backup-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.backup-item__copy { display: grid; gap: 3px; min-width: 0; }
.backup-item__copy strong { font-size: .86rem; }
.backup-item__copy span, .backup-item__copy small { color: var(--muted); font-size: .75rem; }
.backup-version-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
.backup-version-tags .pill { min-height: 24px; padding: 2px 7px; font-size: .75rem; }
.backup-changes { margin-top: 4px; color: var(--text-soft); font-size: .75rem; }
.backup-changes summary { width: fit-content; cursor: pointer; color: var(--primary); font-weight: 700; }
.backup-changes ul { display: grid; gap: 4px; margin: 7px 0 2px; padding-left: 18px; color: var(--muted); line-height: 1.45; }
.backup-changes p { margin: 7px 0 2px; color: var(--muted); line-height: 1.45; }
.backup-confirm { grid-column: 1 / -1; }
.confirm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 620px) {
  .feature-panel :deep(.panel__header) { flex-direction: column; }
  .feature-panel :deep(.panel__action) { width: 100%; justify-content: flex-start; }
  .feature-setting { grid-template-columns: 42px minmax(0, 1fr); align-items: start; }
  .feature-switch { grid-column: 1 / -1; justify-self: end; margin-top: -4px; }
  .storage-panel :deep(.panel__action) { width: 100%; justify-content: flex-start; }
  .backup-actions, .backup-item, .sync-connect-actions, .sync-actions { grid-template-columns: 1fr; }
  .backup-actions .btn, .sync-connect-actions .btn, .sync-actions .btn { width: 100%; }
  .sync-panel :deep(.panel__action) { width: 100%; justify-content: flex-start; }
  .sync-status-card { grid-template-columns: 42px minmax(0, 1fr); align-items: start; }
  .sync-status-card > .pill { grid-column: 1 / -1; justify-self: start; }
  .backup-item > .btn { width: 100%; }
  .confirm-actions { flex-direction: column; }
}
</style>
