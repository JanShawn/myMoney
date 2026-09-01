<script setup>
import { Banknote, Clock3, Eye, EyeOff, Landmark, Save, Trash2, TrendingUp, Wallet } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const number = (value) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(Number(value) || 0)
const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未完成驗算'
const targetForm = reactive({ cash: 20, stocks: 60, bonds: 20 })
const pendingDeleteDate = ref('')
const hideAmounts = ref(false)
const displayMoney = (value) => hideAmounts.value ? 'NT$ ******' : money(value)

watch(() => store.config?.settings?.allocationTargets, (targets) => {
  if (targets) Object.assign(targetForm, targets)
}, { immediate: true, deep: true })

const chartSnapshots = computed(() => {
  const limit = store.config?.settings?.snapshotDisplayLimit || 30
  return store.snapshots.slice(-limit)
})
const hasTrendData = computed(() => chartSnapshots.value.length >= 2)
const hasSnapshotData = computed(() => chartSnapshots.value.length >= 1)
const hasAllocationData = computed(() => Number(store.summary?.totalAssets) > 0 || Number(store.summary?.totalLiabilities) > 0)
const allocationBase = computed(() => Number(store.summary?.availableCash || 0) + Number(store.summary?.totalStocks || 0) + Number(store.summary?.totalBonds || 0))
const targetTotal = computed(() => Number(targetForm.cash || 0) + Number(targetForm.stocks || 0) + Number(targetForm.bonds || 0))
const allocationRows = computed(() => [
  { key: 'cash', label: '可動用現金', current: Number(store.summary?.availableCash || 0), target: Number(targetForm.cash || 0), color: '#5bb9ad' },
  { key: 'stocks', label: '股票市值', current: Number(store.summary?.totalStocks || 0), target: Number(targetForm.stocks || 0), color: '#0f766e' },
  { key: 'bonds', label: '債券市值', current: Number(store.summary?.totalBonds || 0), target: Number(targetForm.bonds || 0), color: '#0369a1' }
].map((row) => ({
  ...row,
  ratio: allocationBase.value ? row.current / allocationBase.value : 0,
  targetAmount: allocationBase.value * row.target / 100,
  delta: allocationBase.value * row.target / 100 - row.current
})))
const recentMarketRecords = computed(() => [...chartSnapshots.value].slice(-6).reverse())
const pendingDeleteRecord = computed(() => store.snapshots.find((record) => record.date === pendingDeleteDate.value) || null)
const adjustmentText = (row) => {
  if (Math.abs(row.delta) < 1) return '已接近目標'
  if (row.key === 'cash') return row.delta > 0 ? `現金需增加${hideAmounts.value ? '' : ` ${money(row.delta)}`}` : `可釋出${hideAmounts.value ? '' : ` ${money(Math.abs(row.delta))}`}`
  return row.delta > 0 ? `尚可投入${hideAmounts.value ? '' : ` ${money(row.delta)}`}` : `超出目標${hideAmounts.value ? '' : ` ${money(Math.abs(row.delta))}`}`
}
async function saveAllocationTargets() {
  if (Math.abs(targetTotal.value - 100) > 0.001) return
  await store.updateSettings({ allocationTargets: { cash: Number(targetForm.cash), stocks: Number(targetForm.stocks), bonds: Number(targetForm.bonds) } })
  showToast({ tone: 'success', title: '配置目標已保存', message: '新的現金、股票與債券目標比例已套用。' })
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
  datasets: [{ label: '淨資產', data: chartSnapshots.value.map((item) => item.netWorth), borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,.12)', fill: true, tension: .32 }]
}))
const allocationData = computed(() => ({
  labels: ['股票', '債券', '可動用現金', '其他／受限制資產', '負債'],
  datasets: [{ data: [store.summary?.totalStocks || 0, store.summary?.totalBonds || 0, store.summary?.availableCash || 0, Number(store.summary?.totalOther || 0) + Number(store.summary?.restrictedCash || 0), store.summary?.totalLiabilities || 0], backgroundColor: ['#0f766e', '#0369a1', '#5bb9ad', '#9db7b2', '#d77a70'], borderWidth: 0 }]
}))
function normalized(key) {
  const first = chartSnapshots.value.find((item) => Number(item[key]) > 0)?.[key]
  return chartSnapshots.value.map((item) => first ? Number(((item[key] / first) * 100).toFixed(2)) : null)
}
const benchmarkData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: '淨資產（起點=100）', data: normalized('netWorth'), borderColor: '#0f766e', tension: .3 },
    { label: '股票資產（起點=100）', data: normalized('totalStocks'), borderColor: '#0ea5a4', tension: .3 },
    { label: '加權指數（起點=100）', data: normalized('taiex'), borderColor: '#0369a1', tension: .3 }
  ]
}))
const marketData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: '加權指數', data: chartSnapshots.value.map((item) => item.taiex), borderColor: '#0369a1', tension: .28 },
    { label: '240MA', data: chartSnapshots.value.map((item) => item.ma240), borderColor: '#d18432', borderDash: [6, 5], tension: .2 }
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

      <UiPanel class="space-before allocation-panel" title="配置比例與投入試算" description="可動用現金已包含外幣換算；與股票、債券一起比較配置比例。">
        <div class="allocation-layout">
          <div class="allocation-current">
            <div v-for="row in allocationRows" :key="row.key" class="allocation-row">
              <div class="allocation-row__heading"><strong>{{ row.label }}</strong><span>{{ displayMoney(row.current) }} · {{ (row.ratio * 100).toFixed(1) }}%</span></div>
              <div class="allocation-track"><span :style="{ width: `${Math.min(row.ratio * 100, 100)}%`, background: row.color }" /></div>
              <div class="allocation-row__detail"><span>目標 {{ row.target.toFixed(1) }}%（{{ displayMoney(row.targetAmount) }}）</span><strong :class="{ negative: row.delta < -1 }">{{ adjustmentText(row) }}</strong></div>
            </div>
            <AppNotice v-if="!allocationBase" title="還沒有可試算的配置">建立現金帳戶或投資持倉後，這裡會自動顯示比例與投入差額。</AppNotice>
          </div>
          <div class="target-form">
            <div class="target-form__title"><strong>目標比例</strong><span>合計必須是 100%</span></div>
            <div class="target-inputs">
              <div class="field"><label for="target-cash">現金 %</label><FormattedNumberInput id="target-cash" v-model="targetForm.cash" class="input input--amount" :min="0" :max="100" :max-fraction-digits="1" /></div>
              <div class="field"><label for="target-stocks">股票 %</label><FormattedNumberInput id="target-stocks" v-model="targetForm.stocks" class="input input--amount" :min="0" :max="100" :max-fraction-digits="1" /></div>
              <div class="field"><label for="target-bonds">債券 %</label><FormattedNumberInput id="target-bonds" v-model="targetForm.bonds" class="input input--amount" :min="0" :max="100" :max-fraction-digits="1" /></div>
            </div>
            <AppNotice v-if="Math.abs(targetTotal - 100) > 0.001" tone="warning" title="目標比例尚未對齊">目前合計 {{ targetTotal.toFixed(1) }}%，請調整為 100%。</AppNotice>
            <button class="btn btn-secondary btn-block" type="button" :disabled="store.saving || Math.abs(targetTotal - 100) > 0.001" @click="saveAllocationTargets"><Save :size="17" />保存配置目標</button>
          </div>
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
.allocation-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(280px, .6fr); gap: 24px; }
.allocation-current { display: grid; gap: 18px; }
.allocation-row { display: grid; gap: 8px; }
.allocation-row__heading, .allocation-row__detail { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.allocation-row__heading strong { font-size: .88rem; }
.allocation-row__heading span, .allocation-row__detail { color: var(--muted); font-size: .75rem; }
.allocation-row__detail strong { color: var(--primary); font-size: .75rem; }
.allocation-track { height: 9px; overflow: hidden; border-radius: 999px; background: var(--surface-muted); }
.allocation-track span { display: block; height: 100%; border-radius: inherit; transition: width .25s ease; }
.target-form { display: grid; align-content: start; gap: 14px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.target-form__title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.target-form__title strong { font-size: .88rem; }
.target-form__title span { color: var(--muted); font-size: .72rem; }
.target-inputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.market-records { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); }
.market-record { display: grid; grid-template-columns: 1fr repeat(3, minmax(120px, .8fr)) 42px; align-items: center; gap: 16px; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: .78rem; }
.market-record:last-child { border-bottom: 0; }
.market-record > :not(:first-child, .market-record__delete) { text-align: right; font-variant-numeric: tabular-nums; }
.market-record--header { background: var(--surface-muted); color: var(--muted); font-weight: 720; }
.market-record__action-label { text-align: center !important; }
.market-record__delete { width: 34px; height: 34px; justify-self: end; color: var(--muted); }
.market-record__delete:hover { background: var(--danger-soft); color: var(--danger); }
@media (max-width: 880px) { .allocation-layout { grid-template-columns: 1fr; } }
@media (max-width: 620px) {
  .dashboard-actions { width: 100%; }
  .dashboard-actions .btn { flex: 1; }
  .target-inputs { grid-template-columns: 1fr; }
  .allocation-row__detail { align-items: flex-start; flex-direction: column; gap: 3px; }
  .market-records { overflow-x: auto; }
  .market-record { min-width: 680px; }
}
</style>
