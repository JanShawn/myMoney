<script setup>
import { CheckCircle2, ExternalLink, LayoutGrid, List, Pencil, RefreshCw, Search, Trash2 } from '@lucide/vue'
import { yahooQuoteUrl } from '~/services/market-service'
import { defaultHoldingLeverage } from '~/services/money-domain'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const defaultForm = () => ({ ticker: '', name: '', market: '', quantity: '', assetClass: 'equity', leverage: 1, price: '', priceSource: 'auto', priceAsOfDate: null, priceSourceLabel: '', yahooUrl: '', liquidity: 'convertible' })
const form = reactive(defaultForm())
const tickerInput = ref(null)
const quantityInput = ref(null)
const expandedHoldingId = ref('')
const holdingQuery = ref('')
const holdingSort = ref('ticker')
const compactMode = ref(false)
const marketResult = ref(null)
const marketUpdating = ref(false)
const resolvedTicker = ref('')
const pendingDeleteHoldingId = ref('')
const quantityDrafts = reactive({})
const priceDrafts = reactive({})
const leverageDrafts = reactive({})
const lookup = reactive({ loading: false, status: 'idle', message: '', source: '', yahooUrl: '' })
const leverageWasEdited = ref(false)
let lookupRequestId = 0
const classLabels = { equity: '股票', bond: '債券' }
const classOptions = Object.entries(classLabels).map(([value, label]) => ({ value, label }))
const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0)
const priceMoney = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value || 0)
const quantityText = (value) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 8 }).format(Number(value || 0))
const normalizedTicker = computed(() => String(form.ticker || '').trim().toUpperCase())
const instrumentReady = computed(() => Boolean(form.name.trim()) && Number(form.price) > 0)
const displayQuantity = (holding) => quantityDrafts[holding.id] ?? holding.quantity
const displayPrice = (holding) => priceDrafts[holding.id] ?? holding.price
const displayLeverage = (holding) => leverageDrafts[holding.id] ?? holding.leverage ?? 1
const holdingValue = (holding) => Number(displayQuantity(holding) || 0) * Number(displayPrice(holding) || 0)
const holdingExposureValue = (holding) => holdingValue(holding) * Number(displayLeverage(holding) ?? 1)
const holdingMarketValue = computed(() => store.activeHoldings.reduce((sum, holding) => sum + holdingValue(holding), 0))
const holdingTotalExposure = computed(() => store.activeHoldings.reduce((sum, holding) => sum + holdingExposureValue(holding), 0))
const latestClosingDate = computed(() => store.activeHoldings.map((holding) => holding.priceAsOfDate).filter(Boolean).sort().at(-1) || '')
const pendingDeleteHolding = computed(() => store.activeHoldings.find((holding) => holding.id === pendingDeleteHoldingId.value) || null)
const sortLabels = { ticker: '代號', quantity: '股數', marketValue: '市值' }
const HOLDING_VIEW_PREFERENCE_KEY = 'mymoney:holding-view'
const holdingYahooUrl = (holding) => yahooQuoteUrl(holding.ticker, holding.market)
const formYahooUrl = computed(() => yahooQuoteUrl(form.ticker, form.market) || lookup.yahooUrl)
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
const holdingClassLabel = (holding) => classLabels[holding.assetClass] || classLabels.equity
watch(() => form.assetClass, () => {
  if (!leverageWasEdited.value) form.leverage = defaultHoldingLeverage(form)
})
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
  Object.assign(lookup, { status: 'idle', message: '', source: '', yahooUrl: '' })
})
onMounted(() => {
  try {
    compactMode.value = localStorage.getItem(HOLDING_VIEW_PREFERENCE_KEY) === 'compact'
  } catch {
    // 瀏覽器停用儲存時仍可在本次頁面切換模式。
  }
})
watch(compactMode, (compact) => {
  try {
    localStorage.setItem(HOLDING_VIEW_PREFERENCE_KEY, compact ? 'compact' : 'comfortable')
  } catch {
    // 顯示偏好保存失敗不影響持倉操作。
  }
})

function toggleHoldingEdit(holdingId) {
  pendingDeleteHoldingId.value = ''
  expandedHoldingId.value = expandedHoldingId.value === holdingId ? '' : holdingId
}

function handleHoldingRowClick(holdingId, event) {
  if (event?.target?.closest('button, a, input, .notice')) return
  toggleHoldingEdit(holdingId)
}

function revealHoldingEditor(holdingId) {
  const editor = document.getElementById(`holding-editor-${holdingId}`)
  const quantityInput = document.getElementById(`quantity-${holdingId}`)
  quantityInput?.focus({ preventScroll: true })
  editor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function lookupTicker() {
  const requestId = ++lookupRequestId
  if (!normalizedTicker.value) {
    Object.assign(lookup, { status: 'error', message: '請先輸入股票或商品代號。', source: '', yahooUrl: '' })
    return false
  }
  lookup.loading = true
  Object.assign(lookup, { status: 'loading', message: '正在從 Yahoo Finance 查詢商品與最新行情…', source: '', yahooUrl: '' })
  try {
    const instrument = await store.lookupHolding(normalizedTicker.value)
    if (requestId !== lookupRequestId) return false
    resolvedTicker.value = instrument.ticker
    form.ticker = instrument.ticker
    form.name = instrument.name
    form.market = instrument.market
    if (!leverageWasEdited.value) form.leverage = defaultHoldingLeverage(form)
    form.price = instrument.price
    form.priceSource = 'auto'
    form.priceAsOfDate = instrument.marketDate
    form.priceSourceLabel = instrument.source
    form.yahooUrl = instrument.yahooUrl
    Object.assign(lookup, { status: 'success', message: '已從 Yahoo Finance 帶入商品名稱與最新行情價。', source: instrument.source, yahooUrl: instrument.yahooUrl })
    return true
  } catch (error) {
    if (requestId !== lookupRequestId) return false
    resolvedTicker.value = ''
    form.name = ''
    form.market = ''
    form.price = ''
    form.priceSource = 'auto'
    form.priceAsOfDate = null
    form.priceSourceLabel = ''
    form.yahooUrl = ''
    Object.assign(lookup, { status: 'error', message: error?.message || '商品資料查詢失敗，請確認代號後再試一次。', source: '', yahooUrl: '' })
    return false
  } finally {
    if (requestId === lookupRequestId) lookup.loading = false
  }
}

async function lookupTickerAndFocusQuantity() {
  if (!normalizedTicker.value) {
    showToast({ tone: 'error', title: '無法查詢商品', message: '請輸入股票或商品代號。' })
    return
  }
  const alreadyReady = resolvedTicker.value === normalizedTicker.value && instrumentReady.value
  const found = alreadyReady || await lookupTicker()
  if (!found) return
  await nextTick()
  quantityInput.value?.focus()
}

function resetForm() {
  lookupRequestId += 1
  Object.assign(form, defaultForm())
  leverageWasEdited.value = false
  resolvedTicker.value = ''
  Object.assign(lookup, { loading: false, status: 'idle', message: '', source: '', yahooUrl: '' })
}

async function submit() {
  if (!normalizedTicker.value) {
    showToast({ tone: 'error', title: '無法新增持倉', message: '請輸入股票或商品代號。' })
    return
  }
  if (!(Number(form.quantity) > 0)) {
    showToast({ tone: 'error', title: '無法新增持倉', message: '持有數量必須大於 0。' })
    return
  }
  if (form.leverage === '' || !Number.isInteger(Number(form.leverage))) {
    showToast({ tone: 'error', title: '無法新增持倉', message: '商品槓桿倍數必須是整數，可填負數、0 或正整數。' })
    return
  }
  if (resolvedTicker.value !== normalizedTicker.value || !instrumentReady.value) {
    const found = await lookupTicker()
    if (!found) return
  }
  if (!instrumentReady.value) {
    showToast({
      tone: 'error',
      title: '無法新增持倉',
      message: '尚未取得可用的商品名稱與價格。'
    })
    return
  }
  try {
    const addedHolding = { ...form, ticker: normalizedTicker.value, name: form.name.trim(), quantity: Number(form.quantity), leverage: Number(form.leverage), price: Number(form.price) }
    await store.addHolding(addedHolding)
    resetForm()
    showToast({
      tone: 'success',
      title: '持倉已新增',
      message: `已新增「${addedHolding.ticker} · ${addedHolding.name}」，持有數量 ${addedHolding.quantity.toLocaleString('zh-TW')} 股。`
    })
    await nextTick()
    tickerInput.value?.focus()
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '無法新增持倉', message: error?.message || '無法儲存資料。' })
  }
}
async function submitFromNumberInput(event) {
  event?.currentTarget?.blur()
  await nextTick()
  await submit()
}
async function refreshMarket() {
  marketUpdating.value = true
  marketResult.value = null
  try {
    const result = await store.marketPreview()
    marketResult.value = result
    const total = store.activeHoldings.length
    const updatedCount = store.activeHoldings.filter((holding) => result.prices?.[holding.ticker] != null).length
    const latestDate = latestClosingDate.value || result.asOfDate
    const partial = updatedCount < total || Boolean(result.warnings?.length)
    showToast({
      tone: partial ? 'warning' : 'success',
      title: updatedCount
        ? partial ? '行情價已部分更新' : '所有行情價已更新'
        : '沒有可更新的行情價',
      message: updatedCount
        ? `已從 Yahoo Finance 取得並保存 ${updatedCount}/${total} 筆持倉行情${latestDate ? `，最新行情日 ${latestDate}` : ''}。`
        : '這次沒有取得可用的新行情價，原本價格已保留。'
    })
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '行情價更新失敗',
      message: error?.message || '目前無法取得市場資料，原本價格已保留。'
    })
  } finally {
    marketUpdating.value = false
  }
}
async function saveQuantity(holding, value) {
  if (!(Number(value) > 0)) {
    quantityDrafts[holding.id] = holding.quantity
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的持有數量必須大於 0。` })
    return
  }
  if (Number(value) === Number(holding.quantity)) {
    delete quantityDrafts[holding.id]
    return
  }
  try {
    await store.updateHolding(holding.id, { quantity: Number(value) })
    delete quantityDrafts[holding.id]
    showToast({ tone: 'success', title: '持有股數已更新', message: `「${holding.name}」的持有數量已保存。`, duration: 3000 })
  } catch (error) {
    delete quantityDrafts[holding.id]
    store.error = ''
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的持有數量：${error?.message || '無法寫入資料。'}` })
  }
}
async function savePrice(holding, value) {
  if (!(Number(value) > 0)) {
    priceDrafts[holding.id] = holding.price
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的目前價格必須大於 0。` })
    return
  }
  if (Number(value) === Number(holding.price)) {
    delete priceDrafts[holding.id]
    return
  }
  try {
    await store.updateHolding(holding.id, { price: Number(value), priceSource: 'manual' })
    delete priceDrafts[holding.id]
    showToast({ tone: 'success', title: '持倉價格已更新', message: `「${holding.name}」的目前價格已保存。`, duration: 3000 })
  } catch (error) {
    delete priceDrafts[holding.id]
    store.error = ''
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的價格：${error?.message || '無法寫入資料。'}` })
  }
}
async function saveLeverage(holding, value) {
  const leverage = value === '' ? Number.NaN : Number(value)
  if (!Number.isInteger(leverage)) {
    leverageDrafts[holding.id] = holding.leverage ?? 1
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的商品槓桿倍數必須是整數，可填負數、0 或正整數。` })
    return
  }
  if (leverage === Number(holding.leverage ?? 1)) {
    delete leverageDrafts[holding.id]
    return
  }
  try {
    await store.updateHolding(holding.id, { leverage })
    delete leverageDrafts[holding.id]
    showToast({ tone: 'success', title: '商品槓桿已更新', message: `「${holding.name}」的槓桿倍數已保存。`, duration: 3000 })
  } catch (error) {
    delete leverageDrafts[holding.id]
    store.error = ''
    showToast({ tone: 'error', title: '持倉修改沒有保存', message: `「${holding.name}」的槓桿倍數：${error?.message || '無法寫入資料。'}` })
  }
}
async function requestDeleteHolding(holdingId) {
  expandedHoldingId.value = ''
  pendingDeleteHoldingId.value = holdingId
}
async function confirmDeleteHolding(holding) {
  try {
    await store.deleteHolding(holding.id)
    pendingDeleteHoldingId.value = ''
    showToast({ tone: 'success', title: '持倉已刪除', message: `「${holding.ticker} · ${holding.name}」已永久刪除。` })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '刪除沒有完成', message: `「${holding.name}」：${error?.message || '無法儲存資料。'}` })
  }
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Investment holdings" title="投資持倉" description="集中管理商品數量與價格；券商帳戶裡尚未投資的現金，請留在帳戶結構。">
      <template #actions><button class="btn btn-secondary" :disabled="marketUpdating || store.saving || !store.activeHoldings.length" @click="refreshMarket"><RefreshCw :class="{ spin: marketUpdating }" :size="18" />{{ marketUpdating ? '更新中…' : '更新行情價' }}</button></template>
    </PageHeader>
    <div class="investment-workspace">
      <UiPanel class="add-holding-panel" title="新增持倉" description="輸入商品代號後，名稱與價格會自動帶入。">
        <form class="create-holding-form" @submit.prevent="submit">
          <div class="field">
            <label for="ticker">股票／商品代號</label>
            <div class="lookup-row">
              <input id="ticker" ref="tickerInput" v-model="form.ticker" class="input" placeholder="例如：0050" autocomplete="off" required @keydown.enter.prevent="lookupTickerAndFocusQuantity" @blur="normalizedTicker && lookup.status === 'idle' && lookupTicker()" />
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
            <div><strong>{{ form.ticker }} · {{ form.name }}</strong><span>最新行情價 {{ priceMoney(form.price) }} · {{ lookup.source }} <a v-if="formYahooUrl" :href="formYahooUrl" target="_blank" rel="noreferrer">Yahoo Finance 查看</a></span></div>
          </div>

          <AppNotice v-else-if="lookup.status === 'error'" tone="warning" title="無法取得商品資料">{{ lookup.message }}</AppNotice>

          <div class="create-primary-fields">
            <div class="field"><label for="quantity">持有數量（股數）</label><input id="quantity" ref="quantityInput" v-model.number="form.quantity" class="input input--amount" type="number" inputmode="decimal" min="0" step="any" placeholder="請輸入股數" required @keydown.enter.prevent="submitFromNumberInput" /></div>
            <div class="field"><label for="holding-class">資產類別</label><UiSelect id="holding-class" v-model="form.assetClass" :options="classOptions" /></div>
          </div>
          <div class="holding-options">
            <div class="holding-options__title"><span>商品槓桿比例</span><small>負數反向 · 0 零曝險 · 正數正向</small></div>
            <div class="holding-options__body">
              <div class="field"><label for="leverage">槓桿倍數（整數）</label><input id="leverage" v-model.number="form.leverage" class="input input--amount" type="number" step="1" required @input="leverageWasEdited = true" /><span class="field-help">預設：債券 0×、名稱含「正2」的商品 2×，其他商品 1×；仍可手動調整。</span></div>
            </div>
          </div>

          <div class="create-form-actions">
            <button class="btn btn-primary" :disabled="store.saving || lookup.loading">{{ lookup.status === 'success' ? '新增持倉' : '查詢並新增' }}</button>
          </div>
        </form>
      </UiPanel>
      <UiPanel class="holdings-panel" flush title="目前持倉" :description="holdingListDescription">
        <template #action><div class="holding-header-summary"><span v-if="latestClosingDate" class="pill pill-neutral">最新收盤日 {{ latestClosingDate }}</span><span class="pill pill-blue">市值 {{ money(holdingMarketValue) }}</span><span class="pill pill-neutral">淨曝險 {{ money(holdingTotalExposure) }}</span></div></template>
        <div v-if="store.activeHoldings.length" class="holding-list-toolbar">
          <div class="holding-search"><Search :size="17" aria-hidden="true" /><label class="sr-only" for="holding-search">搜尋持倉</label><input id="holding-search" v-model="holdingQuery" type="search" placeholder="搜尋商品代號或名稱" /></div>
          <div class="holding-sort" aria-label="持倉排序方式">
            <span>排序</span>
            <button v-for="(label, value) in sortLabels" :key="value" type="button" :class="{ active: holdingSort === value }" :aria-pressed="holdingSort === value" @click="holdingSort = value">{{ label }}</button>
          </div>
          <div class="holding-view-switch" role="group" aria-label="持倉顯示密度">
            <button type="button" :class="{ active: !compactMode }" :aria-pressed="!compactMode" @click="compactMode = false"><LayoutGrid :size="15" aria-hidden="true" />完整</button>
            <button type="button" :class="{ active: compactMode }" :aria-pressed="compactMode" @click="compactMode = true"><List :size="15" aria-hidden="true" />精簡</button>
          </div>
          <span class="holding-result-count">{{ displayedHoldings.length }} 筆</span>
        </div>
        <div v-if="displayedHoldings.length" class="holding-card-grid" :class="{ 'holding-card-grid--compact': compactMode }">
          <article v-for="holding in displayedHoldings" :key="holding.id" class="holding-card" :class="{ 'holding-card--compact': compactMode, 'holding-card--expanded': expandedHoldingId === holding.id }" @click="handleHoldingRowClick(holding.id, $event)">
            <div class="holding-card__header">
              <div class="holding-identity">
                <div class="holding-code-line"><span class="holding-code">{{ holding.ticker }}</span><span v-if="!compactMode" class="holding-price-source">{{ holding.priceSource === 'auto' ? '自動價格' : '手動價格' }}</span></div>
                <h3 class="holding-name">{{ holding.name }}</h3>
                <div v-if="!compactMode" class="holding-meta">{{ holdingClassLabel(holding) }}</div>
              </div>
              <div class="data-row__actions">
                <a v-if="holdingYahooUrl(holding)" class="btn btn-ghost btn-icon quote-action" :href="holdingYahooUrl(holding)" target="_blank" rel="noreferrer" :aria-label="`前往 Yahoo 股市核對 ${holding.name} 價格`" title="前往 Yahoo 股市核對價格"><ExternalLink :size="16" aria-hidden="true" /></a>
                <button class="btn btn-ghost btn-icon" type="button" :aria-label="`編輯 ${holding.name}`" :aria-expanded="expandedHoldingId === holding.id" :aria-controls="`holding-editor-${holding.id}`" @click="toggleHoldingEdit(holding.id)"><Pencil :size="17" /></button>
                <button class="btn btn-ghost btn-icon delete-action" type="button" :aria-label="`刪除 ${holding.name}`" @click="requestDeleteHolding(holding.id)"><Trash2 :size="17" /></button>
              </div>
            </div>
            <div v-if="compactMode" class="holding-compact-summary"><span>{{ quantityText(displayQuantity(holding)) }} 股 · {{ priceMoney(displayPrice(holding)) }}</span><strong>市值 {{ money(holdingValue(holding)) }}</strong></div>
            <div v-else class="holding-market-value"><span>目前市值</span><strong>{{ money(holdingValue(holding)) }}</strong></div>
            <div v-if="!compactMode" class="holding-summary-values">
              <div><span>持有股數</span><strong>{{ quantityText(displayQuantity(holding)) }} 股</strong></div>
              <div><span>目前價格</span><strong>{{ priceMoney(displayPrice(holding)) }}</strong></div>
              <div><span>槓桿倍數</span><strong>{{ quantityText(displayLeverage(holding)) }}×</strong></div>
              <div><span>淨曝險值</span><strong>{{ money(holdingExposureValue(holding)) }}</strong></div>
            </div>
            <Transition name="holding-editor" @after-enter="revealHoldingEditor(holding.id)">
            <div v-if="expandedHoldingId === holding.id" :id="`holding-editor-${holding.id}`" class="holding-edit-fields">
              <div class="holding-compact-field">
                <label :for="`quantity-${holding.id}`">目前持有股數</label>
                <FormattedNumberInput :id="`quantity-${holding.id}`" class="input input--amount" :model-value="displayQuantity(holding)" :min="0" :max-fraction-digits="8" @update:model-value="quantityDrafts[holding.id] = $event" @change="saveQuantity(holding, $event)" />
              </div>
              <div class="holding-compact-field">
                <label :for="`price-${holding.id}`">目前價格</label>
                <FormattedNumberInput :id="`price-${holding.id}`" class="input input--amount" :model-value="displayPrice(holding)" :min="0.01" :max-fraction-digits="4" @update:model-value="priceDrafts[holding.id] = $event" @change="savePrice(holding, $event)" />
              </div>
              <div class="holding-compact-field">
                <label :for="`leverage-${holding.id}`">商品槓桿倍數</label>
                <input :id="`leverage-${holding.id}`" class="input input--amount" type="number" step="1" :value="displayLeverage(holding)" @input="leverageDrafts[holding.id] = $event.target.value" @change="saveLeverage(holding, $event.target.value)" />
              </div>
              <div class="holding-editor-status"><span>{{ compactMode ? '離開欄位即保存' : '離開欄位後自動保存；再按一次鉛筆可收合。' }}</span></div>
            </div>
            </Transition>
          </article>
        </div>
        <EmptyState v-else-if="!store.activeHoldings.length" title="還沒有投資持倉" description="使用左側新增區建立第一筆資料。" />
        <EmptyState v-else title="找不到符合的持倉" description="請調整搜尋關鍵字。" />
      </UiPanel>
    </div>
    <ConfirmDialog :open="Boolean(pendingDeleteHolding)" title="刪除這筆持倉？" confirm-label="確認刪除" :busy="store.saving" @close="pendingDeleteHoldingId = ''" @confirm="pendingDeleteHolding && confirmDeleteHolding(pendingDeleteHolding)">
      <p><strong>{{ pendingDeleteHolding?.ticker }} · {{ pendingDeleteHolding?.name }}</strong></p>
      <p>將從目前持倉與資產計算中永久移除；既有歷史盤點不受影響。</p>
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
.holding-options__title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 13px; color: var(--text-soft); font-size: .76rem; font-weight: 760; }
.holding-options__title small { color: var(--muted); font-size: .75rem; font-weight: 650; }
.holding-options__body { display: grid; grid-template-columns: 1fr; gap: 13px; padding: 12px 13px 13px; border-top: 1px solid var(--border); }
.holding-options__body .field { padding-top: 0; }
.holding-header-summary { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
.holding-list-toolbar { position: sticky; z-index: 3; top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 9px; margin: 10px 12px; padding: 7px 9px; border: 1px solid var(--border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: var(--shadow-xs); backdrop-filter: blur(8px); }
.holding-search { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; color: var(--muted); }
.holding-search input { width: 100%; min-width: 0; padding: 5px 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: .82rem; }
.holding-sort { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-muted); }
.holding-sort > span { padding: 0 5px; color: var(--muted); font-size: .75rem; font-weight: 700; }
.holding-sort button { min-height: 29px; padding: 3px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: .75rem; font-weight: 700; }
.holding-sort button:hover { color: var(--text); }
.holding-sort button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-xs); }
.holding-view-switch { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-muted); }
.holding-view-switch button { min-height: 29px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: .75rem; font-weight: 700; }
.holding-view-switch button:hover { color: var(--text); }
.holding-view-switch button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-xs); }
.holding-result-count { flex: 0 0 auto; color: var(--muted); font-size: .76rem; font-weight: 700; }
.holding-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; padding: 0 12px 12px; }
.holding-card { display: grid; align-content: start; gap: 11px; min-width: 0; padding: 13px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.holding-card:hover { border-color: color-mix(in srgb, var(--primary) 28%, var(--border)); box-shadow: var(--shadow-xs); transform: translateY(-1px); }
.holding-card-grid--compact { grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 6px; }
.holding-card--compact { position: relative; display: block; min-height: 86px; padding: 9px 10px; }
.holding-card--compact.holding-card--expanded { grid-column: span 2; }
.holding-card--compact .holding-card__header { display: block; }
.holding-card--compact .holding-code-line { padding-right: 78px; }
.holding-card--compact .holding-name { display: block; overflow: hidden; margin-top: 2px; font-size: .82rem; text-overflow: ellipsis; white-space: nowrap; }
.holding-card--compact .holding-card__header > .data-row__actions { position: absolute; top: 5px; right: 5px; gap: 0; opacity: 0; transition: opacity .14s ease; }
.holding-card--compact:hover .holding-card__header > .data-row__actions, .holding-card--compact:focus-within .holding-card__header > .data-row__actions, .holding-card--compact.holding-card--expanded .holding-card__header > .data-row__actions { opacity: 1; }
.holding-card--compact .data-row__actions .btn-icon { width: 26px; min-height: 28px; padding: 4px; }
.holding-compact-summary { display: grid; gap: 1px; min-width: 0; margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--border); }
.holding-compact-summary span, .holding-compact-summary strong { max-width: 100%; overflow: hidden; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.holding-compact-summary span { color: var(--muted); font-size: .69rem; }
.holding-compact-summary strong { color: var(--text); font-size: .78rem; }
.holding-card--compact .holding-edit-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 8px; padding: 8px; }
.holding-card--compact .holding-edit-fields label { overflow: hidden; font-size: .69rem; text-overflow: ellipsis; white-space: nowrap; }
.holding-card--compact .holding-edit-fields .input { min-height: 36px; padding: 6px 7px; font-size: .78rem; }
.holding-card--compact .holding-editor-status { min-height: 18px; }
.holding-card--compact .holding-editor-status span { font-size: .69rem; }
@media (hover: none) { .holding-card--compact .holding-card__header > .data-row__actions { opacity: 1; } }
.holding-card__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; }
.holding-card .data-row__actions { display: flex; gap: 2px; }
.holding-identity { min-width: 0; }
.holding-code-line { display: flex; align-items: center; gap: 7px; }
.holding-code { color: var(--primary); font-size: .76rem; font-weight: 780; letter-spacing: .03em; }
.holding-price-source { color: var(--muted); font-size: .75rem; font-weight: 700; }
.holding-name { margin: 5px 0 0; color: var(--text); font-size: .94rem; line-height: 1.42; font-weight: 760; overflow-wrap: anywhere; }
.holding-meta { margin-top: 4px; color: var(--muted); font-size: .76rem; line-height: 1.4; }
.holding-market-value { display: grid; gap: 2px; padding: 10px 11px; border-radius: 11px; background: var(--primary-soft); }
.holding-market-value span { color: var(--muted); font-size: .75rem; font-weight: 700; }
.holding-market-value strong { color: var(--primary); font-size: 1.04rem; font-variant-numeric: tabular-nums; }
.holding-summary-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; min-width: 0; }
.holding-summary-values > div { display: grid; justify-items: start; min-width: 0; }
.holding-summary-values span { color: var(--muted); font-size: .75rem; font-weight: 700; }
.holding-summary-values strong { max-width: 100%; color: var(--text); font-size: .79rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.quote-action { color: var(--primary); }
.delete-action { color: var(--danger); }
.confirm-actions { display: flex; gap: 8px; }
.holding-edit-fields { display: grid; overflow: hidden; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 8px; padding: 10px; border-radius: var(--radius-md); background: var(--surface-muted); }
.holding-editor-enter-active, .holding-editor-leave-active { max-height: 260px; transition: max-height .22s ease, opacity .16s ease, transform .18s ease, padding .22s ease; }
.holding-editor-enter-from, .holding-editor-leave-to { max-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; transform: translateY(-4px); }
.holding-compact-field { display: grid; gap: 4px; min-width: 0; }
.holding-edit-fields label { color: var(--muted); font-size: .75rem; font-weight: 700; }
.holding-edit-fields .input { min-height: 40px; padding-block: 7px; }
.holding-editor-status { display: flex; grid-column: 1 / -1; align-items: center; min-height: 24px; }
.holding-editor-status span { color: var(--muted); font-size: .76rem; }
.lookup-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.lookup-row .btn { white-space: nowrap; }
.instrument-result { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--success) 32%, transparent); border-radius: var(--radius-md); background: color-mix(in srgb, var(--success) 8%, var(--surface)); color: var(--success); }
.instrument-result div { display: grid; gap: 3px; }
.instrument-result strong { color: var(--text); line-height: 1.4; overflow-wrap: anywhere; }
.instrument-result span { color: var(--muted); font-size: .77rem; line-height: 1.45; }
.instrument-result a, .quote-link { color: var(--primary); text-decoration: none; }
.instrument-result a:hover, .quote-link:hover { text-decoration: underline; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1050px) {
  .investment-workspace { grid-template-columns: 1fr; }
  .add-holding-panel { position: static; }
  .holding-card-grid { grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
}
@media (max-width: 620px) {
  .lookup-row { grid-template-columns: 1fr; }
  .lookup-row .btn { width: 100%; }
  .create-primary-fields { grid-template-columns: 1fr; }
  .holding-list-toolbar { top: 8px; flex-wrap: wrap; margin-inline: 10px; }
  .holding-search { flex-basis: 100%; }
  .holding-sort { flex: 1 1 auto; }
  .holding-sort button { flex: 1; }
  .holding-view-switch { flex: 1 1 auto; }
  .holding-view-switch button { flex: 1; justify-content: center; }
  .holding-card-grid { grid-template-columns: 1fr; padding: 0 10px 10px; }
  .holding-card-grid--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .holding-card--compact.holding-card--expanded { grid-column: span 2; }
  .holding-card--compact .holding-code-line { padding-right: 74px; }
  .holding-card--compact .holding-edit-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .confirm-actions { flex-direction: column; }
}
</style>
