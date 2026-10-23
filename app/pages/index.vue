<script setup>
import { AlertCircle, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, EyeOff, Landmark, Trash2, TrendingUp, TriangleAlert, Wallet } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'
import { calculateLeverageSignal } from '~/services/money-domain'

const store = useMoneyStore()
const { showToast } = useToast()
const { isDark } = useTheme()
const chartColors = computed(() => isDark.value
  ? { cash: '#70d3c6', stocks: '#62d9c9', bonds: '#77c9ee', other: '#829b97', debt: '#ff9188', stockAlt: '#49bfb5', market: '#77c9ee', ma: '#f0bf68', fill: 'rgba(98,217,201,.14)' }
  : { cash: '#5bb9ad', stocks: '#0f766e', bonds: '#0369a1', other: '#9db7b2', debt: '#d77a70', stockAlt: '#0ea5a4', market: '#0369a1', ma: '#d18432', fill: 'rgba(15,118,110,.12)' })
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const number = (value) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(Number(value) || 0)
const percent = (value) => value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`
const leverage = (value) => value == null ? '—' : `${Number(value).toFixed(2)}×`
const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未完成驗算'
const pendingDeleteDate = ref('')
const hideAmounts = ref(false)
const selectedRecordYear = ref('')
const selectedRecordDate = ref('')
const displayMoney = (value) => hideAmounts.value ? 'NT$ ******' : money(value)
const compactCellMoney = (value) => {
  if (hideAmounts.value) return '****'
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 10000) {
    const wan = amount / 10000
    return `${wan.toLocaleString('zh-TW', { maximumFractionDigits: wan % 1 === 0 ? 0 : 1 })}萬`
  }
  return amount.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

const chartSnapshots = computed(() => {
  const limit = store.config?.settings?.snapshotDisplayLimit || 30
  return store.snapshots.slice(-limit)
})
const hasTrendData = computed(() => chartSnapshots.value.length >= 2)
const hasSnapshotData = computed(() => chartSnapshots.value.length >= 1)
const hasAllocationData = computed(() => Number(store.summary?.totalAssets) > 0 || Number(store.summary?.totalLiabilities) > 0)
const availableCashAssetRatio = computed(() => Number(store.summary?.totalAssets) ? Number(store.summary?.availableCash || 0) / Number(store.summary.totalAssets) : 0)
const hasStockHoldings = computed(() => Number(store.summary?.totalStocks) > 0)
const leverageSignal = computed(() => calculateLeverageSignal(store.config))
const signalIcon = computed(() => ({ normal: CheckCircle2, warning: TriangleAlert, danger: AlertCircle, idle: Clock3 }[leverageSignal.value.level]))
const editingThresholds = ref(false)
const thresholdError = ref('')
const thresholdDraft = reactive({ warning: 80, danger: 100 })

function editThresholds() {
  Object.assign(thresholdDraft, { warning: leverageSignal.value.exposureWarningPercent, danger: leverageSignal.value.exposureDangerPercent })
  thresholdError.value = ''
  editingThresholds.value = true
}

async function saveThresholds() {
  const warning = Number(thresholdDraft.warning)
  const danger = Number(thresholdDraft.danger)
  if (!Number.isFinite(warning) || !Number.isFinite(danger) || warning <= 0 || warning >= danger || danger > 1000) {
    thresholdError.value = '警戒線須大於 0%、低於高度警戒線，且高度警戒線不得超過 1000%。'
    return
  }
  try {
    await store.updateSettings({ exposureWarningPercent: warning, exposureDangerPercent: danger })
    editingThresholds.value = false
    showToast({ tone: 'success', title: '槓桿警戒線已保存' })
  } catch (error) {
    store.error = ''
    thresholdError.value = error?.message || '無法保存警戒線，請再試一次。'
  }
}
const recordYears = computed(() => [...new Set(store.snapshots
  .map((record) => String(record.date || '').slice(0, 4))
  .filter((year) => /^\d{4}$/.test(year)))].sort((left, right) => right.localeCompare(left)))
const selectedRecordYearIndex = computed(() => recordYears.value.indexOf(selectedRecordYear.value))
const selectedYearRecords = computed(() => store.snapshots
  .filter((record) => String(record.date || '').startsWith(`${selectedRecordYear.value}-`))
  .slice()
  .reverse())
const monthSlots = computed(() => {
  const slots = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, records: [] }))
  for (const record of selectedYearRecords.value) {
    const month = Number(String(record.date || '').slice(5, 7))
    if (month >= 1 && month <= 12) slots[month - 1].records.push(record)
  }
  return slots
})
const selectedRecord = computed(() => selectedYearRecords.value.find((record) => record.date === selectedRecordDate.value)
  || selectedYearRecords.value[0]
  || null)
const selectedMonthRecordCount = computed(() => {
  if (!selectedRecord.value) return 0
  const month = Number(String(selectedRecord.value.date).slice(5, 7))
  return monthSlots.value[month - 1]?.records.length || 0
})
const pendingDeleteRecord = computed(() => store.snapshots.find((record) => record.date === pendingDeleteDate.value) || null)

watch(recordYears, (years) => {
  if (!years.includes(selectedRecordYear.value)) selectedRecordYear.value = years[0] || ''
}, { immediate: true })

watch(selectedYearRecords, (records) => {
  if (!records.some((record) => record.date === selectedRecordDate.value)) {
    selectedRecordDate.value = records[0]?.date || ''
  }
}, { immediate: true })

function moveRecordYear(direction) {
  const target = recordYears.value[selectedRecordYearIndex.value + direction]
  if (target) selectedRecordYear.value = target
}

function selectMonthSlot(slot) {
  if (!slot.records.length) return
  selectedRecordDate.value = slot.records[0].date
}

function cycleMonthRecord(date) {
  const month = Number(String(date || '').slice(5, 7))
  const records = monthSlots.value[month - 1]?.records || []
  if (records.length < 2) return
  const index = records.findIndex((record) => record.date === date)
  selectedRecordDate.value = records[(index + 1) % records.length].date
}

async function confirmDeleteSnapshot() {
  if (!pendingDeleteRecord.value) return
  const snapshotDate = pendingDeleteRecord.value.date
  try {
    await store.deleteSnapshot(snapshotDate)
    pendingDeleteDate.value = ''
    showToast({ tone: 'success', title: '盤點紀錄已刪除', message: `已刪除 ${snapshotDate} 的盤點紀錄。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '盤點紀錄刪除失敗', message: error?.message || '無法刪除這筆盤點紀錄。' })
  }
}
const labels = computed(() => chartSnapshots.value.map((item) => item.date.slice(5)))
const netWorthData = computed(() => ({
  labels: labels.value,
  datasets: [{ label: '淨資產', data: chartSnapshots.value.map((item) => item.netWorth), borderColor: chartColors.value.stocks, backgroundColor: chartColors.value.fill, fill: true, tension: .32 }]
}))
function normalized(key) {
  const first = chartSnapshots.value.find((item) => Number(item[key]) > 0)?.[key]
  return chartSnapshots.value.map((item) => first ? Number(((item[key] / first) * 100).toFixed(2)) : null)
}
const benchmarkData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: '淨資產（起點=100）', data: normalized('netWorth'), borderColor: chartColors.value.stocks, tension: .3 },
    { label: '股票資產（起點=100）', data: normalized('totalStocks'), borderColor: chartColors.value.stockAlt, tension: .3 },
    { label: '加權指數（起點=100）', data: normalized('taiex'), borderColor: chartColors.value.market, tension: .3 }
  ]
}))
const marketData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: '加權指數', data: chartSnapshots.value.map((item) => item.taiex), borderColor: chartColors.value.market, tension: .28 },
    { label: '240MA', data: chartSnapshots.value.map((item) => item.ma240), borderColor: chartColors.value.ma, borderDash: [6, 5], tension: .2 }
  ]
}))
</script>

<template>
  <div>
    <PageHeader eyebrow="Portfolio overview" title="資產總覽" description="用一致的口徑掌握資產位置，從今天的數字一路看見長期變化。">
      <template #actions>
        <div class="dashboard-actions">
          <button class="btn btn-secondary privacy-toggle" type="button" :aria-pressed="hideAmounts" :title="hideAmounts ? '顯示所有金額' : '隱藏所有金額，方便截圖'" @click="hideAmounts = !hideAmounts">
            <Eye v-if="hideAmounts" :size="18" aria-hidden="true" />
            <EyeOff v-else :size="18" aria-hidden="true" />
            {{ hideAmounts ? '顯示金額' : '隱藏金額' }}
          </button>
          <NuxtLink to="/snapshot" class="btn btn-primary">開始今日盤點</NuxtLink>
        </div>
      </template>
    </PageHeader>

    <template v-if="store.loading">
      <div class="skeleton overview-summary-skeleton" />
    </template>
    <template v-else>
      <section class="overview-summary" aria-label="資產摘要">
        <div class="overview-net-worth">
          <div class="overview-net-worth__label"><Wallet :size="18" aria-hidden="true" /><span>已登錄淨資產</span></div>
          <strong>{{ displayMoney(store.summary?.netWorth) }}</strong>
          <span>總資產 {{ displayMoney(store.summary?.totalAssets) }} · 負債 {{ displayMoney(store.summary?.totalLiabilities) }}</span>
        </div>
        <div class="overview-facts">
          <div class="overview-fact"><div><Banknote :size="16" aria-hidden="true" /><span>可動用現金</span></div><strong>{{ displayMoney(store.summary?.availableCash) }}</strong><small>{{ (availableCashAssetRatio * 100).toFixed(1) }}% 總資產<span v-if="store.summary?.reservedCash"> · 保留款淨額 {{ displayMoney(store.summary.reservedCash) }}</span></small></div>
          <div class="overview-fact"><div><TrendingUp :size="16" aria-hidden="true" /><span>持有股票</span></div><strong>{{ displayMoney(store.summary?.totalStocks) }}</strong><small>{{ ((store.summary?.stockRatio || 0) * 100).toFixed(1) }}% 總資產</small></div>
          <div class="overview-fact"><div><Landmark :size="16" aria-hidden="true" /><span>持有債券</span></div><strong>{{ displayMoney(store.summary?.totalBonds) }}</strong><small>{{ ((store.summary?.bondRatio || 0) * 100).toFixed(1) }}% 總資產</small></div>
          <div class="overview-fact overview-fact--date"><div><Clock3 :size="16" aria-hidden="true" /><span>上次資產盤點</span></div><strong>{{ dateTime(store.lastSnapshot?.verifiedAt) }}</strong><small>以最近保存的快照為準</small></div>
        </div>
      </section>

      <UiPanel class="space-before allocation-panel" title="槓桿訊號" compact>
        <template #action><button class="btn btn-secondary signal-settings-button" type="button" :aria-expanded="editingThresholds" aria-controls="exposure-thresholds" @click="editingThresholds ? editingThresholds = false : editThresholds()">{{ editingThresholds ? '收起設定' : '調整警戒線' }}</button></template>
        <div class="leverage-signal" :class="`leverage-signal--${leverageSignal.level}`" role="status" aria-live="polite" aria-atomic="true">
          <div class="leverage-signal__main" :title="leverageSignal.reason">
            <component :is="signalIcon" :size="20" aria-hidden="true" />
            <strong>{{ leverageSignal.label }}</strong>
          </div>
          <div class="leverage-signal__value"><span>股票總曝險</span><strong>{{ percent(leverageSignal.ratio) }}</strong></div>
          <span class="leverage-signal__thresholds">警戒 {{ leverageSignal.exposureWarningPercent }}% · 高度警戒 {{ leverageSignal.exposureDangerPercent }}%</span>
        </div>
        <form v-if="editingThresholds" id="exposure-thresholds" class="signal-settings" @submit.prevent="saveThresholds">
          <div class="field"><label for="exposure-warning">警戒線（%）</label><input id="exposure-warning" v-model="thresholdDraft.warning" class="input" type="number" min="0.1" max="999.9" step="any" required :disabled="store.saving" :aria-invalid="Boolean(thresholdError)" aria-describedby="exposure-threshold-note" /></div>
          <div class="field"><label for="exposure-danger">高度警戒線（%）</label><input id="exposure-danger" v-model="thresholdDraft.danger" class="input" type="number" min="0.1" max="1000" step="any" required :disabled="store.saving" :aria-invalid="Boolean(thresholdError)" aria-describedby="exposure-threshold-note" /></div>
          <div class="signal-settings__actions"><button class="btn btn-primary" type="submit" :disabled="store.saving">{{ store.saving ? '保存中…' : '保存門檻' }}</button><button class="btn btn-secondary" type="button" :disabled="store.saving" @click="editingThresholds = false">取消</button></div>
          <p id="exposure-threshold-note" class="signal-settings__note">這是你自訂的提醒門檻，可隨資金用途調整。</p>
          <p v-if="thresholdError" class="signal-settings__error" role="alert">{{ thresholdError }}</p>
        </form>
        <div class="exposure-grid">
          <section class="exposure-metric" aria-labelledby="stock-exposure-title">
            <h3 id="stock-exposure-title" title="股票淨曝險 ÷ 已登錄淨資產">股票淨曝險</h3>
            <strong :class="{ negative: store.summary?.stockExposureRatio < 0 }">{{ percent(store.summary?.stockExposureRatio) }}</strong>
          </section>
          <section class="exposure-metric" aria-labelledby="double-leveraged-title">
            <h3 id="double-leveraged-title" title="正二部位市值 ÷ 已登錄淨資產">正二占比</h3>
            <strong>{{ percent(store.summary?.doubleLeveragedStockRatio) }}</strong>
          </section>
          <section class="exposure-metric" aria-labelledby="stock-leverage-title">
            <h3 id="stock-leverage-title" title="股票商品平均槓桿：股票淨曝險 ÷ 股票市值">商品平均槓桿</h3>
            <strong :class="{ negative: store.summary?.stockPositionLeverage < 0 }">{{ leverage(store.summary?.stockPositionLeverage) }}</strong>
          </section>
        </div>
        <div class="exposure-footer">
          <p class="exposure-basis">已登錄淨資產 <strong>{{ displayMoney(store.summary?.netWorth) }}</strong></p>
          <p class="signal-scope">自訂門檻 · 不含收支與債券風險</p>
        </div>
        <AppNotice v-if="Number(store.summary?.netWorth) <= 0" title="淨資產須大於 0 才能計算比例">股票淨曝險比例與正二占比暫以「—」顯示。</AppNotice>
        <AppNotice v-else-if="!hasStockHoldings" title="目前沒有股票持倉">新增股票或股票 ETF 後，這裡會自動彙整曝險與商品槓桿。</AppNotice>
      </UiPanel>

      <AppNotice v-if="store.snapshots.length < 2" title="趨勢資料還在累積" class="space-before">完成至少兩次不同日期的盤點後，圖表就會開始有意義；現在可以先建立第一個基準點。</AppNotice>

      <UiPanel v-if="!hasSnapshotData && !hasAllocationData" class="space-before">
        <EmptyState title="還沒有可繪製的資產資料" description="先完成帳戶設定與第一份資產盤點；累積兩個不同日期後，這裡會顯示趨勢與市場比較。">
          <template #action><NuxtLink to="/snapshot" class="btn btn-primary">建立第一份盤點</NuxtLink></template>
        </EmptyState>
      </UiPanel>

      <section v-else class="charts-grid" aria-label="資產圖表與盤點紀錄">
        <UiPanel v-if="hasTrendData" class="chart-panel" title="淨資產趨勢" :description="`最近 ${chartSnapshots.length} 筆盤點`">
          <ClientOnly><AppChart :data="netWorthData" label="淨資產歷史趨勢折線圖" :privacy="hideAmounts" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="資產盤點與大盤對照" description="各自以第一筆有效資料設為 100，觀察盤點資產與大盤的相對變化">
          <ClientOnly><AppChart :data="benchmarkData" label="淨資產、股票資產與加權指數標準化比較圖" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="盤點當下的加權指數與 240MA" description="每個點都來自該次資產盤點保存的市場數字">
          <ClientOnly><AppChart :data="marketData" label="加權指數與 240 日均線比較圖" /></ClientOnly>
        </UiPanel>
        <UiPanel
          v-if="hasSnapshotData"
          class="chart-panel market-history-panel"
          title="盤點與大盤紀錄"
          :description="selectedRecordYear ? `${selectedRecordYear} 年 · 點月份查看` : '完成盤點後會顯示在這裡'"
        >
          <template v-if="recordYears.length" #action>
            <div class="year-pager" aria-label="切換盤點紀錄年份">
              <button class="year-pager__button" type="button" :disabled="selectedRecordYearIndex >= recordYears.length - 1" aria-label="查看上一個年度" @click="moveRecordYear(1)"><ChevronLeft :size="15" aria-hidden="true" /></button>
              <strong aria-live="polite">{{ selectedRecordYear }}</strong>
              <span>{{ selectedRecordYearIndex + 1 }}/{{ recordYears.length }}</span>
              <button class="year-pager__button" type="button" :disabled="selectedRecordYearIndex <= 0" aria-label="查看下一個年度" @click="moveRecordYear(-1)"><ChevronRight :size="15" aria-hidden="true" /></button>
            </div>
          </template>
          <div class="month-board" :aria-label="`${selectedRecordYear} 年盤點月份`">
            <button
              v-for="slot in monthSlots"
              :key="slot.month"
              type="button"
              class="month-cell"
              :class="{
                'month-cell--empty': !slot.records.length,
                'month-cell--active': selectedRecord && slot.records.some((record) => record.date === selectedRecord.date)
              }"
              :disabled="!slot.records.length"
              :aria-pressed="Boolean(selectedRecord && slot.records.some((record) => record.date === selectedRecord.date))"
              @click="selectMonthSlot(slot)"
            >
              <span>{{ slot.month }}月</span>
              <strong v-if="slot.records.length">{{ compactCellMoney(slot.records[0].netWorth) }}</strong>
              <em v-else>—</em>
              <small v-if="slot.records.length > 1">{{ slot.records.length }} 筆</small>
            </button>
          </div>
          <div v-if="selectedRecord" class="record-detail">
            <div class="record-detail__copy">
              <strong>{{ selectedRecord.date }}</strong>
              <span>淨資產 {{ displayMoney(selectedRecord.netWorth) }}</span>
              <span>加權 {{ number(selectedRecord.taiex) }} · 240MA {{ number(selectedRecord.ma240) }}</span>
            </div>
            <div class="record-detail__actions">
              <button
                v-if="selectedMonthRecordCount > 1"
                class="btn btn-ghost"
                type="button"
                @click="cycleMonthRecord(selectedRecord.date)"
              >
                同月下一筆
              </button>
              <button class="btn btn-ghost btn-icon" type="button" :aria-label="`刪除 ${selectedRecord.date} 的盤點紀錄`" @click="pendingDeleteDate = selectedRecord.date"><Trash2 :size="16" aria-hidden="true" /></button>
            </div>
          </div>
          <p v-else class="record-detail-empty">這個年份還沒有可選的盤點紀錄。</p>
        </UiPanel>
      </section>
    </template>
    <ConfirmDialog :open="Boolean(pendingDeleteRecord)" title="刪除這筆盤點紀錄？" confirm-label="確認刪除" :busy="store.saving" @close="pendingDeleteDate = ''" @confirm="confirmDeleteSnapshot">
      <p><strong>{{ pendingDeleteRecord?.date }} 的資產盤點</strong></p>
      <p>只會刪除這筆歷史快照與當時的大盤紀錄，不會修改目前帳戶、現金明細或投資持倉。</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.dashboard-actions { display: flex; align-items: center; justify-content: flex-end; gap: 9px; flex-wrap: wrap; }
.privacy-toggle { min-width: 124px; }
.overview-summary-skeleton { height: 184px; }
.overview-summary { display: grid; grid-template-columns: minmax(270px, .82fr) minmax(0, 1.8fr); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-glass); box-shadow: var(--shadow-sm); }
.overview-net-worth { display: flex; flex-direction: column; justify-content: center; min-height: 174px; padding: 22px 24px; background: linear-gradient(145deg, var(--metric-start), var(--metric-end)); color: white; }
.overview-net-worth__label { display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,.74); font-size: .78rem; font-weight: 720; }
.overview-net-worth > strong { margin-top: 14px; font-size: clamp(1.65rem, 3vw, 2.35rem); line-height: 1.05; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.overview-net-worth > span { margin-top: 9px; color: rgba(255,255,255,.78); font-size: .76rem; line-height: 1.45; }
.overview-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.overview-fact { min-width: 0; padding: 16px 18px; border-bottom: 1px solid var(--border); border-left: 1px solid var(--border); }
.overview-fact:nth-child(n + 3) { border-bottom: 0; }
.overview-fact > div { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: .78rem; font-weight: 720; }
.overview-fact > strong { display: block; overflow-wrap: anywhere; margin-top: 8px; color: var(--text); font-size: 1.08rem; font-variant-numeric: tabular-nums; }
.overview-fact > small { display: block; margin-top: 3px; color: var(--muted); font-size: .75rem; }
.overview-fact--date > strong { font-size: .88rem; line-height: 1.35; }
.allocation-panel :deep(.panel__header) { align-items: center; padding: 12px 16px 0; }
.allocation-panel :deep(.section-title) { margin: 0; font-size: .9rem; }
.allocation-panel :deep(.panel__body) { padding: 10px 16px 12px; }
.signal-settings-button { min-height: 28px; padding: 3px 8px; font-size: .7rem; }
.leverage-signal { display: flex; align-items: center; gap: 20px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--muted); background: var(--surface-muted); }
.leverage-signal--normal { color: var(--success); background: var(--success-soft); border-color: var(--success-border); }
.leverage-signal--warning { color: var(--warning); background: var(--warning-soft); border-color: var(--warning-border); }
.leverage-signal--danger { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
.leverage-signal__main { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.leverage-signal__main > svg { flex-shrink: 0; }
.leverage-signal__main strong { font-size: 1rem; line-height: 1.3; white-space: nowrap; }
.leverage-signal__value { display: flex; align-items: baseline; gap: 8px; flex-shrink: 0; }
.leverage-signal__value span { color: var(--text-soft); font-size: .72rem; }
.leverage-signal__value strong { font-size: 1.25rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.leverage-signal__thresholds { color: var(--text-soft); font-size: .7rem; line-height: 1.5; }
.signal-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; align-items: end; gap: 10px; padding: 12px; margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.signal-settings__actions { display: flex; gap: 7px; }
.signal-settings__note, .signal-settings__error { grid-column: 1 / -1; margin: 0; font-size: .75rem; line-height: 1.5; }
.signal-settings__note { color: var(--muted); }
.signal-settings__error { color: var(--danger); }
.signal-scope { margin: 0; color: var(--muted); font-size: .68rem; line-height: 1.6; }
.exposure-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; }
.exposure-metric { min-width: 0; padding: 0 16px; border-left: 1px solid var(--border); }
.exposure-metric:first-child { padding-left: 0; border-left: 0; }
.exposure-metric:last-child { padding-right: 0; }
.exposure-metric h3 { margin: 0; color: var(--muted); font-size: .72rem; font-weight: 650; }
.exposure-metric > strong { display: block; margin-top: 5px; color: var(--text); font-size: 1.35rem; line-height: 1.2; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
.exposure-metric > strong.negative { color: var(--danger); }
.exposure-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--border); }
.exposure-basis { margin: 0; color: var(--muted); font-size: .68rem; line-height: 1.6; }
.exposure-basis strong { color: var(--text-soft); font-weight: 650; font-variant-numeric: tabular-nums; }
.market-history-panel :deep(.panel__body) { display: grid; gap: 12px; }
.year-pager { display: grid; grid-template-columns: 28px auto auto 28px; align-items: center; gap: 4px; min-height: 28px; padding: 1px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-muted); }
.year-pager strong { color: var(--text); font-size: .74rem; white-space: nowrap; }
.year-pager > span { color: var(--muted); font-size: .68rem; white-space: nowrap; }
.year-pager__button { width: 28px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-soft); cursor: pointer; transition: background-color .18s ease, color .18s ease; }
.year-pager__button:hover:not(:disabled) { background: var(--surface); color: var(--primary); }
.year-pager__button:disabled { color: var(--muted); cursor: not-allowed; opacity: .42; }
.month-board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.month-cell { min-height: 58px; display: grid; gap: 2px; align-content: start; padding: 8px 9px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); color: var(--text); text-align: left; cursor: pointer; transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease; }
.month-cell span { color: var(--muted); font-size: .68rem; font-weight: 720; }
.month-cell strong { overflow-wrap: anywhere; color: var(--text); font-size: .78rem; font-variant-numeric: tabular-nums; line-height: 1.25; }
.month-cell em { color: var(--muted); font-size: .78rem; font-style: normal; }
.month-cell small { color: var(--primary); font-size: .64rem; font-weight: 700; }
.month-cell--empty { cursor: default; opacity: .55; }
.month-cell--active { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 2px var(--control-ring); }
.month-cell:hover:not(:disabled) { border-color: var(--control-hover-border); }
.record-detail { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); }
.record-detail__copy { display: grid; gap: 3px; min-width: 0; }
.record-detail__copy strong { font-size: .8rem; }
.record-detail__copy span { color: var(--muted); font-size: .72rem; line-height: 1.4; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.record-detail__actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.record-detail__actions .btn-ghost:not(.btn-icon) { min-height: 30px; padding: 4px 8px; font-size: .72rem; }
.record-detail__actions .btn-icon { color: var(--muted); }
.record-detail__actions .btn-icon:hover { background: var(--danger-soft); color: var(--danger); }
.record-detail-empty { margin: 0; color: var(--muted); font-size: .76rem; }
@media (max-width: 620px) {
  .dashboard-actions { width: 100%; }
  .dashboard-actions .btn { flex: 1; }
  .overview-summary { grid-template-columns: 1fr; }
  .overview-net-worth { min-height: 138px; padding: 18px; }
  .overview-fact { padding: 13px 14px; }
  .overview-fact:nth-child(odd) { border-left: 0; }
  .exposure-metric { padding: 0 8px; }
  .exposure-metric h3 { font-size: .68rem; }
  .exposure-metric > strong { font-size: 1.2rem; }
  .leverage-signal { flex-wrap: wrap; gap: 7px 10px; }
  .leverage-signal__main strong { font-size: .9rem; }
  .leverage-signal__value { gap: 5px; }
  .leverage-signal__value span { font-size: .66rem; }
  .leverage-signal__value strong { font-size: 1.15rem; }
  .leverage-signal__thresholds { flex-basis: 100%; font-size: .66rem; }
  .signal-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .signal-settings__actions { grid-column: 1 / -1; }
  .month-board { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .record-detail { flex-direction: column; }
  .market-history-panel :deep(.panel__header) { flex-direction: column; }
  .market-history-panel :deep(.panel__action) { width: 100%; justify-content: flex-start; }
}
</style>
