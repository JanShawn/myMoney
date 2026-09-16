<script setup>
import {Copy, ListChecks, Plus, RefreshCw, RotateCcw, Trash2} from '@lucide/vue'
import {
  calculateNearestTaiwanOrderPrice,
  calculatePriceDifferencePercent,
  calculatePurchasePriceAdvantagePercent,
} from '~/services/money-domain'
import {copyStockBuyListFormat} from '~/services/stock-buy-list-export'
import {useMoneyStore} from '~/stores/money'

const store = useMoneyStore()
const {showToast} = useToast()
const form = reactive({ticker: ''})
const tickerInput = ref(null)
const stockLookupLoading = ref(false)
const resetDialogOpen = ref(false)
const pendingDeleteId = ref('')
const priceDrafts = reactive({})
const quantityDrafts = reactive({})
const stockQuotes = reactive({})
const quoteLoading = ref(false)
const quoteError = ref('')
let quoteRequestId = 0
let quoteRefreshTimer = null

const pendingDeleteItem = computed(
  () =>
    store.stockBuyList.find((item) => item.id === pendingDeleteId.value) ||
    null,
)
const displayPrice = (item) => priceDrafts[item.id] ?? item.buyPrice
const displayQuantity = (item) => quantityDrafts[item.id] ?? item.quantity
const isBought = (item) => Boolean(item.bought)
const boughtCount = computed(
  () => store.stockBuyList.filter((item) => isBought(item)).length,
)
const hasDailyData = computed(() =>
  store.stockBuyList.some(
    (item) =>
      Number(item.buyPrice) > 0 ||
      Number(item.quantity) > 0 ||
      item.bought,
  ),
)
const latestQuoteDate = computed(
  () =>
    Object.values(stockQuotes)
      .map((quote) => quote.oddLotMarketDate || quote.navMarketDate || quote.marketDate)
      .filter(Boolean)
      .sort()
      .at(-1) || '',
)
const latestQuoteTime = computed(
  () =>
    Object.values(stockQuotes)
      .map((quote) => quote.oddLotQuoteTime || quote.navQuoteTime || quote.quoteTime)
      .filter(Boolean)
      .sort()
      .at(-1) || '',
)
const todayTotal = computed(() =>
  store.stockBuyList.reduce((total, item) => {
    if (!isBought(item)) return total
    return total + Number(displayPrice(item) || 0) * Number(displayQuantity(item) || 0)
  }, 0),
)
const money = (value) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0)
const priceMoney = (value) => (Number(value) > 0 ? money(value) : '—')
const quoteFor = (item) => stockQuotes[item.ticker] || null
const priceGapWarningPercent = 1
const estimatedNetAssetValue = (item) =>
  Number(quoteFor(item)?.estimatedNetAssetValue) > 0
    ? Number(quoteFor(item).estimatedNetAssetValue)
    : null
const nearestNetPrice = (item) =>
  calculateNearestTaiwanOrderPrice(estimatedNetAssetValue(item), item.ticker)
const oddLotBuyPrice = (item) => {
  const quote = quoteFor(item)
  return (
    [quote?.oddLotAskPrice, quote?.oddLotPrice].find(
      (value) => Number(value) > 0,
    ) || null
  )
}
const estimatedUnitPrice = (item) => {
  const quote = quoteFor(item)
  return oddLotBuyPrice(item) ?? (Number(quote?.currentPrice) > 0 ? quote.currentPrice : null)
}
const referenceDifferencePercent = (item) =>
  calculatePriceDifferencePercent(
    oddLotBuyPrice(item),
    estimatedNetAssetValue(item) ?? quoteFor(item)?.regularMarketPrice,
  )
const referenceDifferenceLabel = (item) =>
  estimatedNetAssetValue(item) != null
    ? '零股價格相較淨價'
    : '零股價格相較整股'
const priceGapIsLarge = (item) =>
  Math.abs(referenceDifferencePercent(item)) >= priceGapWarningPercent
const estimatedPriceBasis = (item) => {
  const quote = quoteFor(item)
  if (Number(quote?.oddLotAskPrice) > 0) return '零股最低賣價'
  if (Number(quote?.oddLotPrice) > 0) return '零股最新成交價'
  if (Number(quote?.currentPrice) > 0) return '整股現價 fallback'
  return ''
}
const estimatedAmount = (item) => {
  const quantity = Number(displayQuantity(item) || 0)
  const price = estimatedUnitPrice(item)
  return quantity > 0 && price > 0 ? quantity * price : null
}
const estimatedTotal = computed(() =>
  store.stockBuyList.reduce(
    (total, item) => total + Number(estimatedAmount(item) || 0),
    0,
  ),
)
const displayOrderPrice = (value) =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
const buyVsCurrentPricePercent = (item) =>
  calculatePurchasePriceAdvantagePercent(
    displayPrice(item),
    estimatedUnitPrice(item),
  )
const quoteDate = (value) => String(value || '').replaceAll('-', '/')
const quoteTime = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
const percentText = (value) => {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.005) return '0.00%'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}
const purchaseComparisonTone = (value) =>
  Number(value) > 0
    ? 'quote-change--positive'
    : Number(value) < 0
      ? 'quote-change--negative'
      : 'quote-change--neutral'
const purchaseComparisonLabel = (value) => {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) < 0.005) return '同價'
  return value > 0 ? '買便宜' : '買貴'
}

async function refreshBuyListQuotes({force = false, notify = false} = {}) {
  const requestId = ++quoteRequestId
  if (!store.stockBuyList.length) {
    for (const ticker of Object.keys(stockQuotes)) delete stockQuotes[ticker]
    quoteError.value = ''
    quoteLoading.value = false
    return
  }

  quoteLoading.value = true
  quoteError.value = ''
  try {
    const result = await store.loadStockBuyListQuotes(force)
    if (requestId !== quoteRequestId) return
    for (const ticker of Object.keys(stockQuotes)) delete stockQuotes[ticker]
    Object.assign(stockQuotes, result.quotes)
    if (!Object.keys(result.quotes).length) {
      quoteError.value = result.warnings[0] || '暫時無法取得行情資料。'
    }
    if (notify) {
      showToast({
        tone: Object.keys(result.quotes).length ? 'success' : 'error',
        title: Object.keys(result.quotes).length
          ? '行情已更新'
          : '行情更新失敗',
        message: latestQuoteDate.value
          ? `最新行情日 ${quoteDate(latestQuoteDate.value)}。`
          : quoteError.value,
      })
    }
  } catch (error) {
    if (requestId !== quoteRequestId) return
    quoteError.value = error?.message || '暫時無法取得行情資料。'
    if (notify) {
      showToast({
        tone: 'error',
        title: '行情更新失敗',
        message: quoteError.value,
      })
    }
  } finally {
    if (requestId === quoteRequestId) quoteLoading.value = false
  }
}

async function addStock() {
  if (!String(form.ticker || '').trim()) {
    showToast({
      tone: 'error',
      title: '無法加入股票',
      message: '請輸入股票代號。',
    })
    tickerInput.value?.focus()
    return
  }
  stockLookupLoading.value = true
  try {
    const instrument = await store.lookupStockName(form.ticker)
    const item = await store.addStockBuyListItem({
      ticker: instrument.ticker,
      name: instrument.name,
    })
    form.ticker = ''
    showToast({
      tone: 'success',
      title: '已加入待買清單',
      message: `「${item.ticker} · ${item.name}」會持續保留，直到你刪除它。`,
    })
    await nextTick()
    tickerInput.value?.focus()
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '無法加入股票',
      message: error?.message || '無法儲存資料。',
    })
  } finally {
    stockLookupLoading.value = false
  }
}

let stockNameHydrationRunning = false
async function hydrateMissingStockNames() {
  if (stockNameHydrationRunning) return
  const missingItems = store.stockBuyList.filter((item) => !item.name)
  if (!missingItems.length) return
  stockNameHydrationRunning = true
  try {
    const resolvedNames = []
    for (const item of missingItems) {
      try {
        const instrument = await store.lookupStockName(item.ticker)
        resolvedNames.push({id: item.id, name: instrument.name})
      } catch {
        // 個別代號查不到時保留代號，不影響其他股票補上名稱。
      }
    }
    if (resolvedNames.length) await store.updateStockBuyListNames(resolvedNames)
  } catch {
    store.error = ''
  } finally {
    stockNameHydrationRunning = false
  }
}

watch(
  () =>
    store.stockBuyList
      .map((item) => `${item.id}:${item.ticker}:${item.name}`)
      .join('|'),
  () => hydrateMissingStockNames(),
  {immediate: true},
)

watch(
  () => store.stockBuyList.map((item) => item.ticker).join('|'),
  () => refreshBuyListQuotes(),
  {immediate: true},
)

onMounted(() => {
  quoteRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !quoteLoading.value) {
      refreshBuyListQuotes({force: true})
    }
  }, 60_000)
})

onBeforeUnmount(() => {
  if (quoteRefreshTimer != null) window.clearInterval(quoteRefreshTimer)
})

async function copyStockListFormat() {
  try {
    const result = await copyStockBuyListFormat(store.stockBuyList)
    showToast({
      tone: 'success',
      title: '完整股票資料已複製',
      message: `待買清單已放入 key 3，共 ${result.count} 筆（包含 ^TWII）。`,
    })
  } catch (error) {
    showToast({
      tone: 'error',
      title: '無法複製股票格式',
      message: error?.message || '瀏覽器無法寫入剪貼簿。',
    })
  }
}

const numberDraftsByKey = {
  buyPrice: priceDrafts,
  quantity: quantityDrafts,
}
const numberFieldLabels = {
  buyPrice: '買進價格',
  quantity: '股數',
}
const clearNumberDraft = (itemId, key) => {
  delete numberDraftsByKey[key]?.[itemId]
}

async function saveNumber(item, key, value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number < 0) {
    showToast({
      tone: 'error',
      title: '數字沒有保存',
      message: `${numberFieldLabels[key]}不能小於 0。`,
    })
    clearNumberDraft(item.id, key)
    return
  }
  try {
    await store.updateStockBuyListItem(item.id, {[key]: number})
    clearNumberDraft(item.id, key)
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '數字沒有保存',
      message: error?.message || '無法儲存資料。',
    })
  }
}

const buyControlFields = [
  'quantity',
  'price',
  'bought',
  'delete',
]
const buyControlId = (field, itemId) => {
  if (field === 'price') return `buy-price-${itemId}`
  if (field === 'quantity') return `buy-quantity-${itemId}`
  return `buy-${field}-${itemId}`
}

function selectNumberInput(event) {
  event.target?.select()
}

async function saveBought(item, event) {
  const bought = event.target.checked
  try {
    await store.updateStockBuyListItem(item.id, {bought})
  } catch (error) {
    event.target.checked = Boolean(item.bought)
    store.error = ''
    showToast({
      tone: 'error',
      title: '成交狀態沒有保存',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function completePurchase(item, event) {
  const buyPrice = Number(displayPrice(item) || 0)
  if (!(buyPrice > 0)) {
    showToast({
      tone: 'error',
      title: '尚未填寫買進價格',
      message: '請先輸入買進價格，再按 Enter 標記為已成交。',
    })
    return
  }

  event.preventDefault()
  event.target?.blur()
  try {
    await store.updateStockBuyListItem(item.id, {buyPrice, bought: true})
    clearNumberDraft(item.id, 'buyPrice')
    const itemIndex = store.stockBuyList.findIndex((entry) => entry.id === item.id)
    const nextItem = store.stockBuyList[itemIndex + 1]
    await nextTick()
    if (nextItem) document.getElementById(`buy-quantity-${nextItem.id}`)?.focus()
    else tickerInput.value?.focus()
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '成交狀態沒有保存',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function moveBuyListFocus(item, field, event) {
  const itemIndex = store.stockBuyList.findIndex(
    (entry) => entry.id === item.id,
  )
  const fieldIndex = buyControlFields.indexOf(field)
  if (itemIndex < 0 || fieldIndex < 0) return

  const movingBackward = event.shiftKey
  let nextItemIndex = itemIndex + (movingBackward ? -1 : 1)
  let nextFieldIndex = fieldIndex

  if (nextItemIndex < 0 || nextItemIndex >= store.stockBuyList.length) {
    nextFieldIndex += movingBackward ? -1 : 1
    if (nextFieldIndex < 0 || nextFieldIndex >= buyControlFields.length) return
    nextItemIndex = movingBackward ? store.stockBuyList.length - 1 : 0
  }

  const nextItem = store.stockBuyList[nextItemIndex]
  const nextField = buyControlFields[nextFieldIndex]
  event.preventDefault()
  await nextTick()
  document.getElementById(buyControlId(nextField, nextItem.id))?.focus()
}

async function confirmReset() {
  try {
    await store.resetStockBuyListDaily()
    for (const drafts of Object.values(numberDraftsByKey)) {
      for (const key of Object.keys(drafts)) delete drafts[key]
    }
    resetDialogOpen.value = false
    showToast({
      tone: 'success',
      title: '今日紀錄已重設',
      message: '已清除股數、買進價格與已成交勾選；股票仍保留在清單中。',
    })
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: 'Reset 沒有完成',
      message: error?.message || '無法儲存資料。',
    })
  }
}

async function confirmDelete() {
  const item = pendingDeleteItem.value
  if (!item) return
  try {
    await store.deleteStockBuyListItem(item.id)
    for (const key of Object.keys(numberDraftsByKey)) {
      clearNumberDraft(item.id, key)
    }
    pendingDeleteId.value = ''
    showToast({
      tone: 'success',
      title: '股票已刪除',
      message: `已從待買清單移除「${item.ticker}」。`,
    })
  } catch (error) {
    store.error = ''
    showToast({
      tone: 'error',
      title: '刪除沒有完成',
      message: error?.message || '無法儲存資料。',
    })
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Daily buy list"
      title="股票待買清單"
      description="勾選已成交即可記錄今日買進；股票與今日買進紀錄都會自動保存在本機。"
    >
      <template #actions>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="quoteLoading || !store.stockBuyList.length"
          @click="refreshBuyListQuotes({force: true, notify: true})"
        >
          <RefreshCw
            :class="{spin: quoteLoading}"
            :size="18"
            aria-hidden="true"
          />
          {{ quoteLoading ? '更新行情中…' : '更新行情' }}
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="!store.stockBuyList.length"
          @click="copyStockListFormat"
        >
          <Copy :size="18" aria-hidden="true" />
          複製完整股票資料
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="store.saving || !hasDailyData"
          @click="resetDialogOpen = true"
        >
          <RotateCcw :size="18" aria-hidden="true" />
          Reset 今日紀錄
        </button>
      </template>
    </PageHeader>

    <div class="buy-list-workspace">
      <UiPanel
        class="add-stock-panel"
        title="加入待買股票"
        description="輸入股票代號即可；股票與買進紀錄會保留到你主動重設或刪除。"
      >
        <form class="add-stock-form" @submit.prevent="addStock">
          <div class="field">
            <label for="buy-list-ticker">股票代號</label>
            <input
              id="buy-list-ticker"
              ref="tickerInput"
              v-model.trim="form.ticker"
              class="input"
              type="text"
              maxlength="12"
              autocomplete="off"
              placeholder="例如：2330"
              required
              :disabled="stockLookupLoading"
            />
          </div>
          <button
            class="btn btn-primary btn-block"
            type="submit"
            :disabled="store.saving || stockLookupLoading"
          >
            <Plus :size="18" aria-hidden="true" />
            {{ stockLookupLoading ? '查詢名稱中…' : '加入清單' }}
          </button>
        </form>
      </UiPanel>

      <UiPanel
      class="today-buy-panel"
      flush
      title="今日買進"
      description="填入股數即可依盤中零股行情估算金額；ETF iNAV 會由官方資料自動更新。"
      >
        <template #action>
          <div class="buy-summary" aria-live="polite">
            <span v-if="latestQuoteDate" class="pill pill-neutral"
              >官方行情 {{ quoteDate(latestQuoteDate) }}
              {{ quoteTime(latestQuoteTime) }}</span
            >
            <span class="pill pill-neutral"
              >{{ boughtCount }} / {{ store.stockBuyList.length }} 已成交</span
            >
            <span v-if="estimatedTotal > 0" class="pill pill-neutral"
              >零股預估 {{ money(estimatedTotal) }}</span
            >
            <span class="pill">今日合計 {{ money(todayTotal) }}</span>
          </div>
        </template>

        <AppNotice
          v-if="quoteError"
          tone="warning"
          title="行情暫時無法更新"
          >{{ quoteError }}</AppNotice
        >
        <p v-if="store.stockBuyList.length" class="estimate-disclaimer">
          預估金額不含券商手續費；優先使用零股最低賣價，沒有賣方掛單時才參考最新成交價。
        </p>

        <div v-if="store.stockBuyList.length" class="buy-list-table">
          <div class="buy-list-header" aria-hidden="true">
            <span>股票與行情</span>
            <span>股數</span>
            <span>淨價</span>
            <span>買進價格</span>
            <span>已成交</span>
            <span />
          </div>
          <article
            v-for="item in store.stockBuyList"
            :key="item.id"
            class="buy-row"
            :class="{'buy-row--done': isBought(item)}"
          >
            <div class="buy-row__identity">
              <div class="buy-row__stock-title">
                <strong>{{ item.ticker }}</strong>
                <span v-if="item.name">{{ item.name }}</span>
              </div>
              <div v-if="quoteFor(item)" class="buy-row__quote">
                <small
                  >整股 {{ priceMoney(quoteFor(item).regularMarketPrice) }} · 零股成交
                  {{ priceMoney(quoteFor(item).oddLotPrice) }} · 零股賣價
                  {{ priceMoney(quoteFor(item).oddLotAskPrice) }}</small
                >
                <small
                  v-if="Number.isFinite(referenceDifferencePercent(item))"
                  class="odd-lot-gap"
                  :class="{'odd-lot-gap--warning': priceGapIsLarge(item)}"
                >
                  {{ referenceDifferenceLabel(item) }}
                  {{ percentText(referenceDifferencePercent(item)) }}
                  <template v-if="priceGapIsLarge(item)"> · 差異超過 1%</template>
                  · {{ quoteTime(quoteFor(item).oddLotQuoteTime) }}
                </small>
              </div>
              <small v-else class="buy-row__quote-status">{{
                quoteLoading ? '行情載入中…' : '暫無行情'
              }}</small>
            </div>

            <div class="buy-field buy-field--quantity">
              <label class="buy-field__label" :for="`buy-quantity-${item.id}`"
                >股數</label
              >
              <div class="number-control">
                <FormattedNumberInput
                  :id="`buy-quantity-${item.id}`"
                  class="input input--amount"
                  :model-value="displayQuantity(item)"
                  :min="0"
                  :max-fraction-digits="8"
                  placeholder="0"
                  @update:model-value="quantityDrafts[item.id] = $event"
                  @change="saveNumber(item, 'quantity', $event)"
                  @focus="selectNumberInput"
                  @keydown.tab="moveBuyListFocus(item, 'quantity', $event)"
                />
                <span>股</span>
              </div>
              <small
                v-if="estimatedAmount(item) != null"
                class="buy-estimate"
                aria-live="polite"
              >
                預估 {{ money(estimatedAmount(item)) }} ·
                {{ estimatedPriceBasis(item) }}
              </small>
            </div>

            <div class="buy-field buy-field--net-price">
              <span class="buy-field__heading">淨價</span>
              <div v-if="estimatedNetAssetValue(item) != null" class="market-readout">
                <strong>{{ priceMoney(estimatedNetAssetValue(item)) }}</strong>
                <small>
                  資料時間 {{ quoteTime(quoteFor(item).navQuoteTime) }}
                </small>
              </div>
              <small v-else class="market-readout__empty"
                >非 ETF 或目前未提供</small
              >
              <small
                v-if="nearestNetPrice(item) != null"
                class="net-price-suggestion"
                aria-live="polite"
              >
                可下單價：NT$ {{ displayOrderPrice(nearestNetPrice(item)) }}
              </small>
            </div>

            <div class="buy-field buy-field--price">
              <label class="buy-field__label" :for="`buy-price-${item.id}`"
                >買進價格</label
              >
              <div class="number-control">
                <span>NT$</span>
                <FormattedNumberInput
                  :id="`buy-price-${item.id}`"
                  class="input input--amount"
                  :model-value="displayPrice(item)"
                  :min="0"
                  :max-fraction-digits="4"
                  placeholder="0"
                  @update:model-value="priceDrafts[item.id] = $event"
                  @change="saveNumber(item, 'buyPrice', $event)"
                  @focus="selectNumberInput"
                  @keydown.tab="moveBuyListFocus(item, 'price', $event)"
                  @keydown.enter="completePurchase(item, $event)"
                />
              </div>
              <div
                v-if="quoteFor(item) && Number(displayPrice(item)) > 0"
                class="price-comparisons"
              >
                <small
                  class="price-comparison"
                  :class="
                    purchaseComparisonTone(buyVsCurrentPricePercent(item))
                  "
                >
                  相較零股估算價 {{ percentText(buyVsCurrentPricePercent(item)) }} ·
                  {{ purchaseComparisonLabel(buyVsCurrentPricePercent(item)) }}
                </small>
              </div>
            </div>

            <label class="buy-row__bought" :for="`buy-bought-${item.id}`">
              <input
                :id="`buy-bought-${item.id}`"
                type="checkbox"
                :checked="item.bought"
                @change="saveBought(item, $event)"
                @keydown.tab="moveBuyListFocus(item, 'bought', $event)"
              />
              <span>已成交</span>
            </label>

            <button
              :id="`buy-delete-${item.id}`"
              class="btn btn-ghost btn-icon buy-row__delete"
              type="button"
              :aria-label="`刪除 ${item.ticker}${item.name ? ` ${item.name}` : ''}`"
              @click="pendingDeleteId = item.id"
              @keydown.tab="moveBuyListFocus(item, 'delete', $event)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </article>
        </div>

        <EmptyState
          v-else
          title="還沒有待買股票"
          description="使用左側加入股票；填入股數後會依盤中零股行情自動估算金額。"
        >
          <template #icon
            ><ListChecks :size="22" aria-hidden="true"
          /></template>
          <template #action
            ><button
              class="btn btn-primary"
              type="button"
              @click="tickerInput?.focus()"
            >
              加入第一檔股票
            </button></template
          >
        </EmptyState>
      </UiPanel>
    </div>

    <ConfirmDialog
      :open="resetDialogOpen"
      title="Reset 今日買進紀錄？"
      confirm-label="確認 Reset"
      tone="info"
      :busy="store.saving"
      @close="resetDialogOpen = false"
      @confirm="confirmReset"
    >
      <p>
        將清除所有股票的<strong>股數、買進價格與已成交勾選</strong
        >；股票本身會保留在清單中。
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(pendingDeleteItem)"
      title="刪除這檔待買股票？"
      confirm-label="確認刪除"
      :busy="store.saving"
      @close="pendingDeleteId = ''"
      @confirm="confirmDelete"
    >
      <p v-if="pendingDeleteItem">
        「<strong
          >{{ pendingDeleteItem.ticker
          }}<template v-if="pendingDeleteItem.name">
            · {{ pendingDeleteItem.name }}</template
          ></strong
        >」會從清單永久移除。
      </p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.buy-list-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 310px) minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
.add-stock-panel {
  position: sticky;
  top: 12px;
}
.add-stock-form {
  display: grid;
  gap: 13px;
}
.today-buy-panel {
  min-width: 0;
}
.buy-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.estimate-disclaimer {
  margin: 0;
  padding: 9px 18px 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
.buy-list-table {
  padding-top: 10px;
  overflow-x: visible;
}
.buy-list-header,
.buy-row {
  display: grid;
  grid-template-columns:
    minmax(190px, 0.9fr) repeat(3, minmax(145px, 0.55fr)) minmax(82px, auto) 34px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-inline: 18px;
}
.buy-list-header {
  min-height: 34px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 760;
}
.buy-row {
  min-height: 76px;
  padding-block: 11px;
  border-top: 1px solid var(--border);
  transition:
    background-color 0.18s,
    border-color 0.18s;
}
.buy-row:hover {
  background: var(--surface-hover);
}
.buy-row--done {
  background: var(--success-soft);
}
.buy-row--done:hover {
  background: color-mix(in srgb, var(--success-soft) 84%, var(--surface));
}
.buy-row__identity {
  grid-column: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}
.buy-row__stock-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}
.buy-row__identity strong {
  color: var(--primary);
  font-size: 0.9rem;
  letter-spacing: 0.025em;
}
.buy-row__identity span {
  overflow: hidden;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.buy-row__quote {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}
.buy-row__quote > small,
.buy-row__quote-status {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.buy-row__quote .odd-lot-gap {
  color: var(--text-soft);
  white-space: normal;
}
.buy-row__quote .odd-lot-gap--warning {
  color: var(--danger);
  font-weight: 780;
}
.price-comparisons {
  display: grid;
  gap: 3px;
  margin-top: 5px;
}
.price-comparison {
  font-size: 0.67rem;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}
.price-comparison.quote-change--positive {
  color: var(--success);
}
.price-comparison.quote-change--negative {
  color: var(--danger);
}
.price-comparison.quote-change--neutral {
  color: var(--muted);
}
.buy-row > .buy-field {
  min-width: 0;
  align-self: stretch;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}
.buy-field--quantity {
  grid-column: 2;
}
.buy-field--net-price {
  grid-column: 3;
}
.buy-field--price {
  grid-column: 4;
}
.buy-row__bought {
  grid-column: 5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  color: var(--text-soft);
  font-size: 0.78rem;
  font-weight: 760;
  cursor: pointer;
  white-space: nowrap;
}
.buy-row__bought input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--success);
  cursor: pointer;
}
.buy-field {
  min-width: 0;
}
.buy-field__label,
.buy-field__heading {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.number-control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 720;
}
.number-control .input {
  min-width: 0;
  min-height: 40px;
  padding-block: 7px;
}
.buy-estimate,
.net-price-suggestion {
  display: block;
  margin-top: 5px;
  color: var(--primary);
  font-size: 0.72rem;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
}
.buy-estimate {
  color: var(--text-soft);
}
.market-readout {
  display: grid;
  gap: 3px;
  min-height: 40px;
}
.market-readout strong {
  color: var(--text);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}
.market-readout small,
.market-readout__empty {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1.35;
}
.market-readout__empty {
  display: block;
  min-height: 40px;
  padding-top: 9px;
}
.buy-row__delete {
  grid-column: 6;
  grid-row: 1;
  width: 30px;
  min-width: 30px;
  min-height: 30px;
  justify-self: center;
  align-self: center;
  color: var(--danger);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1500px) {
  .buy-list-workspace {
    grid-template-columns: 1fr;
  }
  .add-stock-panel {
    position: static;
  }
  .add-stock-form {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
  .add-stock-form .btn {
    min-width: 132px;
  }
}

@media (max-width: 1200px) {
  .buy-summary {
    justify-content: flex-start;
  }
  .buy-list-header {
    display: none;
  }
  .buy-list-table {
    display: grid;
    gap: 10px;
    padding: 10px;
    overflow-x: visible;
  }
  .buy-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
      'identity identity delete'
      'quantity net-price price'
      'bought bought bought';
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .buy-row--done {
    border-color: var(--success-border);
    background: var(--success-soft);
  }
  .buy-row__identity {
    grid-area: identity;
  }
  .buy-row__delete {
    grid-area: delete;
    justify-self: end;
  }
  .buy-field--quantity {
    grid-area: quantity;
  }
  .buy-field--net-price {
    grid-area: net-price;
  }
  .buy-field--price {
    grid-area: price;
  }
  .buy-row__bought {
    grid-area: bought;
    justify-self: start;
  }
  .buy-field__label,
  .buy-field__heading {
    position: static;
    display: block;
    width: auto;
    height: auto;
    margin: 0 0 5px;
    overflow: visible;
    clip: auto;
    color: var(--text-soft);
    font-size: 0.76rem;
    font-weight: 720;
    white-space: normal;
  }
}

@media (max-width: 620px) {
  .today-buy-panel :deep(.panel__header) {
    flex-direction: column;
  }
  .today-buy-panel :deep(.panel__action),
  .buy-summary {
    width: 100%;
    justify-content: flex-start;
  }
  .buy-row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'identity'
      'quantity'
      'net-price'
      'price'
      'bought'
      'delete';
  }
  .add-stock-form {
    grid-template-columns: 1fr;
  }
  .add-stock-form .btn {
    width: 100%;
  }
}
</style>
