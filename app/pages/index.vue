<script setup>
import { Banknote, Clock3, Landmark, TrendingUp, Wallet } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未完成驗算'

const chartSnapshots = computed(() => {
  const limit = store.config?.settings?.snapshotDisplayLimit || 30
  return store.snapshots.slice(-limit)
})
const labels = computed(() => chartSnapshots.value.map((item) => item.date.slice(5)))
const netWorthData = computed(() => ({
  labels: labels.value,
  datasets: [{ label: '淨資產', data: chartSnapshots.value.map((item) => item.netWorth), borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,.12)', fill: true, tension: .32 }]
}))
const allocationData = computed(() => ({
  labels: ['股票', '債券', '現金', '其他資產', '負債'],
  datasets: [{ data: [store.summary?.totalStocks || 0, store.summary?.totalBonds || 0, store.summary?.totalCash || 0, store.summary?.totalOther || 0, store.summary?.totalLiabilities || 0], backgroundColor: ['#0f766e', '#0369a1', '#5bb9ad', '#9db7b2', '#d77a70'], borderWidth: 0 }]
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
    <header class="page-header">
      <div>
        <div class="eyebrow">Portfolio overview</div>
        <h1 class="page-title">資產總覽</h1>
        <p class="page-subtitle">看清楚現在的位置，也保留足夠空間做自己的判斷。</p>
      </div>
      <NuxtLink to="/snapshot" class="btn btn-primary">開始今日盤點</NuxtLink>
    </header>

    <template v-if="store.loading && !store.summary">
      <div class="metric-grid"><div v-for="i in 5" :key="i" class="skeleton" style="height: 126px" /></div>
    </template>
    <template v-else>
      <section class="metric-grid" aria-label="資產摘要">
        <MetricCard label="淨資產" :value="money(store.summary?.netWorth)">
          <template #icon><Wallet :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="可立即動用" :value="money(store.summary?.availableAssets)" note="不扣除貸款">
          <template #icon><Banknote :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="持有股票" :value="money(store.summary?.totalStocks)" :note="`${((store.summary?.stockRatio || 0) * 100).toFixed(1)}% 總資產`">
          <template #icon><TrendingUp :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="持有債券" :value="money(store.summary?.totalBonds)" :note="`${((store.summary?.bondRatio || 0) * 100).toFixed(1)}% 總資產`">
          <template #icon><Landmark :size="17" aria-hidden="true" /></template>
        </MetricCard>
        <MetricCard label="上次驗算" :value="dateTime(store.lastSnapshot?.verifiedAt)" note="以 Excel 快照為準">
          <template #icon><Clock3 :size="17" aria-hidden="true" /></template>
        </MetricCard>
      </section>

      <div v-if="store.snapshots.length < 2" class="notice" style="margin-top: 16px">
        完成至少兩次不同日期的盤點後，趨勢圖就會開始有意義。現在可以先建立第一個基準點。
      </div>

      <section class="charts-grid" aria-label="資產圖表">
        <article class="card chart-card">
          <h2 class="section-title">淨資產趨勢</h2>
          <p class="row-meta">最近 {{ chartSnapshots.length }} 筆盤點</p>
          <ClientOnly><AppChart type="line" :data="netWorthData" label="淨資產歷史趨勢折線圖" /></ClientOnly>
        </article>
        <article class="card chart-card">
          <h2 class="section-title">目前資產配置</h2>
          <p class="row-meta">負債獨立呈現，不混入資產占比</p>
          <ClientOnly><AppChart type="doughnut" :data="allocationData" label="目前股票、債券、現金、其他資產與負債配置圖" /></ClientOnly>
        </article>
        <article class="card chart-card">
          <h2 class="section-title">資產與大盤參考</h2>
          <p class="row-meta">各自以第一筆有效資料設為 100；這不是精確投資報酬率</p>
          <ClientOnly><AppChart type="line" :data="benchmarkData" label="淨資產、股票資產與加權指數標準化比較圖" /></ClientOnly>
        </article>
        <article class="card chart-card">
          <h2 class="section-title">加權指數與 240MA</h2>
          <p class="row-meta">用於觀察市場相對位置</p>
          <ClientOnly><AppChart type="line" :data="marketData" label="加權指數與 240 日均線比較圖" /></ClientOnly>
        </article>
      </section>
    </template>
  </div>
</template>
