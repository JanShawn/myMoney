<script setup>
import { ArrowDownRight, ArrowUpDown, ArrowUpRight, CalendarRange, ChevronDown, GripVertical, ListChecks, Pencil, Plus, Trash2, WalletCards } from '@lucide/vue'
import { calculateRecurringCashflow, calculateRecurringCashflowForMonth, recurringCashflowAnnualAmount, recurringCashflowMonthlyAmount, recurringCashflowOccurrenceMonths } from '~/services/money-domain'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const defaultForm = () => ({ name: '', type: 'income', amount: '', frequency: 'monthly', occurrenceMonth: new Date().getMonth() + 1 })
const form = reactive(defaultForm())
const formResetKey = ref(0)
const formPanel = ref(null)
const editingId = ref('')
const pendingDeleteId = ref('')
const sortKey = ref('custom')
const sortDirection = ref('asc')
const collapsedGroups = reactive({ income: false, expense: false })
const draggingItemId = ref('')
const dragOverItemId = ref('')
const dragOverPlacement = ref('after')
const selectedMonth = ref(new Date().getMonth() + 1)
const selectionMode = ref(false)
const selectedItemIds = ref([])

const frequencyOptions = [
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'semiannual', label: '每半年' },
  { value: 'annual', label: '每年' }
]
const frequencyLabels = Object.fromEntries(frequencyOptions.map((option) => [option.value, option.label]))
const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1} 月` }))
const sortOptions = [
  { value: 'custom', label: '自訂排序' },
  { value: 'occurrenceMonth', label: '發生月份' },
  { value: 'amount', label: '單次金額' },
  { value: 'monthlyAmount', label: '月均金額' },
  { value: 'annualAmount', label: '年總額' }
]
const sortDirectionLabel = computed(() => {
  if (sortKey.value === 'occurrenceMonth') return sortDirection.value === 'asc' ? '月份早 → 晚' : '月份晚 → 早'
  return sortDirection.value === 'asc' ? '金額低 → 高' : '金額高 → 低'
})

function occurrenceLabel(item) {
  return item.frequency === 'monthly' ? '每月皆發生' : `${recurringCashflowOccurrenceMonths(item).join('、')} 月`
}

function occurrenceSortMonth(item) {
  return item.frequency === 'monthly' ? 0 : recurringCashflowOccurrenceMonths(item)[0]
}

function sortItems(items) {
  if (sortKey.value === 'custom') {
    return [...items].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  }
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return [...items].sort((left, right) => {
    const value = (item) => {
      if (sortKey.value === 'occurrenceMonth') return occurrenceSortMonth(item)
      if (sortKey.value === 'monthlyAmount') return recurringCashflowMonthlyAmount(item)
      if (sortKey.value === 'annualAmount') return recurringCashflowAnnualAmount(item)
      return Number(item.amount || 0)
    }
    return (value(left) - value(right)) * direction || Number(left.order || 0) - Number(right.order || 0)
  })
}

const rawIncomeItems = computed(() => store.recurringCashflowItems.filter((item) => item.type === 'income'))
const rawExpenseItems = computed(() => store.recurringCashflowItems.filter((item) => item.type === 'expense'))
const incomeItems = computed(() => sortItems(rawIncomeItems.value))
const expenseItems = computed(() => sortItems(rawExpenseItems.value))
const pendingDeleteItem = computed(() => store.recurringCashflowItems.find((item) => item.id === pendingDeleteId.value) || null)
const editingItem = computed(() => store.recurringCashflowItems.find((item) => item.id === editingId.value) || null)
const monthItems = computed(() => store.recurringCashflowItems.filter((item) => recurringCashflowOccurrenceMonths(item).includes(Number(selectedMonth.value))))
const monthIncomeCount = computed(() => monthItems.value.filter((item) => item.type === 'income').length)
const monthExpenseCount = computed(() => monthItems.value.filter((item) => item.type === 'expense').length)
const monthlyPlan = computed(() => calculateRecurringCashflowForMonth(store.recurringCashflowItems, selectedMonth.value))
const selectedItems = computed(() => store.recurringCashflowItems.filter((item) => selectedItemIds.value.includes(item.id)))
const selectedPlan = computed(() => calculateRecurringCashflow(selectedItems.value))

const money = (value) => new Intl.NumberFormat('zh-TW', {
  style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2
}).format(Number(value || 0))
const signedMoney = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${money(Math.abs(Number(value || 0)))}`

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  selectedItemIds.value = []
  finishItemDrag()
}

function toggleSelectedItem(itemId) {
  selectedItemIds.value = selectedItemIds.value.includes(itemId)
    ? selectedItemIds.value.filter((id) => id !== itemId)
    : [...selectedItemIds.value, itemId]
}

function isItemSelected(itemId) {
  return selectedItemIds.value.includes(itemId)
}

function clearForm({ preserveType = false } = {}) {
  const selectedType = form.type
  Object.assign(form, defaultForm(), preserveType ? { type: selectedType } : {})
  formResetKey.value += 1
  editingId.value = ''
}

function startEdit(item) {
  collapsedGroups[item.type] = false
  Object.assign(form, { name: item.name, type: item.type, amount: item.amount, frequency: item.frequency, occurrenceMonth: item.occurrenceMonth || 1 })
  editingId.value = item.id
  if (window.matchMedia('(max-width: 880px)').matches) nextTick(() => formPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

async function submit() {
  const name = form.name.trim()
  const amount = Number(form.amount)
  if (!name) {
    showToast({ tone: 'error', title: '無法儲存週期收支', message: '請填寫項目名稱，例如「薪資」或「房租」。' })
    return
  }
  if (!(amount > 0)) {
    showToast({ tone: 'error', title: '無法儲存週期收支', message: '金額必須大於 0，不能填寫 0 或負數。' })
    return
  }
  try {
    const body = { name, type: form.type, amount, frequency: form.frequency, occurrenceMonth: Number(form.occurrenceMonth) }
    if (editingId.value) {
      await store.updateRecurringCashflowItem(editingId.value, body)
      showToast({ tone: 'success', title: '週期收支已更新', message: `已更新「${name}」，資料已自動保存。` })
    } else {
      await store.addRecurringCashflowItem(body)
      showToast({ tone: 'success', title: '週期收支已新增', message: `已新增「${name}」，資料已自動保存。` })
    }
    clearForm({ preserveType: true })
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '週期收支保存失敗', message: error?.message || '無法寫入資料。' })
  }
}

async function submitFromAmountInput(event) {
  event?.currentTarget?.blur()
  await nextTick()
  await submit()
}

async function confirmDelete() {
  const item = pendingDeleteItem.value
  if (!item) return
  try {
    await store.deleteRecurringCashflowItem(item.id)
    if (editingId.value === item.id) clearForm()
    pendingDeleteId.value = ''
    showToast({ tone: 'success', title: '週期收支已刪除', message: `已刪除「${item.name}」。` })
  } catch (error) {
    pendingDeleteId.value = ''
    store.error = ''
    showToast({ tone: 'error', title: '刪除失敗', message: error?.message || '無法刪除這筆資料。' })
  }
}

function startItemDrag(item, event) {
  if (sortKey.value !== 'custom' || selectionMode.value || store.saving) {
    event.preventDefault()
    return
  }
  draggingItemId.value = item.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', item.id)
}

function finishItemDrag() {
  draggingItemId.value = ''
  dragOverItemId.value = ''
  dragOverPlacement.value = 'after'
}

function dragItemOver(target, event) {
  const item = store.recurringCashflowItems.find((entry) => entry.id === draggingItemId.value)
  if (!item || item.id === target.id || item.type !== target.type || sortKey.value !== 'custom') return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const bounds = event.currentTarget.getBoundingClientRect()
  dragOverItemId.value = target.id
  dragOverPlacement.value = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}

async function dropItem(target, event) {
  event.preventDefault()
  const itemId = draggingItemId.value || event.dataTransfer.getData('text/plain')
  const placement = dragOverPlacement.value
  finishItemDrag()
  if (!itemId || itemId === target.id) return
  try {
    await store.moveRecurringCashflowItem(itemId, target.id, placement)
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '排序保存失敗', message: error?.message || '無法寫入資料。' })
  }
}

async function moveItemWithKeyboard(item, direction, items, index) {
  const target = items[index + direction]
  if (!target || store.saving) return
  try {
    await store.moveRecurringCashflowItem(item.id, target.id, direction < 0 ? 'before' : 'after')
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '排序保存失敗', message: error?.message || '無法寫入資料。' })
  }
}

watch(sortKey, (value) => {
  finishItemDrag()
  sortDirection.value = ['custom', 'occurrenceMonth'].includes(value) ? 'asc' : 'desc'
})

watch(() => store.recurringCashflowItems.map((item) => item.id), (itemIds) => {
  selectedItemIds.value = selectedItemIds.value.filter((id) => itemIds.includes(id))
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Cashflow planning" title="收支規劃" description="建立週期收支項目，查看指定月份實際會發生的收入與支出。">
      <template #actions>
        <div class="cashflow-page-actions">
          <label for="cashflow-view-month">查看月份</label>
          <UiSelect id="cashflow-view-month" v-model="selectedMonth" :options="monthOptions" aria-label="選擇要查看的收支月份" />
          <span class="pill pill-neutral"><CalendarRange :size="16" aria-hidden="true" />{{ store.recurringCashflowItems.length }} 筆週期項目</span>
        </div>
      </template>
    </PageHeader>

    <div class="metric-grid cashflow-metrics">
      <MetricCard :label="`${selectedMonth} 月固定收入`" :value="money(monthlyPlan.income)" :note="`${monthIncomeCount} 筆會發生 · 月均 ${money(store.cashflowPlan.monthlyIncome)}`">
        <template #icon><ArrowUpRight :size="18" aria-hidden="true" /></template>
      </MetricCard>
      <MetricCard :label="`${selectedMonth} 月固定支出`" :value="money(monthlyPlan.expense)" :note="`${monthExpenseCount} 筆會發生 · 月均 ${money(store.cashflowPlan.monthlyExpense)}`">
        <template #icon><ArrowDownRight :size="18" aria-hidden="true" /></template>
      </MetricCard>
      <MetricCard :label="`${selectedMonth} 月預估淨現金流`" :value="money(monthlyPlan.netCashflow)" :note="monthlyPlan.netCashflow >= 0 ? '當月收入高於支出' : '當月支出高於收入'" :tone="monthlyPlan.netCashflow < 0 ? 'negative' : ''">
        <template #icon><WalletCards :size="18" aria-hidden="true" /></template>
      </MetricCard>
      <MetricCard label="年度預估總收入" :value="money(store.cashflowPlan.annualIncome)" :note="`年度總支出 ${money(store.cashflowPlan.annualExpense)}`">
        <template #icon><CalendarRange :size="18" aria-hidden="true" /></template>
      </MetricCard>
    </div>

    <div class="page-grid page-grid--form-list cashflow-workspace">
      <div ref="formPanel" class="cashflow-form-column">
        <UiPanel :title="editingItem ? `編輯「${editingItem.name}」` : '新增週期收支項目'" description="輸入單次發生的金額，系統會依週期自動換算。">
          <form class="stack" @submit.prevent="submit">

            <fieldset class="type-choice">
              <legend>收支類型</legend>
              <button class="type-choice__button" type="button" :class="{ 'type-choice__button--active': form.type === 'income' }" @click="form.type = 'income'">
                <ArrowUpRight :size="17" aria-hidden="true" />固定收入
              </button>
              <button class="type-choice__button" type="button" :class="{ 'type-choice__button--active': form.type === 'expense' }" @click="form.type = 'expense'">
                <ArrowDownRight :size="17" aria-hidden="true" />固定支出
              </button>
            </fieldset>

            <div class="field">
              <label for="cashflow-name">項目名稱</label>
              <input id="cashflow-name" v-model="form.name" class="input" maxlength="60" autocomplete="off" placeholder="例如：薪資、房租、保險" />
            </div>

            <div class="field">
              <label for="cashflow-amount">單次金額</label>
              <FormattedNumberInput :key="formResetKey" id="cashflow-amount" v-model="form.amount" class="input input--amount" :allow-decimal="false" :allow-negative="false" :min="1" placeholder="0" @keydown.enter.prevent="submitFromAmountInput" />
              <span class="field-help">請填這個週期每次實際發生的金額。</span>
            </div>

            <div class="form-grid">
              <div class="field">
                <label for="cashflow-frequency">發生週期</label>
                <UiSelect id="cashflow-frequency" v-model="form.frequency" :options="frequencyOptions" />
                <span class="field-help">可選每月、每季、每半年或每年。</span>
              </div>
              <div class="field">
                <label for="cashflow-occurrence-month">發生月份</label>
                <div v-if="form.frequency === 'monthly'" class="occurrence-static">每月皆發生</div>
                <UiSelect v-else id="cashflow-occurrence-month" v-model="form.occurrenceMonth" :options="monthOptions" />
                <span class="field-help">{{ form.frequency === 'monthly' ? '每月項目不需要另外指定月份。' : '選一個月份，系統會依週期推算其他月份。' }}</span>
              </div>
            </div>

            <div v-if="Number(form.amount) > 0" class="conversion-preview" aria-live="polite">
              <span><small>換算月均</small><strong>{{ money(recurringCashflowMonthlyAmount(form)) }}</strong></span>
              <span><small>換算年總額</small><strong>{{ money(recurringCashflowAnnualAmount(form)) }}</strong></span>
              <span class="conversion-preview__schedule"><small>預計發生月份</small><strong>{{ occurrenceLabel(form) }}</strong></span>
            </div>

            <div class="form-actions">
              <button v-if="editingId" class="btn btn-ghost" type="button" @click="clearForm">取消編輯</button>
              <button class="btn btn-primary" type="submit" :disabled="store.saving"><Plus v-if="!editingId" :size="18" aria-hidden="true" />{{ editingId ? '保存修改' : '新增項目' }}</button>
            </div>
          </form>
        </UiPanel>
      </div>

      <UiPanel class="cashflow-list-panel" title="週期收支項目" :description="selectionMode ? '勾選想比較的項目，下方會即時計算這些項目對收支的影響。' : sortKey === 'custom' ? `收入 ${incomeItems.length} 筆 · 支出 ${expenseItems.length} 筆；拖曳左側把手即可調整同類項目的順序。` : `收入 ${incomeItems.length} 筆 · 支出 ${expenseItems.length} 筆；目前依指定欄位排序。`" flush>
        <template #action>
          <div class="cashflow-list-actions">
            <button class="btn cashflow-selection-toggle" :class="selectionMode ? 'btn-primary' : 'btn-secondary'" type="button" :aria-pressed="selectionMode" @click="toggleSelectionMode">
              <ListChecks :size="16" aria-hidden="true" />{{ selectionMode ? '結束試算' : '選取試算' }}
            </button>
            <div class="cashflow-sort">
              <UiSelect id="cashflow-sort" v-model="sortKey" :options="sortOptions" aria-label="週期收支排序欄位" />
              <button v-if="sortKey !== 'custom'" class="btn btn-secondary cashflow-sort__direction" type="button" :title="`目前${sortDirectionLabel}，點擊切換順序`" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
                <ArrowUpDown :size="16" aria-hidden="true" />{{ sortDirectionLabel }}
              </button>
            </div>
          </div>
        </template>
        <template v-if="store.recurringCashflowItems.length">
          <section v-if="selectionMode" class="scenario-panel" aria-live="polite">
            <div class="scenario-panel__header">
              <div><strong>選取項目試算</strong><span>以下以月均金額計算，不會刪除或修改項目。</span></div>
              <button v-if="selectedItemIds.length" class="btn btn-ghost" type="button" @click="selectedItemIds = []">清除選取</button>
            </div>
            <p v-if="!selectedItemIds.length" class="scenario-panel__empty">從下方收入或支出勾選幾筆，即可看到這些項目的月均影響。</p>
            <template v-else>
              <div class="scenario-summary">
                <div><small>已選項目</small><strong>{{ selectedItemIds.length }} 筆</strong></div>
                <div><small>月均選取收入</small><strong>{{ money(selectedPlan.monthlyIncome) }}</strong></div>
                <div><small>月均選取支出</small><strong>{{ money(selectedPlan.monthlyExpense) }}</strong></div>
                <div><small>月均淨影響</small><strong>{{ signedMoney(selectedPlan.monthlyNetCashflow) }}</strong></div>
              </div>
            </template>
          </section>

          <section class="cashflow-group" aria-labelledby="income-items-title">
            <header class="cashflow-group__header">
              <button type="button" :aria-expanded="!collapsedGroups.income" aria-controls="income-items-content" @click="collapsedGroups.income = !collapsedGroups.income">
                <div><span class="cashflow-group__icon cashflow-group__icon--income"><ArrowUpRight :size="17" aria-hidden="true" /></span><span><strong id="income-items-title">固定收入</strong><small>{{ incomeItems.length }} 筆</small></span></div>
                <span class="cashflow-group__summary">{{ selectedMonth }} 月 {{ money(monthlyPlan.income) }}<ChevronDown :size="18" :class="{ 'cashflow-group__chevron--open': !collapsedGroups.income }" aria-hidden="true" /></span>
              </button>
            </header>
            <div v-if="incomeItems.length && !collapsedGroups.income" id="income-items-content" class="cashflow-list">
              <article
                v-for="(item, index) in incomeItems"
                :key="item.id"
                class="cashflow-row"
                :class="{
                  'cashflow-row--sortable': sortKey === 'custom' && !selectionMode,
                  'cashflow-row--selecting': selectionMode,
                  'cashflow-row--selected': isItemSelected(item.id),
                  'cashflow-row--dragging': draggingItemId === item.id,
                  'cashflow-row--drop-before': dragOverItemId === item.id && dragOverPlacement === 'before',
                  'cashflow-row--drop-after': dragOverItemId === item.id && dragOverPlacement === 'after'
                }"
                @dragover="dragItemOver(item, $event)"
                @drop="dropItem(item, $event)"
              >
                <input v-if="selectionMode" class="cashflow-row__checkbox" type="checkbox" :checked="isItemSelected(item.id)" :aria-label="`選取 ${item.name} 進行試算`" @change="toggleSelectedItem(item.id)" />
                <button v-else-if="sortKey === 'custom'" class="cashflow-row__drag-handle" type="button" draggable="true" :aria-label="`拖曳調整 ${item.name} 的順序；也可用上下方向鍵移動`" title="拖曳調整順序" @dragstart="startItemDrag(item, $event)" @dragend="finishItemDrag" @keydown.up.prevent="moveItemWithKeyboard(item, -1, incomeItems, index)" @keydown.down.prevent="moveItemWithKeyboard(item, 1, incomeItems, index)"><GripVertical :size="18" aria-hidden="true" /></button>
                <div class="cashflow-row__main"><strong>{{ item.name }}</strong><span>{{ frequencyLabels[item.frequency] }} {{ money(item.amount) }} · {{ occurrenceLabel(item) }}</span></div>
                <div class="cashflow-row__amount"><small>月均</small><strong>{{ money(recurringCashflowMonthlyAmount(item)) }}</strong></div>
                <div class="cashflow-row__amount"><small>年總額</small><strong>{{ money(recurringCashflowAnnualAmount(item)) }}</strong></div>
                <div class="cashflow-row__actions">
                  <button class="btn btn-ghost btn-icon" type="button" :aria-label="`編輯 ${item.name}`" @click="startEdit(item)"><Pencil :size="17" aria-hidden="true" /></button>
                  <button class="btn btn-ghost btn-icon" type="button" :aria-label="`刪除 ${item.name}`" @click="pendingDeleteId = item.id"><Trash2 :size="17" aria-hidden="true" /></button>
                </div>
              </article>
            </div>
            <p v-else-if="!collapsedGroups.income" id="income-items-content" class="cashflow-group__empty">尚未建立固定收入。</p>
          </section>

          <section class="cashflow-group" aria-labelledby="expense-items-title">
            <header class="cashflow-group__header">
              <button type="button" :aria-expanded="!collapsedGroups.expense" aria-controls="expense-items-content" @click="collapsedGroups.expense = !collapsedGroups.expense">
                <div><span class="cashflow-group__icon cashflow-group__icon--expense"><ArrowDownRight :size="17" aria-hidden="true" /></span><span><strong id="expense-items-title">固定支出</strong><small>{{ expenseItems.length }} 筆</small></span></div>
                <span class="cashflow-group__summary">{{ selectedMonth }} 月 {{ money(monthlyPlan.expense) }}<ChevronDown :size="18" :class="{ 'cashflow-group__chevron--open': !collapsedGroups.expense }" aria-hidden="true" /></span>
              </button>
            </header>
            <div v-if="expenseItems.length && !collapsedGroups.expense" id="expense-items-content" class="cashflow-list">
              <article
                v-for="(item, index) in expenseItems"
                :key="item.id"
                class="cashflow-row"
                :class="{
                  'cashflow-row--sortable': sortKey === 'custom' && !selectionMode,
                  'cashflow-row--selecting': selectionMode,
                  'cashflow-row--selected': isItemSelected(item.id),
                  'cashflow-row--dragging': draggingItemId === item.id,
                  'cashflow-row--drop-before': dragOverItemId === item.id && dragOverPlacement === 'before',
                  'cashflow-row--drop-after': dragOverItemId === item.id && dragOverPlacement === 'after'
                }"
                @dragover="dragItemOver(item, $event)"
                @drop="dropItem(item, $event)"
              >
                <input v-if="selectionMode" class="cashflow-row__checkbox" type="checkbox" :checked="isItemSelected(item.id)" :aria-label="`選取 ${item.name} 進行試算`" @change="toggleSelectedItem(item.id)" />
                <button v-else-if="sortKey === 'custom'" class="cashflow-row__drag-handle" type="button" draggable="true" :aria-label="`拖曳調整 ${item.name} 的順序；也可用上下方向鍵移動`" title="拖曳調整順序" @dragstart="startItemDrag(item, $event)" @dragend="finishItemDrag" @keydown.up.prevent="moveItemWithKeyboard(item, -1, expenseItems, index)" @keydown.down.prevent="moveItemWithKeyboard(item, 1, expenseItems, index)"><GripVertical :size="18" aria-hidden="true" /></button>
                <div class="cashflow-row__main"><strong>{{ item.name }}</strong><span>{{ frequencyLabels[item.frequency] }} {{ money(item.amount) }} · {{ occurrenceLabel(item) }}</span></div>
                <div class="cashflow-row__amount"><small>月均</small><strong>{{ money(recurringCashflowMonthlyAmount(item)) }}</strong></div>
                <div class="cashflow-row__amount"><small>年總額</small><strong>{{ money(recurringCashflowAnnualAmount(item)) }}</strong></div>
                <div class="cashflow-row__actions">
                  <button class="btn btn-ghost btn-icon" type="button" :aria-label="`編輯 ${item.name}`" @click="startEdit(item)"><Pencil :size="17" aria-hidden="true" /></button>
                  <button class="btn btn-ghost btn-icon" type="button" :aria-label="`刪除 ${item.name}`" @click="pendingDeleteId = item.id"><Trash2 :size="17" aria-hidden="true" /></button>
                </div>
              </article>
            </div>
            <p v-else-if="!collapsedGroups.expense" id="expense-items-content" class="cashflow-group__empty">尚未建立固定支出。</p>
          </section>
        </template>
        <EmptyState v-else title="尚未建立週期收支項目" description="先新增薪資、房租、保險或訂閱等固定項目，系統就會自動計算月均與年度總額。" />
      </UiPanel>
    </div>

    <ConfirmDialog :open="Boolean(pendingDeleteItem)" title="刪除週期收支項目？" confirm-label="確認刪除" :busy="store.saving" @close="pendingDeleteId = ''" @confirm="confirmDelete">
      <p v-if="pendingDeleteItem">將刪除「<strong>{{ pendingDeleteItem.name }}</strong>」；月均與年度預估會立即重新計算。</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.cashflow-metrics { margin-bottom: 18px; }
.cashflow-metrics :deep(.metric-card), .cashflow-metrics :deep(.metric-card:first-child) { grid-column: span 3; }
.cashflow-metrics :deep(.metric-card:first-child) { background: var(--surface); color: var(--text); border-color: var(--border); }
.cashflow-metrics :deep(.metric-card:first-child .metric-label), .cashflow-metrics :deep(.metric-card:first-child .metric-note) { color: var(--muted); }
.cashflow-page-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.cashflow-page-actions > label { color: var(--muted); font-size: .78rem; font-weight: 700; white-space: nowrap; }
.cashflow-page-actions :deep(.ui-select) { width: 96px; }
.cashflow-page-actions :deep(.ui-select__trigger) { min-height: 38px; padding-block: 7px; font-size: .8rem; }
.cashflow-workspace { align-items: start; }
.cashflow-form-column { position: sticky; top: 18px; }
.cashflow-list-panel :deep(.panel__header) { padding-bottom: 14px; }
.cashflow-list-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.cashflow-selection-toggle { min-height: 38px; padding: 7px 10px; font-size: .78rem; white-space: nowrap; }
.cashflow-sort { display: flex; align-items: center; gap: 7px; }
.cashflow-sort :deep(.ui-select) { width: 130px; }
.cashflow-sort :deep(.ui-select__trigger) { min-height: 38px; padding-block: 7px; font-size: .76rem; }
.cashflow-sort__direction { min-height: 38px; padding: 7px 10px; font-size: .78rem; white-space: nowrap; }
.type-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
.type-choice legend { grid-column: 1 / -1; margin-bottom: 3px; color: var(--text-soft); font-size: .8rem; font-weight: 720; }
.type-choice__button { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--border-strong); border-radius: 11px; background: var(--surface); color: var(--muted); cursor: pointer; font-weight: 720; }
.type-choice__button:hover { border-color: var(--control-hover-border); color: var(--text); }
.type-choice__button--active { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); box-shadow: 0 0 0 2px var(--control-ring); }
.occurrence-static { min-height: 46px; display: flex; align-items: center; padding: 10px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-muted); color: var(--muted); font-size: .84rem; }
.conversion-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; border-radius: 12px; background: var(--surface-muted); }
.conversion-preview span { display: grid; gap: 3px; }
.conversion-preview small { color: var(--muted); font-size: .76rem; }
.conversion-preview strong { font-variant-numeric: tabular-nums; font-size: .9rem; }
.conversion-preview__schedule { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid var(--border); }
.scenario-panel { display: grid; gap: 14px; padding: 18px 24px; border-bottom: 1px solid var(--border); background: var(--primary-soft); }
.scenario-panel__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.scenario-panel__header > div { display: grid; gap: 3px; }
.scenario-panel__header strong { font-size: .88rem; }
.scenario-panel__header span, .scenario-panel__empty { color: var(--muted); font-size: .76rem; }
.scenario-panel__header .btn { min-height: 34px; padding: 6px 9px; font-size: .76rem; }
.scenario-panel__empty { margin: 0; padding: 12px; border: 1px dashed var(--border-strong); border-radius: 10px; background: var(--surface); text-align: center; }
.scenario-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.scenario-summary > div { min-width: 0; display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.scenario-summary small { color: var(--muted); font-size: .72rem; }
.scenario-summary strong { overflow: hidden; color: var(--text); font-size: .82rem; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.cashflow-group + .cashflow-group { border-top: 1px solid var(--border); }
.cashflow-group__header { background: var(--surface-muted); }
.cashflow-group__header > button { width: 100%; min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 24px; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.cashflow-group__header > button:hover { background: var(--surface-hover); }
.cashflow-group__header div { display: flex; align-items: center; gap: 9px; }
.cashflow-group__header div > span:last-child { display: grid; gap: 2px; }
.cashflow-group__header strong { font-size: .86rem; }
.cashflow-group__header small { color: var(--muted); font-size: .75rem; font-weight: 650; }
.cashflow-group__summary { display: flex; align-items: center; gap: 8px; color: var(--text-soft); font-size: .8rem; font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cashflow-group__summary svg { color: var(--muted); transition: transform .18s; }
.cashflow-group__summary .cashflow-group__chevron--open { transform: rotate(180deg); }
.cashflow-group__icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; }
.cashflow-group__icon--income, .cashflow-group__icon--expense { border: 1px solid var(--border); background: var(--surface); color: var(--text-soft); }
.cashflow-list { display: grid; }
.cashflow-row { position: relative; display: grid; grid-template-columns: minmax(130px, 1.35fr) minmax(96px, .72fr) minmax(105px, .78fr) auto; align-items: center; gap: 12px; min-height: 72px; padding: 12px 20px 12px 24px; border-top: 1px solid var(--border); transition: background-color .16s ease, opacity .16s ease; }
.cashflow-row--sortable, .cashflow-row--selecting { grid-template-columns: 28px minmax(130px, 1.35fr) minmax(96px, .72fr) minmax(105px, .78fr) auto; padding-left: 16px; }
.cashflow-row--selected { background: var(--primary-soft); }
.cashflow-row--dragging { opacity: .45; background: var(--surface-muted); }
.cashflow-row--drop-before::before, .cashflow-row--drop-after::after { content: ""; position: absolute; z-index: 2; right: 12px; left: 12px; height: 3px; border-radius: 999px; background: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.cashflow-row--drop-before::before { top: -2px; }
.cashflow-row--drop-after::after { bottom: -2px; }
.cashflow-row__drag-handle { width: 28px; height: 36px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: grab; touch-action: none; }
.cashflow-row__drag-handle:hover, .cashflow-row__drag-handle:focus-visible { background: var(--primary-soft); color: var(--primary); }
.cashflow-row__drag-handle:active { cursor: grabbing; }
.cashflow-row__checkbox { width: 18px; height: 18px; margin: auto; accent-color: var(--primary); cursor: pointer; }
.cashflow-row__checkbox:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.cashflow-row__main { min-width: 0; }
.cashflow-row__main strong, .cashflow-row__main span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cashflow-row__main strong { font-size: .86rem; }
.cashflow-row__main span { margin-top: 4px; color: var(--muted); font-size: .77rem; }
.cashflow-row__amount { display: grid; gap: 3px; text-align: right; }
.cashflow-row__amount small { color: var(--muted); font-size: .75rem; }
.cashflow-row__amount strong { font-size: .8rem; font-variant-numeric: tabular-nums; }
.cashflow-row__actions { display: flex; gap: 2px; }
.cashflow-row__actions .btn { width: 34px; min-height: 34px; }
.cashflow-row__actions .btn:last-child:hover { background: var(--danger-soft); color: var(--danger); }
.cashflow-group__empty { margin: 0; padding: 24px; border-top: 1px solid var(--border); color: var(--muted); font-size: .78rem; text-align: center; }
@media (max-width: 1120px) {
  .cashflow-metrics :deep(.metric-card), .cashflow-metrics :deep(.metric-card:first-child) { grid-column: span 6; }
}
@media (max-width: 880px) {
  .cashflow-form-column { position: static; }
}
@media (max-width: 620px) {
  .cashflow-metrics :deep(.metric-card), .cashflow-metrics :deep(.metric-card:first-child) { grid-column: span 12; }
  .cashflow-page-actions { flex-wrap: wrap; justify-content: flex-start; }
  .cashflow-page-actions .pill { flex: 1 1 100%; justify-content: center; }
  .scenario-panel { padding-inline: 18px; }
  .scenario-panel__header { align-items: flex-start; }
  .scenario-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cashflow-row { grid-template-columns: minmax(0, 1fr) auto; padding-inline: 18px; }
  .cashflow-row--sortable, .cashflow-row--selecting { grid-template-columns: 28px minmax(0, 1fr) auto; padding-left: 12px; }
  .cashflow-row__amount { display: none; }
  .cashflow-row__main span { white-space: normal; }
  .cashflow-group__header > button { padding-inline: 18px; }
  .cashflow-workspace :deep(.panel__header) { flex-direction: column; }
  .cashflow-list-panel :deep(.panel__header) { padding-bottom: 12px; }
  .cashflow-workspace :deep(.panel__action), .cashflow-list-actions, .cashflow-sort { width: 100%; justify-content: stretch; }
  .cashflow-list-actions { flex-wrap: wrap; }
  .cashflow-selection-toggle { flex: 1 1 100%; }
  .cashflow-sort :deep(.ui-select) { flex: 1; width: auto; }
  .cashflow-sort__direction { flex: 1; }
}
</style>
