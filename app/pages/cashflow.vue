<script setup>
import { ArrowDownRight, ArrowUpDown, ArrowUpRight, CalendarRange, ChevronDown, ChevronUp, Pencil, Plus, Trash2, WalletCards } from '@lucide/vue'
import { recurringCashflowAnnualAmount, recurringCashflowMonthlyAmount, recurringCashflowOccurrenceMonths } from '~/services/money-domain'
import { useMoneyStore } from '~/stores/money'

const store = useMoneyStore()
const { showToast } = useToast()
const defaultForm = () => ({ name: '', type: 'income', amount: '', frequency: 'monthly', occurrenceMonth: new Date().getMonth() + 1 })
const form = reactive(defaultForm())
const formResetKey = ref(0)
const formPanel = ref(null)
const editingId = ref('')
const pendingDeleteId = ref('')
const sortKey = ref('occurrenceMonth')
const sortDirection = ref('asc')
const collapsedGroups = reactive({ income: false, expense: false })

const frequencyOptions = [
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'semiannual', label: '每半年' },
  { value: 'annual', label: '每年' }
]
const frequencyLabels = Object.fromEntries(frequencyOptions.map((option) => [option.value, option.label]))
const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1} 月` }))
const sortOptions = [
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

const money = (value) => new Intl.NumberFormat('zh-TW', {
  style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2
}).format(Number(value || 0))

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

function moveTarget(items, index, direction) {
  const target = items[index + direction]
  if (!target) return null
  if (occurrenceSortMonth(target) !== occurrenceSortMonth(items[index])) return null
  return target
}

async function moveItem(item, direction, items, index) {
  const target = moveTarget(items, index, direction)
  if (!target) return
  try {
    await store.swapRecurringCashflowItems(item.id, target.id)
  } catch (error) {
    store.error = ''
    showToast({ tone: 'error', title: '排序保存失敗', message: error?.message || '無法寫入資料。' })
  }
}

watch(sortKey, (value) => {
  sortDirection.value = value === 'occurrenceMonth' ? 'asc' : 'desc'
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Cashflow planning" title="收支規劃" description="建立週期收支項目，系統會自動換算月均與年總額，快速看出固定現金流。">
      <template #actions><span class="pill pill-neutral"><CalendarRange :size="16" aria-hidden="true" />{{ store.recurringCashflowItems.length }} 筆週期項目</span></template>
    </PageHeader>

    <div class="metric-grid cashflow-metrics">
      <MetricCard label="月均固定收入" :value="money(store.cashflowPlan.monthlyIncome)" :note="`${incomeItems.length} 筆固定收入`">
        <template #icon><ArrowUpRight :size="18" aria-hidden="true" /></template>
      </MetricCard>
      <MetricCard label="月均固定支出" :value="money(store.cashflowPlan.monthlyExpense)" :note="`${expenseItems.length} 筆固定支出`">
        <template #icon><ArrowDownRight :size="18" aria-hidden="true" /></template>
      </MetricCard>
      <MetricCard label="每月預估淨現金流" :value="money(store.cashflowPlan.monthlyNetCashflow)" :note="store.cashflowPlan.monthlyNetCashflow >= 0 ? '固定收入高於固定支出' : '固定支出高於固定收入'" :tone="store.cashflowPlan.monthlyNetCashflow < 0 ? 'negative' : ''">
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

      <UiPanel title="週期收支項目" :description="sortKey === 'occurrenceMonth' ? `收入 ${incomeItems.length} 筆 · 支出 ${expenseItems.length} 筆；同月份項目可用 ↑ ↓ 自訂先後。` : `收入 ${incomeItems.length} 筆 · 支出 ${expenseItems.length} 筆；金額皆已換算為台幣月均與年總額。`" flush>
        <template #action>
          <div class="cashflow-sort">
            <UiSelect id="cashflow-sort" v-model="sortKey" :options="sortOptions" aria-label="週期收支排序欄位" />
            <button class="btn btn-secondary cashflow-sort__direction" type="button" :title="`目前${sortDirectionLabel}，點擊切換順序`" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              <ArrowUpDown :size="16" aria-hidden="true" />{{ sortDirectionLabel }}
            </button>
          </div>
        </template>
        <template v-if="store.recurringCashflowItems.length">
          <section class="cashflow-group" aria-labelledby="income-items-title">
            <header class="cashflow-group__header">
              <button type="button" :aria-expanded="!collapsedGroups.income" aria-controls="income-items-content" @click="collapsedGroups.income = !collapsedGroups.income">
                <div><span class="cashflow-group__icon cashflow-group__icon--income"><ArrowUpRight :size="17" aria-hidden="true" /></span><span><strong id="income-items-title">固定收入</strong><small>{{ incomeItems.length }} 筆</small></span></div>
                <span class="cashflow-group__summary">{{ money(store.cashflowPlan.monthlyIncome) }}／月<ChevronDown :size="18" :class="{ 'cashflow-group__chevron--open': !collapsedGroups.income }" aria-hidden="true" /></span>
              </button>
            </header>
            <div v-if="incomeItems.length && !collapsedGroups.income" id="income-items-content" class="cashflow-list">
              <article v-for="(item, index) in incomeItems" :key="item.id" class="cashflow-row">
                <div class="cashflow-row__main"><strong>{{ item.name }}</strong><span>{{ frequencyLabels[item.frequency] }} {{ money(item.amount) }} · {{ occurrenceLabel(item) }}</span></div>
                <div class="cashflow-row__amount"><small>月均</small><strong>{{ money(recurringCashflowMonthlyAmount(item)) }}</strong></div>
                <div class="cashflow-row__amount"><small>年總額</small><strong>{{ money(recurringCashflowAnnualAmount(item)) }}</strong></div>
                <div class="cashflow-row__actions">
                  <button v-if="sortKey === 'occurrenceMonth'" class="btn btn-ghost btn-icon" type="button" :disabled="!moveTarget(incomeItems, index, -1) || store.saving" :aria-label="`將 ${item.name} 在同月份項目中上移`" @click="moveItem(item, -1, incomeItems, index)"><ChevronUp :size="17" aria-hidden="true" /></button>
                  <button v-if="sortKey === 'occurrenceMonth'" class="btn btn-ghost btn-icon" type="button" :disabled="!moveTarget(incomeItems, index, 1) || store.saving" :aria-label="`將 ${item.name} 在同月份項目中下移`" @click="moveItem(item, 1, incomeItems, index)"><ChevronDown :size="17" aria-hidden="true" /></button>
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
                <span class="cashflow-group__summary">{{ money(store.cashflowPlan.monthlyExpense) }}／月<ChevronDown :size="18" :class="{ 'cashflow-group__chevron--open': !collapsedGroups.expense }" aria-hidden="true" /></span>
              </button>
            </header>
            <div v-if="expenseItems.length && !collapsedGroups.expense" id="expense-items-content" class="cashflow-list">
              <article v-for="(item, index) in expenseItems" :key="item.id" class="cashflow-row">
                <div class="cashflow-row__main"><strong>{{ item.name }}</strong><span>{{ frequencyLabels[item.frequency] }} {{ money(item.amount) }} · {{ occurrenceLabel(item) }}</span></div>
                <div class="cashflow-row__amount"><small>月均</small><strong>{{ money(recurringCashflowMonthlyAmount(item)) }}</strong></div>
                <div class="cashflow-row__amount"><small>年總額</small><strong>{{ money(recurringCashflowAnnualAmount(item)) }}</strong></div>
                <div class="cashflow-row__actions">
                  <button v-if="sortKey === 'occurrenceMonth'" class="btn btn-ghost btn-icon" type="button" :disabled="!moveTarget(expenseItems, index, -1) || store.saving" :aria-label="`將 ${item.name} 在同月份項目中上移`" @click="moveItem(item, -1, expenseItems, index)"><ChevronUp :size="17" aria-hidden="true" /></button>
                  <button v-if="sortKey === 'occurrenceMonth'" class="btn btn-ghost btn-icon" type="button" :disabled="!moveTarget(expenseItems, index, 1) || store.saving" :aria-label="`將 ${item.name} 在同月份項目中下移`" @click="moveItem(item, 1, expenseItems, index)"><ChevronDown :size="17" aria-hidden="true" /></button>
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
.cashflow-workspace { align-items: start; }
.cashflow-form-column { position: sticky; top: 18px; }
.cashflow-sort { display: flex; align-items: center; gap: 7px; }
.cashflow-sort :deep(.ui-select) { width: 130px; }
.cashflow-sort :deep(.ui-select__trigger) { min-height: 38px; padding-block: 7px; font-size: .76rem; }
.cashflow-sort__direction { min-height: 38px; padding: 7px 10px; font-size: .78rem; white-space: nowrap; }
.type-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
.type-choice legend { grid-column: 1 / -1; margin-bottom: -1px; color: var(--text-soft); font-size: .8rem; font-weight: 720; }
.type-choice__button { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--border-strong); border-radius: 11px; background: var(--surface); color: var(--muted); cursor: pointer; font-weight: 720; }
.type-choice__button:hover { border-color: var(--control-hover-border); color: var(--text); }
.type-choice__button--active { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); box-shadow: 0 0 0 2px var(--control-ring); }
.occurrence-static { min-height: 46px; display: flex; align-items: center; padding: 10px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-muted); color: var(--muted); font-size: .84rem; }
.conversion-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; border-radius: 12px; background: var(--surface-muted); }
.conversion-preview span { display: grid; gap: 3px; }
.conversion-preview small { color: var(--muted); font-size: .76rem; }
.conversion-preview strong { font-variant-numeric: tabular-nums; font-size: .9rem; }
.conversion-preview__schedule { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid var(--border); }
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
.cashflow-row { display: grid; grid-template-columns: minmax(130px, 1.35fr) minmax(96px, .72fr) minmax(105px, .78fr) auto; align-items: center; gap: 12px; min-height: 72px; padding: 12px 20px 12px 24px; border-top: 1px solid var(--border); }
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
  .cashflow-row { grid-template-columns: minmax(0, 1fr) auto; padding-inline: 18px; }
  .cashflow-row__amount { display: none; }
  .cashflow-row__main span { white-space: normal; }
  .cashflow-group__header > button { padding-inline: 18px; }
  .cashflow-workspace :deep(.panel__header) { flex-direction: column; }
  .cashflow-workspace :deep(.panel__action), .cashflow-sort { width: 100%; justify-content: stretch; }
  .cashflow-sort :deep(.ui-select) { flex: 1; width: auto; }
  .cashflow-sort__direction { flex: 1; }
}
</style>
