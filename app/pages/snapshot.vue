<script setup>
import { CheckCircle2, RefreshCw, Save } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const localItems = ref([])
const note = ref('')
const saved = ref(false)
const marketResult = ref(null)
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const date = ref(today())
const taiex = ref(0)
const ma240 = ref(0)
const classLabels = { cash: '現金', equity: '股票', bond: '債券', other: '其他資產', liability: '負債' }
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)

watch(() => store.config, (config) => {
  if (!config) return
  localItems.value = config.items.filter((item) => !item.archived).map((item) => ({ ...item }))
  if (!taiex.value) taiex.value = Number(config.market?.taiex || store.lastSnapshot?.taiex || 0)
  if (!ma240.value) ma240.value = Number(config.market?.ma240 || store.lastSnapshot?.ma240 || 0)
}, { immediate: true })

const groupedItems = computed(() => (store.config?.groups || []).filter((g) => !g.archived).sort((a, b) => a.order - b.order).map((group) => ({ ...group, items: localItems.value.filter((item) => item.groupId === group.id) })).filter((group) => group.items.length))

async function refreshMarket() {
  marketResult.value = await store.marketPreview()
  if (marketResult.value.taiex) taiex.value = marketResult.value.taiex
}

async function save() {
  saved.value = false
  for (const item of localItems.value) {
    const original = store.config.items.find((entry) => entry.id === item.id)
    if (original && (Number(original.amount) !== Number(item.amount) || Number(original.exchangeRate) !== Number(item.exchangeRate))) {
      await store.updateItem(item.id, { amount: Number(item.amount), exchangeRate: Number(item.exchangeRate) })
    }
  }
  if (!Number(taiex.value) || !Number(ma240.value)) {
    store.error = '儲存前請填入加權指數與 240MA。'
    return
  }
  const summary = store.summary
  await store.saveSnapshot({
    date: date.value,
    verifiedAt: new Date().toISOString(),
    ...summary,
    taiex: Number(taiex.value),
    ma240: Number(ma240.value),
    note: note.value
  })
  saved.value = true
}
</script>

<template>
  <div>
    <header class="page-header">
      <div><div class="eyebrow">Daily check-in</div><h1 class="page-title">資產盤點</h1><p class="page-subtitle">更新今天的餘額與市場數字，確認後保存到本機 JSON；需要時再匯出 Excel。</p></div>
      <button class="btn btn-secondary" :disabled="store.saving" @click="refreshMarket"><RefreshCw :size="18" />取得市場資料</button>
    </header>

    <div v-if="marketResult?.warnings?.length" class="notice notice-warning" style="margin-bottom: 16px"><div><strong>有些資料需要你確認</strong><div v-for="warning in marketResult.warnings" :key="warning">{{ warning }}</div></div></div>
    <div v-if="saved" class="notice" role="status" aria-live="polite" style="margin-bottom: 16px"><CheckCircle2 :size="20" />已完成 {{ date }} 的盤點；同一天再儲存會更新原本那一列。</div>

    <div class="grid-2" style="align-items: start">
      <section class="stack">
        <article v-for="group in groupedItems" :key="group.id" class="card card-body">
          <h2 class="section-title">{{ group.name }}</h2>
          <div v-for="item in group.items" :key="item.id" class="list-row" style="grid-template-columns: 1.2fr .7fr 1fr">
            <div><div class="row-title">{{ item.name }}</div><div class="row-meta">{{ classLabels[item.assetClass] }} · {{ item.currency }} · {{ item.includeInAssets ? '納入資產' : '不納入資產' }}</div></div>
            <div v-if="item.currency !== 'TWD'" class="field"><label :for="`rate-${item.id}`">TWD 匯率</label><input :id="`rate-${item.id}`" v-model.number="item.exchangeRate" class="input amount" type="number" min="0.0001" step="0.0001" /></div>
            <span v-else class="pill">{{ item.liquidity === 'available' ? '立即可用' : item.liquidity === 'convertible' ? '可變現' : '受限制' }}</span>
            <div class="field"><label :for="`amount-${item.id}`">目前餘額</label><input :id="`amount-${item.id}`" v-model.number="item.amount" class="input amount" type="number" step="0.01" inputmode="decimal" /></div>
          </div>
        </article>
        <div v-if="!localItems.length && !store.loading" class="card empty"><div><strong>還沒有可盤點的帳戶</strong><NuxtLink to="/accounts">先前往帳戶結構新增項目</NuxtLink></div></div>
      </section>

      <aside class="stack">
        <section class="card card-body">
          <h2 class="section-title">市場與備註</h2>
          <div class="form-grid" style="margin-top: 16px">
            <div class="field"><label for="snapshot-date">盤點日期</label><input id="snapshot-date" v-model="date" class="input" type="date" /></div>
            <div class="field"><label for="taiex">加權指數</label><input id="taiex" v-model.number="taiex" class="input" type="number" min="0" step="0.01" required /></div>
            <div class="field"><label for="ma240">240MA</label><input id="ma240" v-model.number="ma240" class="input" type="number" min="0" step="0.01" required /></div>
            <div class="field full"><label for="note">備註</label><textarea id="note" v-model="note" class="textarea" maxlength="500" placeholder="例如：調整配置、現金支出較多" /></div>
          </div>
        </section>
        <section class="card card-body">
          <div class="eyebrow">Snapshot preview</div>
          <h2 class="section-title" style="margin-top: 5px">這次會保存的重點</h2>
          <div class="divider" />
          <div class="stack" style="gap: 11px">
            <div class="toolbar"><span class="muted">總資產</span><strong>{{ money(store.summary?.totalAssets) }}</strong></div>
            <div class="toolbar"><span class="muted">總負債</span><strong class="negative">{{ money(store.summary?.totalLiabilities) }}</strong></div>
            <div class="toolbar"><span class="muted">淨資產</span><strong>{{ money(store.summary?.netWorth) }}</strong></div>
            <div class="toolbar"><span class="muted">可立即動用</span><strong>{{ money(store.summary?.availableAssets) }}</strong></div>
            <div class="toolbar"><span class="muted">股票／債券</span><strong>{{ money(store.summary?.totalStocks) }}／{{ money(store.summary?.totalBonds) }}</strong></div>
          </div>
          <button class="btn btn-primary" style="width: 100%; margin-top: 20px" :disabled="store.saving || !localItems.length" @click="save"><Save :size="18" />{{ store.saving ? '儲存中…' : '確認並儲存快照' }}</button>
          <p class="row-meta" style="line-height: 1.5">資料：{{ store.storageStatus.mode === 'file' ? store.storageStatus.fileName : '瀏覽器 IndexedDB' }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>
