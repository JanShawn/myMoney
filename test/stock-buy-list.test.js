import { describe, expect, it } from 'vitest'
import { calculateNearestTaiwanOrderPrice, calculatePriceDifferencePercent, calculatePurchasePriceAdvantagePercent, compareStockTickers, createDefaultConfig, normalizeConfig } from '../app/services/money-domain'
import { summarizeConfigChanges } from '../app/services/local-json-storage'
import { createStockBuyListFormat } from '../app/services/stock-buy-list-export'

describe('股票待買清單', () => {
  it('保留固定群組並把待買清單放入 key 3', () => {
    const format = createStockBuyListFormat([
      { ticker: '0050' },
      { ticker: '0052.TW' },
      { ticker: '00631L' },
      { ticker: '0050' }
    ])

    const groups = JSON.parse(format)

    expect(groups).toHaveLength(7)
    expect(groups[0]).toEqual({
      key: 1,
      stocks: [
        { id: '^TWII', region: 'TW' },
        { id: '0050.TW', region: 'TW' },
        { id: '2330.TW', region: 'TW' },
        { id: '2303.TW', region: 'TW' },
        { id: '4585.TW', region: 'TW' },
        { id: '2412.TW', region: 'TW' },
        { id: '00635U.TW', region: 'TW' },
        { id: '6505.TW', region: 'TW' }
      ]
    })
    expect(groups[1]).toEqual({
      key: 2,
      stocks: [
        { id: '0050.TW', region: 'TW' },
        { id: '00795B.TWO', region: 'TW' },
        { id: '00981A.TW', region: 'TW' },
        { id: '00988A.TW', region: 'TW' }
      ]
    })
    expect(groups[2]).toEqual({
      key: 3,
      stocks: [
        { id: '^TWII', region: 'TW' },
        { id: '0050.TW', region: 'TW' },
        { id: '0052.TW', region: 'TW' },
        { id: '00631L.TW', region: 'TW' }
      ]
    })
    expect(groups.slice(3)).toEqual([4, 5, 6, 7].map((key) => ({ key, stocks: [] })))
  })

  it('依完整台股代號由小到大排序，不把六碼 ETF 當成整數', () => {
    const tickers = ['2330', '00632R', '006208', '0050']

    expect(tickers.sort(compareStockTickers)).toEqual(['0050', '006208', '00632R', '2330'])
  })

  it('會計算輸入價格相對參考價格的差異', () => {
    expect(calculatePriceDifferencePercent(110, 100)).toBeCloseTo(10)
    expect(calculatePriceDifferencePercent(90, 100)).toBeCloseTo(-10)
    expect(calculatePriceDifferencePercent(100, 100)).toBe(0)
  })

  it('買貴顯示負值，買便宜顯示正值', () => {
    expect(calculatePurchasePriceAdvantagePercent(110, 100)).toBeCloseTo(-10)
    expect(calculatePurchasePriceAdvantagePercent(90, 100)).toBeCloseTo(10)
    expect(calculatePurchasePriceAdvantagePercent(100, 100)).toBe(0)
  })

  it('把即時淨價換算成最接近的台股升降單位價格', () => {
    expect(calculateNearestTaiwanOrderPrice(12.66, '2330')).toBe(12.65)
    expect(calculateNearestTaiwanOrderPrice(78.66, '2330')).toBe(78.7)
    expect(calculateNearestTaiwanOrderPrice(123.66, '2330')).toBe(123.5)
    expect(calculateNearestTaiwanOrderPrice(1253.66, '2330')).toBe(1255)
    expect(calculateNearestTaiwanOrderPrice(106.66, '0050')).toBe(106.65)
    expect(calculateNearestTaiwanOrderPrice(25.856, '00679B')).toBe(25.86)
    expect(calculateNearestTaiwanOrderPrice('', '2330')).toBeNull()
  })

  it('會正規化並保留每日買進資料與成交狀態', () => {
    const config = normalizeConfig({
      version: 8,
      stockBuyList: [{
        id: 'buy-1',
        ticker: ' 2330 ',
        name: ' 台積電 ',
        buyPrice: 1250.5,
        quantity: 10,
        addOnPrice: 1275,
        targetQuantity: 15,
        bought: true
      }]
    })

    expect(config.version).toBe(13)
    expect(config.stockBuyList).toEqual([{
      id: 'buy-1',
      ticker: '2330',
      name: '台積電',
      buyPrice: 1250.5,
      quantity: 10,
      bought: true,
      order: 0
    }])
  })

  it('每日 Reset 後保留股票，只清除價格、股數與 checkbox', () => {
    const before = createDefaultConfig()
    before.stockBuyList.push({
      id: 'buy-1',
      ticker: '2330',
      name: '台積電',
      buyPrice: 600,
      quantity: 10,
      bought: true,
      order: 0
    })
    const after = structuredClone(before)
    Object.assign(after.stockBuyList[0], {
      buyPrice: 0,
      quantity: 0,
      bought: false
    })

    expect(after.stockBuyList[0]).toMatchObject({ ticker: '2330', name: '台積電' })
    expect(summarizeConfigChanges(before, after)).toEqual([
      '待買股票「2330 台積電」：買進價格 600 → 0、股數 10 → 0、已成交 是 → 否'
    ])
  })

  it('舊版加碼欄位會在正規化時移除', () => {
    const config = normalizeConfig({
      version: 8,
      stockBuyList: [{ id: 'buy-1', ticker: '0050', buyPrice: 50, quantity: 20, addOnPrice: 52, targetQuantity: 30 }]
    })

    expect(config.stockBuyList[0]).not.toHaveProperty('addOnPrice')
    expect(config.stockBuyList[0]).not.toHaveProperty('targetQuantity')
    expect(config.stockBuyList[0]).not.toHaveProperty('netPrice')
  })
})
