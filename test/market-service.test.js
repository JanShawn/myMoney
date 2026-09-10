import { afterAll, describe, expect, it, vi } from 'vitest'
import { fetchMarketPreview, fetchStockBuyListQuotes, lookupMarketInstrument, lookupMarketInstrumentName } from '../app/services/market-service.js'

describe('market instrument lookup', () => {
  it('用代號從 Yahoo Finance 帶回名稱與行情價', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('market-instruments.json')) {
        return { ok: true, json: async () => ({ instruments: [{ ticker: '0050', market: 'TWSE' }] }) }
      }
      if (value.startsWith('/api/stock-quotes')) {
        return { ok: true, json: async () => ({
          quotes: { '0050': { ticker: '0050', name: '元大台灣50', market: 'TWSE', currentPrice: 199, marketDate: '2026-09-10', source: 'Yahoo Finance 盤中行情' } },
          warnings: []
        }) }
      }
      return { ok: true, json: async () => [] }
    }))

    await expect(lookupMarketInstrument('0050')).resolves.toMatchObject({
      ticker: '0050',
      name: '元大台灣50',
      price: 199,
      market: 'TWSE',
      marketDate: '2026-09-10',
      source: 'Yahoo Finance 盤中行情',
      fallback: false
    })
    await expect(lookupMarketInstrumentName('0050')).resolves.toEqual({
      ticker: '0050',
      name: '元大台灣50',
      market: 'TWSE'
    })
  })

  it('優先使用證交所最新交易日大盤，240MA 沿用可用歷史資料', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.startsWith('/api/stock-quotes')) {
        return { ok: true, json: async () => ({
          quotes: { '0050': { currentPrice: 201, marketDate: '2026-09-02', source: 'Yahoo Finance 盤中行情' } },
          warnings: []
        }) }
      }
      if (value.includes('market-summary.json')) {
        return { ok: true, json: async () => ({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' }) }
      }
      if (value.includes('www.twse.com.tw/exchangeReport/FMTQIK')) {
        return { ok: true, json: async () => ({ data: [['115/09/01', '', '', '', '46,948.72'], ['115/09/02', '', '', '', '46,164.72']] }) }
      }
      if (value.includes('MI_INDEX')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => [] }
    }))

    await expect(fetchMarketPreview(['0050'])).resolves.toMatchObject({
      prices: { '0050': 201 },
      priceDates: { '0050': '2026-09-02' },
      priceSources: { '0050': 'Yahoo Finance 盤中行情' },
      taiex: 46164.72,
      ma240: 35042.84,
      asOfDate: '2026-09-02',
      warnings: []
    })
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('MI_INDEX'), expect.anything())
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('finmindtrade'), expect.anything())
  })

  it('待買清單行情包含開盤價、最新價與行情日期', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.startsWith('/api/stock-quotes')) {
        return {
          ok: true,
          json: async () => ({
            quotes: {
              '2330': {
                currentPrice: 2450,
                openPrice: 2445,
                marketDate: '2026-09-10',
                quoteTime: '2026-09-10T05:30:10.000Z',
                source: 'Yahoo Finance 盤中行情'
              }
            },
            warnings: [],
            fetchedAt: '2026-09-10T05:30:12.000Z'
          })
        }
      }
      return { ok: true, json: async () => [] }
    }))

    await expect(fetchStockBuyListQuotes(['2330'], { force: true })).resolves.toMatchObject({
      quotes: {
        '2330': {
          currentPrice: 2450,
          openPrice: 2445,
          marketDate: '2026-09-10',
          quoteTime: '2026-09-10T05:30:10.000Z',
          source: 'Yahoo Finance 盤中行情'
        }
      },
      warnings: []
    })
  })

  it('證交所最新資料受阻時才回退到本機快取並清楚提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url)
      if (value.includes('market-summary.json')) {
        return { ok: true, json: async () => ({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' }) }
      }
      if (value.includes('FMTQIK') || value.includes('MI_INDEX')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => [] }
    }))

    const result = await fetchMarketPreview([])
    expect(result).toMatchObject({ taiex: 46331.45, ma240: 35042.84, asOfDate: '2026-08-28' })
    expect(result.warnings).toContain('無法取得證交所最新大盤資料，暫時使用 2026-08-28 快取。')
  })
})

afterAll(() => vi.unstubAllGlobals())
