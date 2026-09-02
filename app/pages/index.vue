<script setup>
import { Banknote, Clock3, Eye, EyeOff, Landmark, Trash2, TrendingUp, Wallet } from '@lucide/vue'
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
const recentMarketRecords = computed(() => [...chartSnapshots.value].slice(-6).reverse())
const pendingDeleteRecord = computed(() => store.snapshots.find((record) => record.date === pendingDeleteDate.value) || null)
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
const allocationData = computed(() => ({
  labels: ['股票', '債券', '可動用現金', '其他／受限制資產', '負債'],
  datasets: [{ data: [store.summary?.totalStocks || 0, store.summary?.totalBonds || 0, store.summary?.availableCash || 0, Number(store.summary?.totalOther || 0) + Number(store.summary?.restrictedCash || 0), store.summary?.totalLiabilities || 0], backgroundColor: [chartColors.value.stocks, chartColors.value.bonds, chartColors.value.cash, chartColors.value.other, chartColors.value.debt], borderWidth: 0 }]
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
      <div class="metric-grid"><div v-for="i in 5" :key="i" class="skeleton skeleton--metric" /></div>
    </template>
    <template v-else>
      <section class="metric-grid" aria-label="資產摘要">
        <MetricCard label="淨資產" :value="displayMoney(store.summary?.netWorth)">
          <template #icon><Wallet :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="可動用現金" :value="displayMoney(store.summary?.availableCash)" note="台幣現金＋外幣換算；不含受限制帳戶">
          <template #icon><Banknote :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="持有股票" :value="displayMoney(store.summary?.totalStocks)" :note="`${((store.summary?.stockRatio || 0) * 100).toFixed(1)}% 總資產`">
          <template #icon><TrendingUp :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="持有債券" :value="displayMoney(store.summary?.totalBonds)" :note="`${((store.summary?.bondRatio || 0) * 100).toFixed(1)}% 總資產`">
          <template #icon><Landmark :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="上次資產盤點" :value="dateTime(store.lastSnapshot?.verifiedAt)" note="以最近保存的快照為準">
          <template #icon><Clock3 :size="17" aria-hidden="true" /></template>
        </MetricCard>
      </section>

      <UiPanel class="space-before allocation-panel" title="曝險比例與資金配置" description="聚焦部位加權、現金配置，以及股票的實際淨曝險。">
        <div class="allocation-current">
          <div class="position-leverage-summary" :class="{ negative: weightedLeverage < 0 }">
            <div><span>部位加權</span><small>淨曝險值 ÷ 股票與債券市值</small></div>
            <strong>{{ weightedLeverage.toFixed(2) }}×</strong>
          </div>

          <div class="allocation-briefs">
            <section class="allocation-brief allocation-brief--stocks" aria-labelledby="stock-allocation-title">
              <div class="allocation-brief__heading">
                <h3 id="stock-allocation-title">股票市值</h3>
                <span>{{ displayMoney(stockAllocation?.current) }} · 市值配置 {{ ((stockAllocation?.ratio || 0) * 100).toFixed(1) }}%</span>
              </div>
              <div class="stock-exposure-metrics">
                <div class="stock-exposure-metrics__primary" :class="{ negative: stockAllocation?.exposureRatio < 0 }"><span>淨曝險比例</span><strong>{{ ((stockAllocation?.exposureRatio || 0) * 100).toFixed(1) }}%</strong></div>
                <div><span>淨曝險值</span><strong>{{ displayMoney(stockAllocation?.exposure) }}</strong></div>
                <div><span>商品加權槓桿</span><strong>{{ (stockAllocation?.positionLeverage || 0).toFixed(2) }}×</strong></div>
              </div>
            </section>

            <section class="allocation-brief" aria-labelledby="cash-allocation-title">
              <h3 id="cash-allocation-title">可動用現金</h3>
              <div class="allocation-brief__metrics">
                <div><span>配置比例</span><strong>{{ (cashAllocationRatio * 100).toFixed(1) }}%</strong></div>
                <div><span>投入金額</span><strong>{{ displayMoney(store.summary?.availableCash) }}</strong></div>
              </div>
            </section>

            <section class="allocation-brief" aria-labelledby="bond-allocation-title">
              <h3 id="bond-allocation-title">債券市值</h3>
              <div class="allocation-brief__metrics">
                <div><span>市值配置</span><strong>{{ ((bondAllocation?.ratio || 0) * 100).toFixed(1) }}%</strong></div>
                <div><span>目前市值</span><strong>{{ displayMoney(bondAllocation?.current) }}</strong></div>
              </div>
            </section>
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
        <UiPanel v-if="hasAllocationData" class="chart-panel" :class="{ 'span-all': !hasTrendData }" title="目前資產配置" description="負債獨立呈現，不混入資產占比">
          <ClientOnly><AppChart type="doughnut" :data="allocationData" label="目前股票、債券、可動用現金、其他或受限制資產與負債配置圖" :privacy="hideAmounts" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="資產盤點與大盤對照" description="各自以第一筆有效資料設為 100，觀察盤點資產與大盤的相對變化">
          <ClientOnly><AppChart type="line" :data="benchmarkData" label="淨資產、股票資產與加權指數標準化比較圖" /></ClientOnly>
        </UiPanel>
        <UiPanel v-if="hasSnapshotData" class="chart-panel" title="盤點當下的加權指數與 240MA" description="每個點都來自該次資產盤點保存的市場數字">
          <ClientOnly><AppChart type="line" :data="marketData" label="加權指數與 240 日均線比較圖" /></ClientOnly>
        </UiPanel>
      </section>

      <UiPanel class="space-before" title="最近盤點與大盤紀錄" description="直接查看每次記錄淨資產時，當下保存的加權指數與 240MA。">
        <div v-if="hasSnapshotData" class="market-records">
          <div class="market-record market-record--header"><span>盤點日期</span><span>淨資產</span><span>加權指數</span><span>240MA</span><span class="market-record__action-label">操作</span></div>
          <div v-for="record in recentMarketRecords" :key="record.date" class="market-record">
            <strong>{{ record.date }}</strong><span>{{ displayMoney(record.netWorth) }}</span><span>{{ number(record.taiex) }}</span><span>{{ number(record.ma240) }}</span>
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
.allocation-current { display: grid; gap: 14px; }
.position-leverage-summary { min-height: 88px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--primary-soft); }
.position-leverage-summary > div { display: grid; gap: 4px; }
.position-leverage-summary span { color: var(--text-soft); font-size: .8rem; font-weight: 760; }
.position-leverage-summary small { color: var(--muted); font-size: .7rem; }
.position-leverage-summary > strong { color: var(--primary); font-size: clamp(1.8rem, 4vw, 2.55rem); line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.035em; }
.position-leverage-summary.negative { background: var(--danger-soft); }
.position-leverage-summary.negative > strong { color: var(--danger); }
.allocation-briefs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.allocation-brief { display: grid; gap: 12px; padding: 15px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.allocation-brief h3 { margin: 0; color: var(--text); font-size: .88rem; }
.allocation-brief__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.allocation-brief__heading > span { color: var(--muted); font-size: .72rem; font-variant-numeric: tabular-nums; }
.allocation-brief__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.allocation-brief__metrics > div, .stock-exposure-metrics > div { display: grid; gap: 4px; min-width: 0; }
.allocation-brief__metrics span, .stock-exposure-metrics span { color: var(--muted); font-size: .68rem; font-weight: 700; }
.allocation-brief__metrics strong { color: var(--text); font-size: 1.02rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.allocation-brief--stocks { width: 100%; grid-column: 1 / -1; }
.stock-exposure-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--border); }
.stock-exposure-metrics > div { padding: 11px 12px; background: var(--surface); }
.stock-exposure-metrics strong { color: var(--primary); font-size: .92rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.stock-exposure-metrics__primary { background: var(--primary-soft) !important; }
.stock-exposure-metrics__primary strong { font-size: 1.18rem; }
.stock-exposure-metrics__primary.negative { background: var(--danger-soft) !important; }
.stock-exposure-metrics__primary.negative strong { color: var(--danger); }
.market-records { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); }
.market-record { display: grid; grid-template-columns: 1fr repeat(3, minmax(120px, .8fr)) 42px; align-items: center; gap: 16px; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: .78rem; }
.market-record:last-child { border-bottom: 0; }
.market-record > :not(:first-child, .market-record__delete) { text-align: right; font-variant-numeric: tabular-nums; }
.market-record--header { background: var(--surface-muted); color: var(--muted); font-weight: 720; }
.market-record__action-label { text-align: center !important; }
.market-record__delete { width: 34px; height: 34px; justify-self: end; color: var(--muted); }
.market-record__delete:hover { background: var(--danger-soft); color: var(--danger); }
@media (max-width: 620px) {
  .dashboard-actions { width: 100%; }
  .dashboard-actions .btn { flex: 1; }
  .position-leverage-summary { align-items: flex-start; flex-direction: column; gap: 12px; }
  .allocation-briefs { grid-template-columns: 1fr; }
  .allocation-brief--stocks { width: 100%; grid-column: auto; }
  .allocation-brief__heading { align-items: flex-start; flex-direction: column; gap: 4px; }
  .stock-exposure-metrics { grid-template-columns: 1fr; }
  .market-records { overflow-x: auto; }
  .market-record { min-width: 680px; }
}
</style>
