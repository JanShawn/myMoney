import { describe, expect, it } from 'vitest'
import { calculateSummary, normalizeConfig } from '../app/services/money-domain.js'

describe('calculateSummary', () => {
  it('分開計算資產、負債、流動性與投資類別', () => {
    const summary = calculateSummary({
      items: [
        { amount: 10000, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'available', includeInAssets: true, archived: false },
        { amount: 100, exchangeRate: 32, currency: 'USD', assetClass: 'foreign', liquidity: 'convertible', includeInAssets: true, archived: false },
        { amount: 5000, exchangeRate: 1, currency: 'TWD', assetClass: 'liability', liquidity: 'locked', includeInAssets: false, archived: false },
        { amount: 999, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'available', includeInAssets: false, archived: false }
      ],
      holdings: [
        { quantity: 10, price: 100, multiplier: 1, assetClass: 'equity', includeInAssets: true, archived: false },
        { quantity: 2, price: 500, multiplier: 1, assetClass: 'bond', includeInAssets: true, archived: false }
      ]
    })

    expect(summary.totalAssets).toBe(15200)
    expect(summary.totalLiabilities).toBe(5000)
    expect(summary.netWorth).toBe(10200)
    expect(summary.availableAssets).toBe(10000)
    expect(summary.availableCash).toBe(13200)
    expect(summary.restrictedCash).toBe(0)
    expect(summary.totalStocks).toBe(1000)
    expect(summary.totalBonds).toBe(1000)
    expect(summary.totalCash).toBe(10000)
    expect(summary.totalForeign).toBe(3200)
    expect(summary.totalOther).toBe(0)
  })

  it('替舊版持倉補上可保存的顯示順序', () => {
    const config = normalizeConfig({
      groups: [],
      items: [],
      holdings: [{ id: 'a', ticker: '0050' }, { id: 'b', ticker: '2330', order: 8 }]
    })

    expect(config.holdings.map((holding) => holding.order)).toEqual([0, 8])
    expect(config.settings.allocationTargets).toEqual({ cash: 20, stocks: 60, bonds: 20 })
  })
})
