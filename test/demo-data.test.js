import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculateRecurringCashflow, calculateSummary, normalizeConfig } from '../app/services/money-domain'

const demoData = JSON.parse(readFileSync(new URL('../examples/myMoney-demo-data.json', import.meta.url), 'utf8'))

describe('GitHub 範例資料', () => {
  it('可以載入完整功能所需的資料', () => {
    const config = normalizeConfig(demoData)

    expect(config.version).toBe(6)
    expect(config.items).toHaveLength(8)
    expect(config.holdings).toHaveLength(3)
    expect(config.recurringCashflowItems).toHaveLength(6)
    expect(config.snapshots).toHaveLength(6)
    expect(config.cashDrafts['item-cash'].rows).toHaveLength(3)
  })

  it('目前資產計算與最後一筆範例盤點一致', () => {
    const config = normalizeConfig(demoData)
    const summary = calculateSummary(config)
    const latestSnapshot = config.snapshots.at(-1)

    expect(summary).toEqual({
      totalAssets: 1114400,
      totalLiabilities: 180000,
      netWorth: 934400,
      availableAssets: 338400,
      availableCash: 338400,
      restrictedCash: 520000,
      totalStocks: 204000,
      stockRatio: 0.183058,
      totalBonds: 52000,
      bondRatio: 0.046662,
      totalStockExposure: 204000,
      totalBondExposure: 52000,
      totalInvestmentExposure: 256000,
      totalCash: 756200,
      totalForeign: 102200,
      totalOther: 0
    })
    const { totalStockExposure, totalBondExposure, totalInvestmentExposure, ...historicalSummary } = summary
    expect(latestSnapshot).toMatchObject(historicalSummary)
  })

  it('可以產生收支規劃摘要', () => {
    const plan = calculateRecurringCashflow(normalizeConfig(demoData).recurringCashflowItems)

    expect(plan).toEqual({
      monthlyIncome: 73333.33,
      monthlyExpense: 39000,
      monthlyNetCashflow: 34333.33,
      annualIncome: 880000,
      annualExpense: 468000,
      annualNetCashflow: 412000
    })
  })
})
