import { describe, expect, it } from 'vitest'
import { calculateSummary, defaultHoldingLeverage, normalizeConfig } from '../app/services/money-domain.js'

describe('calculateSummary', () => {
  it('依商品類型提供預設槓桿', () => {
    expect(defaultHoldingLeverage({ assetClass: 'bond', name: '中信美國公債20年' })).toBe(0)
    expect(defaultHoldingLeverage({ assetClass: 'equity', name: '元大台灣50正2' })).toBe(2)
    expect(defaultHoldingLeverage({ assetClass: 'bond', name: '元大美債20正2' })).toBe(2)
    expect(defaultHoldingLeverage({ assetClass: 'equity', name: '元大台灣50' })).toBe(1)
  })

  it('舊資料沒有明確槓桿時套用商品預設值', () => {
    const config = normalizeConfig({
      version: 3,
      groups: [],
      items: [],
      holdings: [
        { id: 'bond', name: '中信美國公債20年', assetClass: 'bond', multiplier: 1 },
        { id: 'leveraged', name: '元大台灣50正2', assetClass: 'equity', multiplier: 1 }
      ]
    })

    expect(config.holdings.map((holding) => holding.leverage)).toEqual([0, 2])
  })

  it('分開計算資產、負債、流動性與投資類別', () => {
    const summary = calculateSummary({
      items: [
        { amount: 10000, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'available', includeInAssets: true, archived: false },
        { amount: 100, exchangeRate: 32, currency: 'USD', assetClass: 'foreign', liquidity: 'convertible', includeInAssets: true, archived: false },
        { amount: 5000, exchangeRate: 1, currency: 'TWD', assetClass: 'liability', liquidity: 'locked', includeInAssets: false, archived: false },
        { amount: 999, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'available', includeInAssets: false, archived: false }
      ],
      holdings: [
        { quantity: 10, price: 100, leverage: 2, assetClass: 'equity', includeInAssets: true, archived: false },
        { quantity: 2, price: 500, leverage: 1, assetClass: 'bond', includeInAssets: true, archived: false }
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
    expect(summary.totalStockExposure).toBe(2000)
    expect(summary.totalBondExposure).toBe(1000)
    expect(summary.stockExposureRatio).toBe(0.196078)
    expect(summary.totalInvestmentExposure).toBe(3000)
    expect(summary.totalCash).toBe(10000)
    expect(summary.totalForeign).toBe(3200)
    expect(summary.totalOther).toBe(0)
  })

  it('待扣款只降低可動用金額，不改變總資產與淨資產', () => {
    const summary = calculateSummary({
      settings: { cashReconciliationEnabled: true },
      cashDrafts: { 'item-cash': { reservedAmount: 3000 } },
      items: [
        { amount: 10000, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'available', includeInAssets: true, archived: false },
        { amount: 2000, exchangeRate: 1, currency: 'TWD', assetClass: 'cash', liquidity: 'locked', includeInAssets: true, archived: false }
      ],
      holdings: []
    })

    expect(summary.totalAssets).toBe(12000)
    expect(summary.netWorth).toBe(12000)
    expect(summary.reservedCash).toBe(3000)
    expect(summary.availableCash).toBe(7000)
    expect(summary.availableAssets).toBe(7000)
    expect(summary.restrictedCash).toBe(5000)
  })

  it('替舊版持倉補上可保存的顯示順序', () => {
    const config = normalizeConfig({
      groups: [],
      items: [],
      holdings: [{ id: 'a', ticker: '0050' }, { id: 'b', ticker: '2330', order: 8 }]
    })

    expect(config.holdings.map((holding) => holding.order)).toEqual([0, 8])
    expect(config.holdings.map((holding) => holding.leverage)).toEqual([1, 1])
    expect(config.settings).not.toHaveProperty('allocationTargets')
  })

  it('把舊方向與市值乘數遷移為正負槓桿，並強制納入資產', () => {
    const config = normalizeConfig({
      groups: [],
      items: [],
      holdings: [
        { id: 'leveraged', quantity: 10, price: 100, multiplier: 3, direction: 'inverse', assetClass: 'equity', includeInAssets: false },
        { id: 'zero', quantity: 2, price: 500, leverage: 0, assetClass: 'bond', includeInAssets: false }
      ]
    })
    const summary = calculateSummary(config)

    expect(config.holdings[0].leverage).toBe(-3)
    expect(config.holdings[1].leverage).toBe(0)
    expect(config.holdings.every((holding) => !Object.hasOwn(holding, 'includeInAssets'))).toBe(true)
    expect(config.holdings[0]).not.toHaveProperty('multiplier')
    expect(config.holdings[0]).not.toHaveProperty('direction')
    expect(summary.totalStocks).toBe(1000)
    expect(summary.totalBonds).toBe(1000)
    expect(summary.totalStockExposure).toBe(-3000)
    expect(summary.totalBondExposure).toBe(0)
    expect(summary.stockExposureRatio).toBe(-1.5)
  })

  it('淨資產不是正數時不產生誤導性的曝險比例', () => {
    const summary = calculateSummary({
      items: [
        { amount: 1000, exchangeRate: 1, currency: 'TWD', assetClass: 'liability', includeInAssets: false, archived: false }
      ],
      holdings: [
        { quantity: 10, price: 100, leverage: 1, assetClass: 'equity', archived: false }
      ]
    })

    expect(summary.netWorth).toBe(0)
    expect(summary.stockExposureRatio).toBeNull()
  })

  it('持倉資產類別只保留股票與債券', () => {
    const config = normalizeConfig({
      groups: [],
      items: [],
      holdings: [
        { id: 'legacy-other', assetClass: 'other', assetClassDetail: '黃金' },
        { id: 'bond', assetClass: 'bond' }
      ]
    })

    expect(config.holdings.map((holding) => holding.assetClass)).toEqual(['equity', 'bond'])
    expect(config.holdings.every((holding) => !Object.hasOwn(holding, 'assetClassDetail'))).toBe(true)
  })
})
