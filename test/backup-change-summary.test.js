import { describe, expect, it } from 'vitest'
import { summarizeConfigChanges } from '../app/services/local-json-storage'
import { createDefaultConfig } from '../app/services/money-domain'

describe('IndexedDB 備份異動摘要', () => {
  it('列出帳戶金額、持倉與盤點異動', () => {
    const before = createDefaultConfig()
    before.items.push({
      id: 'bank-1', groupId: 'group-bank', name: '生活帳戶', amount: 1000,
      currency: 'TWD', exchangeRate: 1, assetClass: 'cash', liquidity: 'available',
      includeInAssets: true, archived: false
    })
    before.holdings.push({ id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100, order: 0 })

    const after = structuredClone(before)
    after.items.find((item) => item.id === 'bank-1').amount = 2500
    after.holdings.find((holding) => holding.id === 'holding-1').quantity = 20
    after.snapshots.push({ date: '2026-08-30', netWorth: 3000 })

    expect(summarizeConfigChanges(before, after)).toEqual([
      '帳戶「生活帳戶」：金額 1,000 → 2,500 TWD',
      '持倉「2330 台積電」：股數 10 → 20',
      '新增 2026-08-30 資產盤點'
    ])
  })

  it('不把單純的自動保存時間列為資料異動', () => {
    const before = createDefaultConfig()
    const after = structuredClone(before)
    after.settings.lastSavedAt = '2026-08-30T12:00:00.000Z'

    expect(summarizeConfigChanges(before, after)).toEqual([])
  })

  it('不把市場資料、自動匯率與自動股價列為異動', () => {
    const before = createDefaultConfig()
    before.items.push({
      id: 'usd-1', groupId: 'group-bank', name: '美元帳戶', amount: 100,
      currency: 'USD', exchangeRate: 30, behavior: 'foreign', assetClass: 'foreign',
      liquidity: 'available', includeInAssets: true, archived: false
    })
    before.holdings.push({
      id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100,
      priceSource: 'auto', priceAsOfDate: '2026-08-29', order: 0
    })

    const after = structuredClone(before)
    after.market.taiex = 25000
    after.market.fxRates.USD = 31
    after.items.find((item) => item.id === 'usd-1').exchangeRate = 31
    Object.assign(after.holdings[0], { price: 120, priceSource: 'auto', priceAsOfDate: '2026-08-30' })

    expect(summarizeConfigChanges(before, after)).toEqual([])
  })

  it('仍列出使用者手動修改的持倉價格', () => {
    const before = createDefaultConfig()
    before.holdings.push({ id: 'holding-1', ticker: '2330', name: '台積電', quantity: 10, price: 100, priceSource: 'auto', order: 0 })
    const after = structuredClone(before)
    Object.assign(after.holdings[0], { price: 125, priceSource: 'manual' })

    expect(summarizeConfigChanges(before, after)).toEqual(['持倉「2330 台積電」：價格 100 → 125'])
  })

  it('列出週期收支項目的文字與數字異動', () => {
    const before = createDefaultConfig()
    before.recurringCashflowItems.push({ id: 'rent', name: '房租', type: 'expense', amount: 18000, frequency: 'monthly' })
    const after = structuredClone(before)
    Object.assign(after.recurringCashflowItems[0], { amount: 20000, frequency: 'quarterly' })

    expect(summarizeConfigChanges(before, after)).toEqual([
      '週期收支「房租」：金額 18,000 → 20,000 TWD、週期改為每季'
    ])
  })
})
