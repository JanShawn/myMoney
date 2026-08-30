const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/TWD'
const SUPPORTED_CURRENCIES = ['USD', 'JPY']

export async function fetchTwdExchangeRates() {
  const response = await fetch(EXCHANGE_RATE_URL, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`匯率服務回傳 HTTP ${response.status}。`)
  const payload = await response.json()
  if (payload.result !== 'success' || !payload.rates) throw new Error('匯率服務沒有回傳可用的匯率資料。')

  const rates = { TWD: 1 }
  for (const currency of SUPPORTED_CURRENCIES) {
    const twdToCurrency = Number(payload.rates[currency])
    if (!(twdToCurrency > 0)) throw new Error(`匯率服務缺少 ${currency}／TWD 匯率。`)
    rates[currency] = Number((1 / twdToCurrency).toFixed(6))
  }

  return {
    rates,
    updatedAt: payload.time_last_update_unix ? new Date(payload.time_last_update_unix * 1000).toISOString() : new Date().toISOString(),
    nextUpdateAt: payload.time_next_update_unix ? new Date(payload.time_next_update_unix * 1000).toISOString() : null,
    source: 'ExchangeRate-API'
  }
}
