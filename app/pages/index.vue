<script setup>
import { Banknote, ChevronLeft, ChevronRight, Clock3, Eye, EyeOff, Landmark, Trash2, TrendingUp, Wallet } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const { isDark } = useTheme()
const chartColors = computed(() => isDark.value
  ? { cash: '#70d3c6', stocks: '#62d9c9', bonds: '#77c9ee', other: '#829b97', debt: '#ff9188', stockAlt: '#49bfb5', market: '#77c9ee', ma: '#f0bf68', fill: 'rgba(98,217,201,.14)' }
  : { cash: '#5bb9ad', stocks: '#0f766e', bonds: '#0369a1', other: '#9db7b2', debt: '#d77a70', stockAlt: '#0ea5a4', market: '#0369a1', ma: '#d18432', fill: 'rgba(15,118,110,.12)' })
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const number = (value) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(Number(value) || 0)
const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未完成驗算'
const pendingDeleteDate = ref('')
const hideAmounts = ref(false)
const selectedRecordYear = ref('')
const displayMoney = (value) => hideAmounts.value ? 'NT$ ******' : money(value)

const chartSnapshots = computed(() => {
  const limit = store.config?.settings?.snapshotDisplayLimit || 30
  return store.snapshots.slice(-limit)
})
const hasTrendData = computed(() => chartSnapshots.value.length >= 2)
const hasSnapshotData = computed(() => chartSnapshots.value.length >= 1)
const hasAllocationData = computed(() => Number(store.summary?.totalAssets) > 0 || Number(store.summary?.totalLiabilities) > 0)
const allocationBase = computed(() => Number(store.summary?.availableCash || 0) + Number(store.summary?.totalStocks || 0) + Number(store.summary?.totalBonds || 0))
const investedAmount = computed(() => Number(store.summary?.totalStocks || 0) + Number(store.summary?.totalBonds || 0))
const investmentExposure = computed(() => Number(store.summary?.totalInvestmentExposure || 0))
const cashAllocationRatio = computed(() => allocationBase.value ? Number(store.summary?.availableCash || 0) / allocationBase.value : 0)
const weightedLeverage = computed(() => investedAmount.value ? investmentExposure.value / investedAmount.value : 0)
const allocationRows = computed(() => [
  { key: 'cash', label: '可動用現金', current: Number(store.summary?.availableCash || 0), exposure: null, color: chartColors.value.cash },
  { key: 'stocks', label: '股票市值', current: Number(store.summary?.totalStocks || 0), exposure: Number(store.summary?.totalStockExposure || 0), color: chartColors.value.stocks },
  { key: 'bonds', label: '債券市值', current: Number(store.summary?.totalBonds || 0), exposure: Number(store.summary?.totalBondExposure || 0), color: chartColors.value.bonds }
].map((row) => ({
  ...row,
  ratio: allocationBase.value ? row.current / allocationBase.value : 0,
  exposureRatio: allocationBase.value && row.exposure != null ? row.exposure / allocationBase.value : null,
  positionLeverage: row.current && row.exposure != null ? row.exposure / row.current : null
})))
const stockAllocation = computed(() => allocationRows.value.find((row) => row.key === 'stocks'))
const bondAllocation = computed(() => allocationRows.value.find((row) => row.key === 'bonds'))
const recordYears = computed(() => [...new Set(store.snapshots
  .map((record) => String(record.date || '').slice(0, 4))
  .filter((year) => /^\d{4}$/.test(year)))].sort((left, right) => right.localeCompare(left)))
const selectedRecordYearIndex = computed(() => recordYears.value.indexOf(selectedRecordYear.value))
const selectedYearRecords = computed(() => store.snapshots
  .filter((record) => String(record.date || '').startsWith(`${selectedRecordYear.value}-`))
  .slice()
  .reverse())
const pendingDeleteRecord = computed(() => store.snapshots.find((record) => record.date === pendingDeleteDate.value) || null)

watch(recordYears, (years) => {
  if (!years.includes(selectedRecordYear.value)) selectedRecordYear.value = years[0] || ''
}, { immediate: true })

function moveRecordYear(direction) {
  const target = recordYears.value[selectedRecordYearIndex.value + direction]
  if (target) selectedRecordYear.value = target
}

function compactDate(value) {
  return String(value || '').slice(5).replace('-', '/')
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
          <div class="overview-net-worth__label"><Wallet :size="18" aria-hidden="true" /><span>目前淨資產</span></div>
          <strong>{{ displayMoney(store.summary?.netWorth) }}</strong>
          <span>總資產 {{ displayMoney(store.summary?.totalAssets) }} · 負債 {{ displayMoney(store.summary?.totalLiabilities) }}</span>
        </div>
        <div class="overview-facts">
          <div class="overview-fact"><div><Banknote :size="16" aria-hidden="true" /><span>可動用現金</span></div><strong>{{ displayMoney(store.summary?.availableCash) }}</strong><small>不含受限制帳戶</small></div>
          <div class="overview-fact"><div><TrendingUp :size="16" aria-hidden="true" /><span>持有股票</span></div><strong>{{ displayMoney(store.summary?.totalStocks) }}</strong><small>{{ ((store.summary?.stockRatio || 0) * 100).toFixed(1) }}% 總資產</small></div>
          <div class="overview-fact"><div><Landmark :size="16" aria-hidden="true" /><span>持有債券</span></div><strong>{{ displayMoney(store.summary?.totalBonds) }}</strong><small>{{ ((store.summary?.bondRatio || 0) * 100).toFixed(1) }}% 總資產</small></div>
          <div class="overview-fact overview-fact--date"><div><Clock3 :size="16" aria-hidden="true" /><span>上次資產盤點</span></div><strong>{{ dateTime(store.lastSnapshot?.verifiedAt) }}</strong><small>以最近保存的快照為準</small></div>
        </div>
      </section>

      <UiPanel class="space-before allocation-panel" title="曝險比例與資金配置" description="聚焦部位加權、現金配置，以及股票的實際淨曝險。" compact>
        <div class="allocation-current">
          <div class="position-leverage-summary" :class="{ negative: weightedLeverage < 0 }">
            <div><span>部位加權</span><small>淨曝險值 ÷ 股票與債券市值</small></div>
            <strong>{{ weightedLeverage.toFixed(2) }}×</strong>
          </div>

          <div v-if="allocationBase" class="allocation-table">
            <section class="stock-allocation-row" aria-labelledby="stock-allocation-title">
              <div class="allocation-identity"><h3 id="stock-allocation-title">股票市值</h3><strong>{{ displayMoney(stockAllocation?.current) }}</strong><small>市值配置 {{ ((stockAllocation?.ratio || 0) * 100).toFixed(1) }}%</small></div>
              <div class="allocation-stat" :class="{ negative: stockAllocation?.exposureRatio < 0 }"><span>淨曝險比例</span><strong>{{ ((stockAllocation?.exposureRatio || 0) * 100).toFixed(1) }}%</strong></div>
              <div class="allocation-stat"><span>淨曝險值</span><strong>{{ displayMoney(stockAllocation?.exposure) }}</strong></div>
              <div class="allocation-stat"><span>商品加權槓桿</span><strong>{{ (stockAllocation?.positionLeverage || 0).toFixed(2) }}×</strong></div>
            </section>

            <div class="support-allocation-rows">
              <section class="support-allocation-row" aria-labelledby="cash-allocation-title"><h3 id="cash-allocation-title">可動用現金</h3><div><span>配置比例</span><strong>{{ (cashAllocationRatio * 100).toFixed(1) }}%</strong></div><div><span>投入金額</span><strong>{{ displayMoney(store.summary?.availableCash) }}</strong></div></section>
              <section class="support-allocation-row" aria-labelledby="bond-allocation-title"><h3 id="bond-allocation-title">債券市值</h3><div><span>市值配置</span><strong>{{ ((bondAllocation?.ratio || 0) * 100).toFixed(1) }}%</strong></div><div><span>目前市值</span><strong>{{ displayMoney(bondAllocation?.current) }}</strong></div></section>
            </div>
          </div>
          <AppNotice v-if="!allocationBase" title="還沒有可試算的配置">建立現金帳戶或投資持倉後，這裡會自動顯示淨曝險比例。</AppNotice>
        </div>
      </UiPanel>

      <AppNotice v-if="store.snapshots.length < 2" title="趨勢資料還在累積" class="space-before">完成至少兩次不同日期的盤點後，圖表就會開始有意義；現在可以先建立第一個基準點。</AppNotice>

      <UiPanel v-if="!hasSnapshotData && !hasAllocationData" class="space-before">
        <EmptyState title="還沒有可繪製的資產資料" description="先完成帳戶設定與第一份資產盤點；累積兩個不同日期後，這裡會顯示趨勢與市場比較。">
          <template #action><NuxtLink to="/snapshot" class="btn btn-primary">建立第一份盤點</NuxtLink></template>
        </EmptyState>
      </UiPanel>

      <section v-else class="charts-grid" aria-label="資產圖表">
        <UiPanel v-if="hasTrendData" class="chart-panel" title="淨資產趨勢" :description="`最近 ${chartSnapshots.length} 筆盤點`">
          <ClientOnly><AppChart type="line" :data="netWorthData" label="淨資產歷史趨勢折線圖" :privacy="hideAmounts" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="資產盤點與大盤對照" description="各自以第一筆有效資料設為 100，觀察盤點資產與大盤的相對變化">
          <ClientOnly><AppChart type="line" :data="benchmarkData" label="淨資產、股票資產與加權指數標準化比較圖" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="盤點當下的加權指數與 240MA" description="每個點都來自該次資產盤點保存的市場數字">
          <ClientOnly><AppChart type="line" :data="marketData" label="加權指數與 240 日均線比較圖" /></ClientOnly>
        </UiPanel>
      </section>

      <UiPanel
        class="space-before market-history-panel"
        title="盤點與大盤紀錄"
        :description="selectedRecordYear ? `${selectedRecordYear} 年共 ${selectedYearRecords.length} 筆；一次只顯示一個年度，避免紀錄持續往下延伸。` : '完成盤點後，這裡會依年份整理淨資產與大盤數字。'"
        compact
      >
        <template v-if="recordYears.length" #action>
          <div class="year-pager" aria-label="切換盤點紀錄年份">
            <button class="year-pager__button" type="button" :disabled="selectedRecordYearIndex >= recordYears.length - 1" aria-label="查看上一個年度" @click="moveRecordYear(1)"><ChevronLeft :size="17" aria-hidden="true" /></button>
            <strong aria-live="polite">{{ selectedRecordYear }} 年</strong>
            <span>{{ selectedRecordYearIndex + 1 }} / {{ recordYears.length }}</span>
            <button class="year-pager__button" type="button" :disabled="selectedRecordYearIndex <= 0" aria-label="查看下一個年度" @click="moveRecordYear(-1)"><ChevronRight :size="17" aria-hidden="true" /></button>
          </div>
        </template>
        <div v-if="hasSnapshotData" class="market-records">
          <div class="market-record market-record--header"><span>日期</span><span>淨資產</span><span>加權指數</span><span>240MA</span><span class="market-record__action-label">操作</span></div>
          <div v-for="record in selectedYearRecords" :key="record.date" class="market-record">
            <strong :title="record.date">{{ compactDate(record.date) }}</strong><span>{{ displayMoney(record.netWorth) }}</span><span>{{ number(record.taiex) }}</span><span>{{ number(record.ma240) }}</span>
            <button class="btn btn-ghost btn-icon market-record__delete" type="button" :aria-label="`刪除 ${record.date} 的盤點紀錄`" @click="pendingDeleteDate = record.date"><Trash2 :size="16" aria-hidden="true" /></button>
          </div>
        </div>
        <EmptyState v-else title="還沒有資產與大盤紀錄" description="完成第一筆資產盤點後，淨資產、加權指數與 240MA 會一起顯示在這裡。"><template #action><NuxtLink to="/snapshot" class="btn btn-secondary">前往資產盤點</NuxtLink></template></EmptyState>
      </UiPanel>
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
.allocation-current { display: grid; gap: 0; }
.position-leverage-summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 0 13px; border-bottom: 1px solid var(--border); }
.position-leverage-summary > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.position-leverage-summary span { color: var(--text-soft); font-size: .8rem; font-weight: 760; }
.position-leverage-summary small { color: var(--muted); font-size: .76rem; }
.position-leverage-summary > strong { color: var(--primary); font-size: 1.55rem; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.035em; }
.position-leverage-summary.negative > strong { color: var(--danger); }
.stock-allocation-row { display: grid; grid-template-columns: minmax(185px, 1.15fr) repeat(3, minmax(0, 1fr)); align-items: center; padding: 13px 0; border-bottom: 1px solid var(--border); }
.allocation-identity { display: grid; gap: 3px; padding-right: 16px; }
.allocation-identity h3, .support-allocation-row h3 { margin: 0; color: var(--text); font-size: .8rem; }
.allocation-identity strong { font-size: 1.08rem; font-variant-numeric: tabular-nums; }
.allocation-identity small { color: var(--muted); font-size: .75rem; }
.allocation-stat { display: grid; gap: 4px; min-width: 0; padding-left: 16px; border-left: 1px solid var(--border); }
.allocation-stat span, .support-allocation-row span { color: var(--muted); font-size: .75rem; font-weight: 700; }
.allocation-stat strong, .support-allocation-row strong { color: var(--primary); font-size: .94rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.support-allocation-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.support-allocation-row { display: grid; grid-template-columns: minmax(105px, 1fr) repeat(2, minmax(0, 1fr)); align-items: center; gap: 12px; padding-top: 13px; }
.support-allocation-row + .support-allocation-row { margin-left: 18px; padding-left: 18px; border-left: 1px solid var(--border); }
.support-allocation-row > div { display: grid; gap: 3px; min-width: 0; }
.support-allocation-row strong { color: var(--text); font-size: .85rem; }
.market-records { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); }
.year-pager { display: grid; grid-template-columns: 34px auto auto 34px; align-items: center; gap: 7px; min-height: 36px; padding: 2px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-muted); }
.year-pager strong { color: var(--text); font-size: .8rem; white-space: nowrap; }
.year-pager > span { color: var(--muted); font-size: .72rem; white-space: nowrap; }
.year-pager__button { width: 34px; height: 32px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--text-soft); cursor: pointer; transition: background-color .18s ease, color .18s ease; }
.year-pager__button:hover:not(:disabled) { background: var(--surface); color: var(--primary); }
.year-pager__button:disabled { color: var(--muted); cursor: not-allowed; opacity: .42; }
.market-record { display: grid; grid-template-columns: minmax(70px, .65fr) repeat(3, minmax(120px, .8fr)) 38px; align-items: center; gap: 14px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: .77rem; }
.market-record:last-child { border-bottom: 0; }
.market-record > :not(:first-child, .market-record__delete) { text-align: right; font-variant-numeric: tabular-nums; }
.market-record--header { background: var(--surface-muted); color: var(--muted); font-weight: 720; }
.market-record__action-label { text-align: center !important; }
.market-record__delete { width: 34px; height: 34px; justify-self: end; color: var(--muted); }
.market-record__delete:hover { background: var(--danger-soft); color: var(--danger); }
@media (max-width: 1120px) {
  .stock-allocation-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .allocation-identity { grid-column: 1 / -1; margin-bottom: 11px; padding: 0 0 11px; border-bottom: 1px solid var(--border); }
  .allocation-stat:nth-child(2) { padding-left: 0; border-left: 0; }
  .support-allocation-rows { grid-template-columns: 1fr; }
  .support-allocation-row { grid-template-columns: minmax(140px, 1fr) minmax(110px, .7fr) minmax(170px, 1fr); }
  .support-allocation-row + .support-allocation-row { margin: 12px 0 0; padding: 12px 0 0; border-top: 1px solid var(--border); border-left: 0; }
}
@media (max-width: 620px) {
  .dashboard-actions { width: 100%; }
  .dashboard-actions .btn { flex: 1; }
  .overview-summary { grid-template-columns: 1fr; }
  .overview-net-worth { min-height: 138px; padding: 18px; }
  .overview-fact { padding: 13px 14px; }
  .overview-fact:nth-child(odd) { border-left: 0; }
  .position-leverage-summary { align-items: flex-start; }
  .position-leverage-summary > div { display: grid; gap: 3px; }
  .stock-allocation-row { grid-template-columns: 1fr; }
  .allocation-identity { margin-bottom: 0; padding: 0 0 10px; }
  .allocation-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 9px 0; border-left: 0; border-bottom: 1px solid var(--border); }
  .allocation-stat:last-child { border-bottom: 0; }
  .support-allocation-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
  .support-allocation-row h3 { grid-column: 1 / -1; }
  .market-records { overflow-x: auto; }
  .market-record { min-width: 620px; }
  .market-history-panel :deep(.panel__header) { flex-direction: column; }
  .market-history-panel :deep(.panel__action) { width: 100%; justify-content: flex-start; }
}
</style>
