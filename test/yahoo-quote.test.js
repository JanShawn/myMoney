import { describe, expect, it } from 'vitest'
import { parseYahooChartQuote, parseYahooQuotePageName } from '../server/utils/yahoo-quote.js'

describe('Yahoo Finance 盤中行情', () => {
  it('優先使用 regularMarketPrice，並取當日第一筆開盤價', () => {
    const quote = parseYahooChartQuote({
      chart: {
        result: [{
          meta: {
            symbol: '2330.TW',
            longName: 'Taiwan Semiconductor Manufacturing Company Limited',
            regularMarketPrice: 2450,
            regularMarketTime: 1789018200,
            chartPreviousClose: 2465
          },
          timestamp: [1788992400, 1789018200],
          indicators: {
            quote: [{ open: [2445, 2448], close: [2448, 2450] }]
          }
        }]
      }
    }, '2330.TW')

    expect(quote).toMatchObject({
      symbol: '2330.TW',
      ticker: '2330',
      name: 'Taiwan Semiconductor Manufacturing Company Limited',
      market: 'TWSE',
      currentPrice: 2450,
      openPrice: 2445,
      previousClose: 2465,
      marketDate: '2026-09-10',
      source: 'Yahoo Finance 盤中行情'
    })
  })

  it('regularMarketPrice 缺少時使用最後一筆分鐘成交價', () => {
    const quote = parseYahooChartQuote({
      chart: {
        result: [{
          meta: { symbol: '00795B.TWO', shortName: '中信美國公債20年' },
          timestamp: [1788992400, 1788992460],
          indicators: {
            quote: [{ open: [31.2, null], close: [31.2, 31.25] }]
          }
        }]
      }
    }, '00795B.TWO')

    expect(quote).toMatchObject({ ticker: '00795B', name: '中信美國公債20年', market: 'TPEx', currentPrice: 31.25, openPrice: 31.2 })
  })

  it('從 Yahoo 股市台灣頁面解析繁中商品名稱', () => {
    expect(parseYahooQuotePageName('<script>{"symbolName":"台積電","symbol":"2330.TW"}</script>')).toBe('台積電')
    expect(parseYahooQuotePageName('<html></html>')).toBe('')
  })
})
