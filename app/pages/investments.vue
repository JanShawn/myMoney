<script setup>
import { CheckCircle2, ExternalLink, Pencil, RefreshCw, Search, Trash2 } from '@lucide/vue'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const defaultForm = () => ({ ticker: '', name: '', market: '', quantity: '', assetClass: 'equity', assetClassDetail: '', direction: 'long', multiplier: 1, price: '', priceSource: 'auto', priceAsOfDate: null, priceSourceLabel: '', yahooUrl: '', liquidity: 'convertible', includeInAssets: true })
const form = reactive(defaultForm())
const formResetKey = ref(0)
const tickerInput = ref(null)
const quantityInput = ref(null)
const expandedHoldingId = ref('')
const holdingQuery = ref('')
const holdingSort = ref('ticker')
const marketResult = ref(null)
const manualMode = ref(false)
const resolvedTicker = ref('')
const formError = ref('')
const formSuccess = ref('')
const holdingEditError = ref('')
const deleteError = ref('')
const pendingDeleteHoldingId = ref('')
const quantityDrafts = reactive({})
const priceDrafts = reactive({})
const lookup = reactive({ loading: false, status: 'idle', message: '', source: '', yahooUrl: '' })
let lookupRequestId = 0
const classLabels = { equity: '股票', bond: '債券', other: '其他' }
const directionLabels = { long: '一般／做多', inverse: '反向商品' }
const classOptions = Object.entries(classLabels).map(([value, label]) => ({ value, label }))
const directionOptions = Object.entries(directionLabels).map(([value, label]) => ({ value, label }))
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const priceMoney = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value || 0)
const quantityText = (value) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 8 }).format(Number(value || 0))
const normalizedTicker = computed(() => String(form.ticker || '').trim().toUpperCase())
const instrumentReady = computed(() => Boolean(form.name.trim()) && Number(form.price) > 0)
const displayQuantity = (holding) => quantityDrafts[holding.id] ?? holding.quantity
const displayPrice = (holding) => priceDrafts[holding.id] ?? holding.price
const holdingMarketValue = computed(() => store.activeHoldings.reduce((sum, holding) => sum + Number(displayQuantity(holding) || 0) * Number(displayPrice(holding) || 0) * Number(holding.multiplier || 1), 0))
const latestClosingDate = computed(() => store.activeHoldings.map((holding) => holding.priceAsOfDate).filter(Boolean).sort().at(-1) || '')
const pendingDeleteHolding = computed(() => store.activeHoldings.find((holding) => holding.id === pendingDeleteHoldingId.value) || null)
const sortLabels = { ticker: '代號', quantity: '股數', marketValue: '市值' }
const holdingValue = (holding) => Number(displayQuantity(holding) || 0) * Number(displayPrice(holding) || 0) * Number(holding.multiplier || 1)
const displayedHoldings = computed(() => {
  const query = holdingQuery.value.trim().toLocaleLowerCase('zh-TW')
  const holdings = store.activeHoldings.filter((holding) => !query || `${holding.ticker} ${holding.name}`.toLocaleLowerCase('zh-TW').includes(query))
  return holdings.sort((left, right) => {
    if (holdingSort.value === 'quantity') return Number(displayQuantity(right) || 0) - Number(displayQuantity(left) || 0)
    if (holdingSort.value === 'marketValue') return holdingValue(right) - holdingValue(left)
    const leftTicker = String(left.ticker || '').toUpperCase()
    const rightTicker = String(right.ticker || '').toUpperCase()
    const numericCodes = /^\d+$/.test(leftTicker) && /^\d+$/.test(rightTicker)
    const difference = leftTicker.localeCompare(rightTicker, 'zh-TW', { numeric: !numericCodes, sensitivity: 'base' })
    return difference || Number(left.order || 0) - Number(right.order || 0)
  })
})
const holdingListDescription = computed(() => `${holdingQuery.value.trim() ? `${displayedHoldings.value.length} / ` : ''}${store.activeHoldings.length} 筆使用中持倉 · 依${sortLabels[holdingSort.value]}${holdingSort.value === 'ticker' ? '由小到大' : '由高到低'}排列`)
const holdingClassLabel = (holding) => holding.assetClass === 'other' && holding.assetClassDetail
  ? `其他 · ${holding.assetClassDetail}`
  : classLabels[holding.assetClass]
watch(() => form.ticker, () => {
  if (normalizedTicker.value === resolvedTicker.value) return
  lookupRequestId += 1
  lookup.loading = false
  form.name = ''
  form.market = ''
  form.price = ''
  form.priceSource = 'auto'
  form.priceAsOfDate = null
  form.priceSourceLabel = ''
  form.yahooUrl = ''
  manualMode.value = false
  formError.value = ''
  Object.assign(lookup, { status: 'idle', message: '', source: '', yahooUrl: '' })
})

function toggleHoldingEdit(holdingId) {
  pendingDeleteHoldingId.value = ''
  deleteError.value = ''
  expandedHoldingId.value = expandedHoldingId.value === holdingId ? '' : holdingId
}

function handleHoldingRowClick(holdingId, event) {
  if (event?.target?.closest('button, a, input, .notice')) return
  toggleHoldingEdit(holdingId)
}

async function lookupTicker() {
  const requestId = ++lookupRequestId
  formError.value = ''
  if (!normalizedTicker.value) {
    Object.assign(lookup, { status: 'error', message: '請先輸入股票或商品代號。', source: '', yahooUrl: '' })
    return false
  }
  lookup.loading = true
  Object.assign(lookup, { status: 'loading', message: '正在查詢商品與最新收盤價…', source: '', yahooUrl: '' })
  try {
    const instrument = await store.lookupHolding(normalizedTicker.value)
    if (requestId !== lookupRequestId) return false
    resolvedTicker.value = instrument.ticker
    form.ticker = instrument.ticker
    form.name = instrument.name
    form.market = instrument.market
    form.price = instrument.price
    form.priceSource = 'auto'
    form.priceAsOfDate = instrument.marketDate
    form.priceSourceLabel = instrument.source
    form.yahooUrl = instrument.yahooUrl
    manualMode.value = false
    Object.assign(lookup, { status: 'success', message: instrument.fallback ? '最新日行情暫時無法取得，目前使用官方快取價格。' : '已自動帶入商品名稱與最新收盤價。', source: instrument.source, yahooUrl: instrument.yahooUrl })
    return true
  } catch (error) {
    if (requestId !== lookupRequestId) return false
    resolvedTicker.value = normalizedTicker.value
    form.name = ''
    form.market = ''
    form.price = ''
    form.priceSource = 'manual'
    form.priceAsOfDate = null
    form.priceSourceLabel = ''
    form.yahooUrl = ''
    manualMode.value = true
    Object.assign(lookup, { status: 'error', message: error?.message || '商品資料查詢失敗，請改用手動輸入。', source: '', yahooUrl: '' })
    return false
  } finally {
    if (requestId === lookupRequestId) lookup.loading = false
  }
}

async function lookupTickerAndFocusQuantity() {
  formSuccess.value = ''
  if (!normalizedTicker.value) {
    formError.value = '請輸入股票或商品代號。'
    return
  }
  const alreadyReady = manualMode.value || (resolvedTicker.value === normalizedTicker.value && instrumentReady.value)
  const found = alreadyReady || await lookupTicker()
  if (!found) return
  await nextTick()
  quantityInput.value?.focus()
}

function useManualMode() {
  lookupRequestId += 1
  lookup.loading = false
  resolvedTicker.value = normalizedTicker.value
  form.name = ''
  form.market = ''
  form.price = ''
  form.priceSource = 'manual'
  form.priceAsOfDate = null
  form.priceSourceLabel = ''
  form.yahooUrl = ''
  manualMode.value = true
  Object.assign(lookup, { status: 'manual', message: '目前使用手動資料；適合海外或官方資料未收錄的商品。', source: '', yahooUrl: '' })
}

async function useAutomaticMode() {
  const manualValues = { name: form.name, price: form.price }
  manualMode.value = false
  form.priceSource = 'auto'
  resolvedTicker.value = ''
  Object.assign(lookup, { status: 'idle', message: '', source: '', yahooUrl: '' })
  const found = await lookupTicker()
  if (!found) {
    form.name = manualValues.name
    form.price = manualValues.price
  }
}

function resetForm() {
  lookupRequestId += 1
  Object.assign(form, defaultForm())
  formResetKey.value += 1
  manualMode.value = false
  resolvedTicker.value = ''
  formError.value = ''
  Object.assign(lookup, { loading: false, status: 'idle', message: '', source: '', yahooUrl: '' })
}

async function submit() {
  formError.value = ''
  formSuccess.value = ''
  if (!normalizedTicker.value) {
    formError.value = '請輸入股票或商品代號。'
    return
  }
  if (!(Number(form.quantity) > 0)) {
    formError.value = '持有數量必須大於 0。'
    return
  }
  if (form.assetClass === 'other' && !form.assetClassDetail.trim()) {
    formError.value = '選擇「其他」時，請填寫實際資產類型。'
    return
  }
  if (!manualMode.value && (resolvedTicker.value !== normalizedTicker.value || !instrumentReady.value)) {
    const found = await lookupTicker()
    if (!found) return
  }
  if (!instrumentReady.value) {
    formError.value = manualMode.value ? '請填寫商品名稱，且目前價格必須大於 0。' : '尚未取得可用的商品名稱與價格。'
    return
  }
  try {
    const addedHolding = { ...form, ticker: normalizedTicker.value, name: form.name.trim(), assetClassDetail: form.assetClass === 'other' ? form.assetClassDetail.trim() : '', quantity: Number(form.quantity), multiplier: Number(form.multiplier), price: Number(form.price) }
    await store.addHolding(addedHolding)
    resetForm()
    formSuccess.value = `已新增「${addedHolding.ticker} · ${addedHolding.name}」，持有數量 ${addedHolding.quantity.toLocaleString('zh-TW')} 股；新增表單已清空。`
    await nextTick()
    tickerInput.value?.focus()
  } catch (error) {
    formError.value = `新增持倉失敗：${error?.message || '無法儲存資料。'}`
  }
}
async function submitFromNumberInput(event) {
  event?.currentTarget?.blur()
  await nextTick()
  await submit()
}
async function refreshMarket() { marketResult.value = await store.marketPreview() }
async function saveQuantity(holding, value) {
  holdingEditError.value = ''
  if (!(Number(value) > 0)) {
    quantityDrafts[holding.id] = holding.quantity
    holdingEditError.value = `「${holding.name}」的持有數量必須大於 0，這次修改沒有保存。`
    return
  }
  if (Number(value) === Number(holding.quantity)) {
    delete quantityDrafts[holding.id]
    return
  }
  try {
    await store.updateHolding(holding.id, { quantity: Number(value) })
    delete quantityDrafts[holding.id]
  } catch (error) {
    delete quantityDrafts[holding.id]
    holdingEditError.value = `「${holding.name}」的持有數量儲存失敗：${error?.message || '無法寫入資料。'}`
  }
}
async function savePrice(holding, value) {
  holdingEditError.value = ''
  if (!(Number(value) > 0)) {
    priceDrafts[holding.id] = holding.price
    holdingEditError.value = `「${holding.name}」的目前價格必須大於 0，這次修改沒有保存。`
    return
  }
  if (Number(value) === Number(holding.price)) {
    delete priceDrafts[holding.id]
    return
  }
  try {
    await store.updateHolding(holding.id, { price: Number(value), priceSource: 'manual' })
    delete priceDrafts[holding.id]
  } catch (error) {
    delete priceDrafts[holding.id]
    holdingEditError.value = `「${holding.name}」的價格儲存失敗：${error?.message || '無法寫入資料。'}`
  }
}
async function requestDeleteHolding(holdingId) {
  expandedHoldingId.value = ''
  deleteError.value = ''
  pendingDeleteHoldingId.value = holdingId
}
async function confirmDeleteHolding(holding) {
  deleteError.value = ''
  try {
    await store.deleteHolding(holding.id)
    pendingDeleteHoldingId.value = ''
  } catch (error) {
    deleteError.value = `刪除「${holding.name}」失敗：${error?.message || '無法儲存資料。'}`
  }
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Investment holdings" title="投資持倉" description="集中管理商品數量與價格；券商帳戶裡尚未投資的現金，請留在帳戶結構。">
      <template #actions><button class="btn btn-secondary" :disabled="store.saving || !store.activeHoldings.length" @click="refreshMarket"><RefreshCw :size="18" />更新收盤價</button></template>
    </PageHeader>
    <AppNotice v-if="marketResult?.warnings?.length" tone="warning" title="市場資料需要確認" class="space-after">
      <div v-for="warning in marketResult.warnings" :key="warning">{{ warning }}</div>
    </AppNotice>
    <AppNotice v-if="holdingEditError" tone="error" title="持倉修改沒有保存" class="space-after">{{ holdingEditError }}</AppNotice>
    <div class="investment-workspace">
      <UiPanel class="add-holding-panel" title="新增持倉" description="輸入商品代號後，名稱與價格會自動帶入。">
        <form class="create-holding-form" @submit.prevent="submit">
          <AppNotice v-if="formSuccess" tone="success" title="新增成功" aria-live="polite">{{ formSuccess }}</AppNotice>
          <div class="field">
            <label for="ticker">股票／商品代號</label>
            <div class="lookup-row">
              <input id="ticker" ref="tickerInput" v-model="form.ticker" class="input" placeholder="例如：0050" autocomplete="off" required @input="formSuccess = ''" @keydown.enter.prevent="lookupTickerAndFocusQuantity" @blur="normalizedTicker && lookup.status === 'idle' && lookupTicker()" />
              <button class="btn btn-secondary" type="button" :disabled="lookup.loading || !normalizedTicker" @mousedown.prevent @click="lookupTicker">
                <RefreshCw v-if="lookup.loading" class="spin" :size="17" />
                <Search v-else :size="17" />
                {{ lookup.loading ? '查詢中' : '查詢商品' }}
              </button>
            </div>
            <span v-if="lookup.status === 'idle'" class="field-help">目前會自動查詢台灣上市、上櫃股票與 ETF。</span>
          </div>

          <div v-if="lookup.status === 'success'" class="instrument-result" aria-live="polite">
            <CheckCircle2 :size="20" />
            <div><strong>{{ form.ticker }} · {{ form.name }}</strong><span>最近收盤價 {{ priceMoney(form.price) }} · {{ lookup.source }} <a v-if="lookup.yahooUrl" :href="lookup.yahooUrl" target="_blank" rel="noreferrer">Yahoo 股市核對</a></span></div>
          </div>

          <AppNotice v-else-if="lookup.status === 'error'" tone="warning" title="無法自動取得商品資料">
            {{ lookup.message }}名稱與價格欄位已開啟，你仍可手動建立持倉。
          </AppNotice>

          <AppNotice v-else-if="lookup.status === 'manual'" tone="info" title="手動輸入模式">{{ lookup.message }}</AppNotice>

          <div class="create-primary-fields">
            <div class="field"><label for="quantity">持有數量（股數）</label><FormattedNumberInput :key="`quantity-${formResetKey}`" ref="quantityInput" id="quantity" v-model="form.quantity" class="input input--amount" :min="0" :max-fraction-digits="8" placeholder="請輸入股數" required @keydown.enter.prevent="submitFromNumberInput" /></div>
            <div class="field"><label for="holding-class">資產類別</label><UiSelect id="holding-class" v-model="form.assetClass" :options="classOptions" /></div>
          </div>
          <div v-if="manualMode" class="create-primary-fields">
            <div class="field"><label for="holding-name">商品名稱</label><input id="holding-name" v-model="form.name" class="input" placeholder="例如：元大台灣50" required /></div>
            <div class="field"><label for="price">目前價格</label><FormattedNumberInput :key="`price-${formResetKey}`" id="price" v-model="form.price" class="input input--amount" :min="0.01" :max-fraction-digits="4" placeholder="請輸入價格" required @keydown.enter.prevent="submitFromNumberInput" /></div>
          </div>
          <div v-if="form.assetClass === 'other'" class="field"><label for="holding-class-detail">實際資產類型</label><input id="holding-class-detail" v-model="form.assetClassDetail" class="input" placeholder="例如：黃金、REITs、虛擬資產" required /><span class="field-help">會保存於 JSON，並顯示在持倉卡片。</span></div>

          <div class="holding-options">
            <div class="holding-options__title">持倉設定</div>
            <div class="holding-options__body">
              <div class="field"><label for="direction">商品方向</label><UiSelect id="direction" v-model="form.direction" :options="directionOptions" /></div>
              <div class="field"><label for="multiplier">乘數</label><FormattedNumberInput :key="`multiplier-${formResetKey}`" id="multiplier" v-model="form.multiplier" class="input input--amount" :min="0.0001" :max-fraction-digits="6" /><span class="field-help">一般股票與 ETF 維持 1。</span></div>
              <label class="checkbox"><input v-model="form.includeInAssets" type="checkbox" />納入總資產</label>
            </div>
          </div>

          <AppNotice v-if="formError" tone="error" title="無法新增持倉">{{ formError }}</AppNotice>
          <div class="create-form-actions">
            <button v-if="lookup.status === 'idle' && !manualMode" class="btn btn-ghost" type="button" @mousedown.prevent @click="useManualMode">海外或其他商品改用手動輸入</button>
            <button v-if="manualMode" class="btn btn-secondary" type="button" :disabled="lookup.loading || !normalizedTicker" @click="useAutomaticMode"><Search :size="17" />改回自動查詢</button>
            <button class="btn btn-primary" :disabled="store.saving || lookup.loading">{{ lookup.status === 'success' || manualMode ? '新增持倉' : '查詢並新增' }}</button>
          </div>
        </form>
      </UiPanel>
      <UiPanel class="holdings-panel" flush title="目前持倉" :description="holdingListDescription">
        <template #action><div class="holding-header-summary"><span v-if="latestClosingDate" class="pill pill-neutral">最新收盤日 {{ latestClosingDate }}</span><span class="pill pill-blue">市值 {{ money(holdingMarketValue) }}</span></div></template>
        <div v-if="store.activeHoldings.length" class="holding-list-toolbar">
          <div class="holding-search"><Search :size="17" aria-hidden="true" /><label class="sr-only" for="holding-search">搜尋持倉</label><input id="holding-search" v-model="holdingQuery" type="search" placeholder="搜尋商品代號或名稱" /></div>
          <div class="holding-sort" aria-label="持倉排序方式">
            <span>排序</span>
            <button v-for="(label, value) in sortLabels" :key="value" type="button" :class="{ active: holdingSort === value }" :aria-pressed="holdingSort === value" @click="holdingSort = value">{{ label }}</button>
          </div>
          <span class="holding-result-count">{{ displayedHoldings.length }} 筆</span>
        </div>
        <div v-if="displayedHoldings.length" class="holding-card-grid">
          <article v-for="holding in displayedHoldings" :key="holding.id" class="holding-card" @click="handleHoldingRowClick(holding.id, $event)">
            <div class="holding-card__header">
              <div class="holding-identity">
                <div class="holding-code-line"><span class="holding-code">{{ holding.ticker }}</span><span class="holding-price-source">{{ holding.priceSource === 'auto' ? '自動價格' : '手動價格' }}</span></div>
                <h3 class="holding-name">{{ holding.name }}</h3>
                <div class="holding-meta">{{ holdingClassLabel(holding) }} · {{ directionLabels[holding.direction] }}</div>
              </div>
              <div class="data-row__actions">
                <a v-if="holding.yahooUrl" class="btn btn-ghost btn-icon quote-action" :href="holding.yahooUrl" target="_blank" rel="noreferrer" :aria-label="`前往 Yahoo 股市核對 ${holding.name} 價格`" title="前往 Yahoo 股市核對價格"><ExternalLink :size="16" aria-hidden="true" /></a>
                <button class="btn btn-ghost btn-icon" type="button" :aria-label="`編輯 ${holding.name}`" :aria-expanded="expandedHoldingId === holding.id" :aria-controls="`holding-editor-${holding.id}`" @click="toggleHoldingEdit(holding.id)"><Pencil :size="17" /></button>
                <button class="btn btn-ghost btn-icon delete-action" type="button" :aria-label="`刪除 ${holding.name}`" @click="requestDeleteHolding(holding.id)"><Trash2 :size="17" /></button>
              </div>
            </div>
            <div class="holding-market-value"><span>目前市值</span><strong>{{ money(holdingValue(holding)) }}</strong></div>
            <div class="holding-summary-values">
              <div><span>持有股數</span><strong>{{ quantityText(displayQuantity(holding)) }} 股</strong></div>
              <div><span>目前價格</span><strong>{{ priceMoney(displayPrice(holding)) }}</strong></div>
            </div>
            <div v-if="expandedHoldingId === holding.id" :id="`holding-editor-${holding.id}`" class="holding-edit-fields">
              <div class="holding-compact-field">
                <label :for="`quantity-${holding.id}`">目前持有股數</label>
                <FormattedNumberInput :id="`quantity-${holding.id}`" class="input input--amount" :model-value="displayQuantity(holding)" :min="0" :max-fraction-digits="8" @update:model-value="quantityDrafts[holding.id] = $event" @change="saveQuantity(holding, $event)" />
              </div>
              <div class="holding-compact-field">
                <label :for="`price-${holding.id}`">目前價格</label>
                <FormattedNumberInput :id="`price-${holding.id}`" class="input input--amount" :model-value="displayPrice(holding)" :min="0.01" :max-fraction-digits="4" @update:model-value="priceDrafts[holding.id] = $event" @change="savePrice(holding, $event)" />
              </div>
              <div class="holding-editor-status"><span>離開欄位後自動保存；再按一次鉛筆可收合。</span></div>
            </div>
          </article>
        </div>
        <EmptyState v-else-if="!store.activeHoldings.length" title="還沒有投資持倉" description="使用左側新增區建立第一筆資料。" />
        <EmptyState v-else title="找不到符合的持倉" description="請調整搜尋關鍵字。" />
      </UiPanel>
    </div>
    <ConfirmDialog :open="Boolean(pendingDeleteHolding)" title="刪除這筆持倉？" confirm-label="確認刪除" :busy="store.saving" @close="pendingDeleteHoldingId = ''" @confirm="pendingDeleteHolding && confirmDeleteHolding(pendingDeleteHolding)">
      <p><strong>{{ pendingDeleteHolding?.ticker }} · {{ pendingDeleteHolding?.name }}</strong></p>
      <p>將從目前持倉與資產計算中永久移除；既有歷史盤點不受影響。</p>
      <span v-if="deleteError" class="inline-delete-error">{{ deleteError }}</span>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.investment-workspace { display: grid; grid-template-columns: minmax(300px, 320px) minmax(0, 1fr); align-items: start; gap: 12px; }
.add-holding-panel { position: sticky; top: 12px; }
.add-holding-panel :deep(.panel__header) { padding: 19px 18px 0; }
.add-holding-panel :deep(.panel__body) { padding: 16px 18px 18px; }
.holdings-panel { min-width: 0; }
.create-holding-form { display: grid; gap: 13px; }
.create-primary-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 10px; }
.create-form-actions { display: grid; gap: 8px; }
.create-form-actions .btn { width: 100%; }
.holding-options { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
.holding-options__title { padding: 10px 13px; color: var(--text-soft); font-size: .76rem; font-weight: 760; }
.holding-options__body { display: grid; grid-template-columns: 1fr; gap: 13px; padding: 12px 13px 13px; border-top: 1px solid var(--border); }
.holding-options__body .field { padding-top: 0; }
.holding-options__body .checkbox { min-height: 40px; padding: 9px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.holding-header-summary { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
.holding-list-toolbar { position: sticky; z-index: 3; top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 9px; margin: 10px 12px; padding: 7px 9px; border: 1px solid var(--border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: var(--shadow-xs); backdrop-filter: blur(8px); }
.holding-search { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; color: var(--muted); }
.holding-search input { width: 100%; min-width: 0; padding: 5px 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: .82rem; }
.holding-sort { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-muted); }
.holding-sort > span { padding: 0 5px; color: var(--muted); font-size: .67rem; font-weight: 700; }
.holding-sort button { min-height: 27px; padding: 3px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: .7rem; font-weight: 700; }
.holding-sort button:hover { color: var(--text); }
.holding-sort button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-xs); }
.holding-result-count { flex: 0 0 auto; color: var(--muted); font-size: .72rem; font-weight: 700; }
.holding-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 10px; padding: 0 12px 12px; }
.holding-card { display: grid; align-content: start; gap: 11px; min-width: 0; padding: 13px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.holding-card:hover { border-color: color-mix(in srgb, var(--primary) 28%, var(--border)); box-shadow: var(--shadow-xs); transform: translateY(-1px); }
.holding-card__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; }
.holding-card .data-row__actions { display: flex; gap: 2px; }
.holding-identity { min-width: 0; }
.holding-code-line { display: flex; align-items: center; gap: 7px; }
.holding-code { color: var(--primary); font-size: .76rem; font-weight: 780; letter-spacing: .03em; }
.holding-price-source { color: var(--muted); font-size: .65rem; font-weight: 700; }
.holding-name { margin: 5px 0 0; color: var(--text); font-size: .94rem; line-height: 1.42; font-weight: 760; overflow-wrap: anywhere; }
.holding-meta { margin-top: 4px; color: var(--muted); font-size: .7rem; line-height: 1.4; }
.holding-market-value { display: grid; gap: 2px; padding: 10px 11px; border-radius: 11px; background: var(--primary-soft); }
.holding-market-value span { color: var(--muted); font-size: .65rem; font-weight: 700; }
.holding-market-value strong { color: var(--primary); font-size: 1.04rem; font-variant-numeric: tabular-nums; }
.holding-summary-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; min-width: 0; }
.holding-summary-values > div { display: grid; justify-items: start; min-width: 0; }
.holding-summary-values span { color: var(--muted); font-size: .65rem; font-weight: 700; }
.holding-summary-values strong { max-width: 100%; color: var(--text); font-size: .79rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.quote-action { color: var(--primary); }
.inline-delete-error { display: block; margin-top: 5px; color: var(--danger); font-weight: 700; }
.delete-action { color: var(--danger); }
.confirm-actions { display: flex; gap: 8px; }
.holding-edit-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 8px; padding: 10px; border-radius: var(--radius-md); background: var(--surface-muted); }
.holding-compact-field { display: grid; gap: 4px; min-width: 0; }
.holding-edit-fields label { color: var(--muted); font-size: .68rem; font-weight: 700; }
.holding-edit-fields .input { min-height: 40px; padding-block: 7px; }
.holding-editor-status { display: flex; grid-column: 1 / -1; align-items: center; min-height: 24px; }
.holding-editor-status span { color: var(--muted); font-size: .7rem; }
.lookup-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.lookup-row .btn { white-space: nowrap; }
.instrument-result { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--success) 32%, transparent); border-radius: var(--radius-md); background: color-mix(in srgb, var(--success) 8%, var(--surface)); color: var(--success); }
.instrument-result div { display: grid; gap: 3px; }
.instrument-result strong { color: var(--text); line-height: 1.4; overflow-wrap: anywhere; }
.instrument-result span { color: var(--muted); font-size: .72rem; line-height: 1.45; }
.instrument-result a, .quote-link { color: var(--primary); text-decoration: none; }
.instrument-result a:hover, .quote-link:hover { text-decoration: underline; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1050px) {
  .investment-workspace { grid-template-columns: 1fr; }
  .add-holding-panel { position: static; }
  .holding-card-grid { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); }
}
@media (max-width: 620px) {
  .lookup-row { grid-template-columns: 1fr; }
  .lookup-row .btn { width: 100%; }
  .create-primary-fields { grid-template-columns: 1fr; }
  .holding-list-toolbar { top: 8px; flex-wrap: wrap; margin-inline: 10px; }
  .holding-search { flex-basis: 100%; }
  .holding-sort { flex: 1 1 auto; }
  .holding-sort button { flex: 1; }
  .holding-card-grid { grid-template-columns: 1fr; padding: 0 10px 10px; }
  .confirm-actions { flex-direction: column; }
}
</style>
