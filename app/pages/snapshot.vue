<script setup>
import { RefreshCw, Save } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const note = ref('')
const marketResult = ref(null)
const marketUpdating = ref(false)
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const date = ref(today())
const taiex = ref(0)
const ma240 = ref(0)
const behaviorLabels = { manual: '台幣帳戶', foreign: '外幣帳戶', cash: '系統現金', liability: '負債' }
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)

watch(() => store.config, (config) => {
  if (!config) return
  if (!taiex.value) taiex.value = Number(config.market?.taiex || store.lastSnapshot?.taiex || 0)
  if (!ma240.value) ma240.value = Number(config.market?.ma240 || store.lastSnapshot?.ma240 || 0)
}, { immediate: true })

const groupedItems = computed(() => (store.config?.groups || []).filter((g) => !g.archived).sort((a, b) => a.order - b.order).map((group) => ({ ...group, items: store.activeItems.filter((item) => item.groupId === group.id) })).filter((group) => group.items.length))
const number = (value, maximumFractionDigits = 2) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits }).format(Number(value) || 0)
const otherOrRestrictedAssets = computed(() => Number(store.summary?.totalOther || 0) + Number(store.summary?.restrictedCash || 0))

async function refreshFx(force = false) {
  if (!store.activeItems.some((item) => item.behavior === 'foreign')) return
  try {
    await store.refreshExchangeRates(force)
  } catch {
    if (force) store.error = ''
  }
}

watch(() => store.loading, (loading) => { if (!loading) refreshFx() }, { immediate: true })

async function refreshMarket() {
  marketUpdating.value = true
  try {
    marketResult.value = await store.marketPreview()
    if (marketResult.value.taiex) taiex.value = marketResult.value.taiex
    if (marketResult.value.ma240) ma240.value = marketResult.value.ma240
    await refreshFx(true)
    const complete = Number(marketResult.value.taiex) > 0 && Number(marketResult.value.ma240) > 0
    showToast({
      tone: complete ? 'success' : 'warning',
      title: complete ? '市場資料已更新' : '市場資料更新未完整',
      message: `資料日 ${marketResult.value.asOfDate || '未提供'}；加權指數 ${number(marketResult.value.taiex)}、240MA ${number(marketResult.value.ma240)}。`
    })
  } catch {
    // Store 會交由全站 toast 顯示具體錯誤。
  } finally {
    marketUpdating.value = false
  }
}

async function save() {
  if (!Number(taiex.value) || !Number(ma240.value)) {
    store.error = '儲存前請填入加權指數與 240MA。'
    return
  }
  const summary = store.summary
  try {
    await store.saveSnapshot({
      date: date.value,
      verifiedAt: new Date().toISOString(),
      ...summary,
      taiex: Number(taiex.value),
      ma240: Number(ma240.value),
      note: note.value
    })
    showToast({
      tone: 'success',
      title: `已完成 ${date.value} 的盤點`,
      message: '同一天再次儲存會更新原本的快照，不會新增重複資料。'
    })
  } catch {
    // Store 會交由全站 toast 顯示具體錯誤。
  }
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Daily check-in" title="資產盤點" description="自動彙整帳戶與投資持倉，確認市場基準後留下當天的完整快照。" />

    <div class="page-grid page-grid--sidebar">
      <section class="stack">
        <UiPanel v-for="group in groupedItems" :key="group.id" class="snapshot-group-panel" flush :title="group.name">
          <template #action><span class="pill pill-neutral">{{ group.items.length }} 個待盤點項目</span></template>
          <div class="data-list">
          <div v-for="item in group.items" :key="item.id" class="data-row snapshot-row">
            <div class="data-row__main"><div class="data-row__title">{{ item.name }}</div><div class="data-row__meta">{{ behaviorLabels[item.behavior] }} · {{ item.currency }}</div></div>
            <div v-if="item.currency !== 'TWD'" class="field"><label>系統匯率</label><div class="rate-readout">1 {{ item.currency }} = NT$ {{ number(item.exchangeRate, 6) }}</div></div>
            <span v-else class="pill">{{ item.liquidity === 'available' ? '立即可用' : '受限制' }}</span>
            <div class="field"><span class="field-label">目前餘額</span><div class="amount-readout">{{ number(item.amount) }} <small>{{ item.currency }}</small></div></div>
          </div>
          </div>
        </UiPanel>
        <UiPanel v-if="!store.activeItems.length && !store.loading"><EmptyState title="還沒有可盤點的帳戶" description="先建立帳戶項目，再回來保存第一份快照。"><template #action><NuxtLink to="/accounts" class="btn btn-secondary">前往帳戶結構</NuxtLink></template></EmptyState></UiPanel>
      </section>
      <aside class="stack snapshot-sidebar">
        <UiPanel eyebrow="Snapshot preview" title="這次會保存的重點" description="確認盤點資訊、資產摘要與備註後，一次保存完整快照。">
          <section class="snapshot-section" aria-labelledby="snapshot-market-title">
            <div class="snapshot-section__heading">
              <div><h3 id="snapshot-market-title">市場與備註</h3><p>可自動帶入，亦可在保存前手動修正。</p></div>
              <button class="btn btn-secondary market-header-button" type="button" :disabled="marketUpdating || store.saving" @click="refreshMarket"><RefreshCw :class="{ spin: marketUpdating }" :size="17" />{{ marketUpdating ? '取得中…' : '取得資料' }}</button>
            </div>
            <div class="form-grid snapshot-form">
              <div class="field"><label for="snapshot-date">盤點日期</label><input id="snapshot-date" v-model="date" class="input" type="date" /></div>
              <div class="field"><label for="taiex">加權指數</label><FormattedNumberInput id="taiex" v-model="taiex" class="input input--amount" :min="0" :max-fraction-digits="2" required /></div>
              <div class="field full"><label for="ma240">240MA</label><FormattedNumberInput id="ma240" v-model="ma240" class="input input--amount" :min="0" :max-fraction-digits="2" required /></div>
              <div class="field full"><label for="note">備註</label><textarea id="note" v-model="note" class="textarea" maxlength="500" placeholder="例如：調整配置、現金支出較多" /></div>
            </div>
          </section>
          <section class="snapshot-section snapshot-section--summary" aria-labelledby="snapshot-summary-title">
            <div class="snapshot-section__heading"><div><h3 id="snapshot-summary-title">資產摘要</h3><p>以下數字與市場資料會一起寫入本次快照。</p></div></div>
          <div class="asset-composition" aria-label="總資產組成">
            <div class="asset-composition__heading">
              <strong>總資產組成</strong>
              <span>以下項目相加</span>
            </div>
            <div class="asset-part">
              <span class="asset-part__operator" aria-hidden="true"></span>
              <span class="asset-part__label">可動用現金<small>含外幣換算</small></span>
              <strong>{{ money(store.summary?.availableCash) }}</strong>
            </div>
            <div class="asset-part">
              <span class="asset-part__operator" aria-hidden="true">＋</span>
              <span class="asset-part__label">股票市值</span>
              <strong>{{ money(store.summary?.totalStocks) }}</strong>
            </div>
            <div class="asset-part">
              <span class="asset-part__operator" aria-hidden="true">＋</span>
              <span class="asset-part__label">債券市值</span>
              <strong>{{ money(store.summary?.totalBonds) }}</strong>
            </div>
            <div v-if="otherOrRestrictedAssets" class="asset-part">
              <span class="asset-part__operator" aria-hidden="true">＋</span>
              <span class="asset-part__label">其他／受限制資產</span>
              <strong>{{ money(otherOrRestrictedAssets) }}</strong>
            </div>
            <div class="asset-composition__total">
              <span>＝ 總資產</span>
              <strong>{{ money(store.summary?.totalAssets) }}</strong>
            </div>
          </div>
          <div class="summary-list snapshot-net-summary">
            <div class="summary-item"><span class="summary-item__label">總負債</span><strong class="summary-item__value negative">{{ money(store.summary?.totalLiabilities) }}</strong></div>
            <div class="summary-item summary-item--primary"><span class="summary-item__label">淨資產</span><strong class="summary-item__value">{{ money(store.summary?.netWorth) }}</strong></div>
          </div>
          </section>
          <button class="btn btn-primary btn-block save-snapshot" :disabled="store.saving || !store.activeItems.length" @click="save"><Save :size="18" />{{ store.saving ? '儲存中…' : '確認並儲存快照' }}</button>
          <p class="storage-caption">
            自動保存至瀏覽器；JSON 備份可在設定頁手動建立。
          </p>
        </UiPanel>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.snapshot-group-panel :deep(.panel__header) { padding-bottom: 14px; }
.snapshot-row { grid-template-columns: minmax(0, 1.35fr) minmax(120px, .65fr) minmax(150px, .75fr); }
.rate-readout { min-height: 40px; display: flex; align-items: center; justify-content: flex-end; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-muted); color: var(--text-soft); font-size: .78rem; font-variant-numeric: tabular-nums; }
.amount-readout { min-height: 40px; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-muted); color: var(--text); font-size: .88rem; font-weight: 750; font-variant-numeric: tabular-nums; }
.amount-readout small { color: var(--muted); font-size: .76rem; font-weight: 650; }
.market-header-button { min-height: 38px; padding: 7px 11px; white-space: nowrap; }
.snapshot-sidebar { position: sticky; top: 24px; }
.snapshot-section { display: grid; gap: 14px; }
.snapshot-section--summary { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }
.snapshot-section__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.snapshot-section__heading h3 { margin: 0; font-size: .9rem; }
.snapshot-section__heading p { margin: 4px 0 0; color: var(--muted); font-size: .78rem; line-height: 1.45; }
.snapshot-form { gap: 12px; }
.asset-composition { overflow: hidden; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.asset-composition__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.asset-composition__heading strong { font-size: .85rem; }
.asset-composition__heading span { color: var(--muted); font-size: .76rem; }
.asset-part { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 6px; padding: 8px 0; color: var(--text-soft); font-size: .82rem; }
.asset-part__operator { color: var(--primary); font-weight: 800; }
.asset-part__label { display: flex; align-items: baseline; gap: 6px; }
.asset-part__label small { color: var(--muted); font-size: .75rem; }
.asset-part strong, .asset-composition__total strong { font-variant-numeric: tabular-nums; }
.asset-composition__total { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border-strong); color: var(--primary); font-size: .9rem; }
.snapshot-net-summary { margin-top: 10px; }
.save-snapshot { margin-top: 20px; }
.storage-caption { margin: 10px 0 0; color: var(--muted); text-align: center; font-size: .76rem; line-height: 1.5; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 880px) { .snapshot-sidebar { position: static; } }
@media (max-width: 620px) {
  .snapshot-section__heading { align-items: stretch; flex-direction: column; }
  .market-header-button { width: 100%; }
}
</style>
