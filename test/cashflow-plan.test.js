import { describe, expect, it } from 'vitest'
import {
  calculateRecurringCashflow, normalizeConfig, recurringCashflowAnnualAmount, recurringCashflowMonthlyAmount,
  recurringCashflowOccurrenceMonths
} from '../app/services/money-domain.js'

describe('週期收支換算', () => {
  it('把不同週期換算成月均與年總額', () => {
    const items = [
      { id: 'salary', name: '薪資', type: 'income', amount: 60000, frequency: 'monthly' },
      { id: 'bonus', name: '季獎金', type: 'income', amount: 30000, frequency: 'quarterly' },
      { id: 'rent', name: '房租', type: 'expense', amount: 18000, frequency: 'monthly' },
      { id: 'insurance', name: '保險', type: 'expense', amount: 24000, frequency: 'annual' }
    ]

    expect(recurringCashflowMonthlyAmount(items[1])).toBe(10000)
    expect(recurringCashflowAnnualAmount(items[3])).toBe(24000)
    expect(calculateRecurringCashflow(items)).toEqual({
      monthlyIncome: 70000,
      monthlyExpense: 20000,
      monthlyNetCashflow: 50000,
      annualIncome: 840000,
      annualExpense: 240000,
      annualNetCashflow: 600000
    })
  })

  it('替舊版 JSON 補上週期收支陣列並整理欄位', () => {
    expect(normalizeConfig({}).recurringCashflowItems).toEqual([])
    expect(normalizeConfig({
      recurringCashflowItems: [{ id: 'x', name: '  年費  ', type: 'expense', amount: '1200', frequency: 'annual' }]
    }).recurringCashflowItems).toEqual([{ id: 'x', name: '年費', type: 'expense', amount: 1200, frequency: 'annual', occurrenceMonth: 1, order: 0 }])
  })

  it('依發生週期推算一年中的月份', () => {
    expect(recurringCashflowOccurrenceMonths({ frequency: 'monthly', occurrenceMonth: 8 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(recurringCashflowOccurrenceMonths({ frequency: 'quarterly', occurrenceMonth: 2 })).toEqual([2, 5, 8, 11])
    expect(recurringCashflowOccurrenceMonths({ frequency: 'semiannual', occurrenceMonth: 11 })).toEqual([5, 11])
    expect(recurringCashflowOccurrenceMonths({ frequency: 'annual', occurrenceMonth: 9 })).toEqual([9])
  })
})
