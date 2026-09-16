import { describe, expect, it } from 'vitest'
import { parseTwseEtfNavs, parseTwseOddLotQuotes } from '../server/utils/twse-market-quote.js'

describe('證交所盤中零股行情', () => {
  it('會解析零股最新成交價、最佳買賣價與台北時間', () => {
    const quotes = parseTwseOddLotQuotes({
      msgArray: [{
        c: '0050',
        n: '元大台灣50',
        ex: 'tse',
        d: '20260916',
        t: '10:23:48',
        z: '106.5000',
        a: '106.5500_106.6000_',
        b: '106.5000_106.4500_',
        o: '106.5000',
        y: '106.2500',
        trade: { t: '10:23:48', v: 40, z: '106.5000' }
      }]
    })

    expect(quotes['0050']).toMatchObject({
      ticker: '0050',
      name: '元大台灣50',
      market: 'TWSE',
      oddLotPrice: 106.5,
      oddLotBidPrice: 106.5,
      oddLotAskPrice: 106.55,
      oddLotMarketDate: '2026-09-16',
      oddLotQuoteTime: '2026-09-16T02:23:48.000Z'
    })
  })

  it('沒有零股成交時仍保留最佳賣價供估算 fallback', () => {
    const quotes = parseTwseOddLotQuotes({
      msgArray: [{ c: '2330', ex: 'tse', d: '20260916', z: '-', a: '2385.0000_', b: '2380.0000_' }]
    })

    expect(quotes['2330']).toMatchObject({
      oddLotPrice: null,
      oddLotBidPrice: 2380,
      oddLotAskPrice: 2385
    })
  })
})

describe('證交所 ETF 即時估計淨值', () => {
  it('會攤平各投信資料並解析 iNAV 與折溢價', () => {
    const navs = parseTwseEtfNavs({
      a1: [{
        refURL: 'https://example.com/etf',
        msgArray: [{
          a: '0050',
          e: '106.50',
          f: '106.34',
          g: '0.15',
          h: '106.25',
          i: '20260916',
          j: '10:25:30'
        }]
      }]
    })

    expect(navs['0050']).toMatchObject({
      estimatedNetAssetValue: 106.34,
      navMarketPrice: 106.5,
      premiumDiscountPercent: 0.15,
      previousNetAssetValue: 106.25,
      navMarketDate: '2026-09-16',
      navQuoteTime: '2026-09-16T02:25:30.000Z',
      navReferenceUrl: 'https://example.com/etf'
    })
  })
})
