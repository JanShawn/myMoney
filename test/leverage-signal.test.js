import { describe, expect, it } from 'vitest'
import { calculateLeverageSignal, calculateSummary, normalizeConfig, normalizeExposureThresholds } from '../app/services/money-domain.js'

function portfolioWithExposure(ratio, settings = {}) {
  const value = ratio * 100000
  return {
    settings,
    items: [
      { id: 'cash', amount: 200000 - value, currency: 'TWD', behavior: 'manual', assetClass: 'cash', includeInAssets: true },
      { id: 'loan', amount: 100000, currency: 'TWD', behavior: 'liability', assetClass: 'liability' }
    ],
    holdings: [{ quantity: value, price: 1, leverage: 1, assetClass: 'equity' }]
  }
}

describe('股票槓桿訊號', () => {
  it.each([
    [0.65, 'normal'],
    [0.799, 'normal'],
    [0.799999, 'warning'],
    [0.8, 'warning'],
    [0.999, 'warning'],
    [0.999999, 'danger'],
    [1, 'danger'],
    [1.2, 'danger']
  ])('總曝險 %s 依首頁顯示精度判斷為 %s', (ratio, level) => {
    expect(calculateLeverageSignal(portfolioWithExposure(ratio)).level).toBe(level)
  })

  it('小額正二按曝險合計判斷，不因持有正二直接觸發警戒', () => {
    const config = portfolioWithExposure(0.6)
    config.holdings.push({ quantity: 2000, price: 1, leverage: 2, assetClass: 'equity' })
    config.items[0].amount -= 2000

    expect(calculateLeverageSignal(config)).toMatchObject({ level: 'normal', ratio: 0.64 })
  })

  it('多空互抵不會讓大量部位呈現為低曝險', () => {
    const config = {
      items: [],
      holdings: [
        { quantity: 100000, price: 1, leverage: 1, assetClass: 'equity' },
        { quantity: 100000, price: 1, leverage: -1, assetClass: 'equity' }
      ]
    }

    expect(calculateSummary(config).stockExposureRatio).toBe(0)
    expect(calculateLeverageSignal(config)).toMatchObject({ level: 'danger', ratio: 1, grossExposure: 200000 })
  })

  it('封存持倉與債券不計入股票總曝險', () => {
    const config = portfolioWithExposure(0.5)
    config.holdings.push(
      { quantity: 100000, price: 1, leverage: 10, assetClass: 'equity', archived: true },
      { quantity: 100000, price: 1, leverage: 2, assetClass: 'bond' }
    )
    expect(calculateLeverageSignal(config)).toMatchObject({ level: 'normal', grossExposure: 50000, ratio: 0.25 })
  })

  it('借款降低淨資產後，訊號會反映增加的曝險比例', () => {
    const config = portfolioWithExposure(0.8)
    expect(calculateLeverageSignal({ ...config, items: config.items.filter(item => item.assetClass !== 'liability') }).level).toBe('normal')
    expect(calculateLeverageSignal(config).level).toBe('warning')
  })

  it('自訂警戒線會保存於正規化設定並影響判斷', () => {
    const settings = { exposureWarningPercent: 60, exposureDangerPercent: 90 }
    const config = normalizeConfig(portfolioWithExposure(0.65, settings))

    expect(config.settings).toMatchObject(settings)
    expect(calculateLeverageSignal(config).level).toBe('warning')
    expect(calculateLeverageSignal(portfolioWithExposure(0.9, settings)).level).toBe('danger')
  })

  it.each([
    {},
    { exposureWarningPercent: 100, exposureDangerPercent: 80 },
    { exposureWarningPercent: 0, exposureDangerPercent: 100 },
    { exposureWarningPercent: 'invalid', exposureDangerPercent: 100 },
    { exposureWarningPercent: 80, exposureDangerPercent: Infinity },
    { exposureWarningPercent: 80, exposureDangerPercent: 1001 }
  ])('缺漏或無效門檻 %j 回到預設規則', (settings) => {
    expect(normalizeExposureThresholds(settings)).toEqual({ exposureWarningPercent: 80, exposureDangerPercent: 100 })
  })

  it('沒有資料或只有現金時不發出綠色訊號', () => {
    expect(calculateLeverageSignal({})).toMatchObject({ level: 'idle', ratio: null })
    expect(calculateLeverageSignal({ items: [{ amount: 10000, currency: 'TWD', assetClass: 'cash', includeInAssets: true }] })).toMatchObject({ level: 'idle', ratio: 0 })
  })

  it('淨資產為零或負數時發出高度警戒，不顯示誤導性比例', () => {
    for (const debt of [100000, 110000]) {
      const config = { items: [{ amount: debt, currency: 'TWD', assetClass: 'liability' }], holdings: [{ quantity: 100000, price: 1, leverage: 1, assetClass: 'equity' }] }
      expect(calculateLeverageSignal(config)).toMatchObject({ level: 'danger', ratio: null })
    }
  })
})
