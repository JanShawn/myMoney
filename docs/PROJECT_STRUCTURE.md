# 專案結構

myMoney 是**單一 Nuxt 4 靜態 SPA**。沒有 Express、沒有常駐 API server、沒有本機資料庫行程。瀏覽器內的 IndexedDB 負責自動保存；JSON／Excel 只做匯出與搬移。

## 根目錄

| 路徑 | 用途 |
|---|---|
| `app/` | 應用程式原始碼（頁面、元件、store、服務） |
| `docs/` | 產品規格、結構說明、設計約定 |
| `examples/` | 可匯入的虛構完整備份（給預覽用） |
| `scripts/` | 建置輔助腳本（例如更新市場商品快取） |
| `test/` | Vitest 單元測試 |
| `nuxt.config.js` | Nuxt／Vite 設定（`ssr: false`、靜態輸出） |
| `package.json` | 依賴與腳本 |
| `.env.example` | 可選的 `NUXT_APP_BASE_URL` 說明 |
| `.openai/` | OpenAI／Cursor 靜態託管設定（非 runtime） |
| `.agents/` | Agent skill（開發輔助，非 runtime） |

## `app/` 職責

```
app/
├── assets/css/main.css     # 設計 token + 全域元件樣式
├── components/             # 共用 UI（自動匯入）
├── composables/            # useTheme、useToast
├── layouts/default.vue     # 導覽殼層、載入 store、錯誤 toast
├── pages/                  # 路由頁面
├── plugins/theme.client.js # 主題初始化
├── services/               # 領域邏輯與 I/O（與畫面分離）
└── stores/money.js         # Pinia：設定、摘要、CRUD、備份
```

### 頁面

| 路由 | 檔案 | 說明 |
|---|---|---|
| `/` | `pages/index.vue` | 資產總覽、曝險、趨勢圖、盤點與大盤紀錄 |
| `/accounts` | `pages/accounts.vue` | 帳戶群組與項目 |
| `/investments` | `pages/investments.vue` | 投資持倉 |
| `/cash` | `pages/cash.vue` | 現金驗算（可在設定關閉） |
| `/cashflow` | `pages/cashflow.vue` | 週期收支規劃與選取試算 |
| `/snapshot` | `pages/snapshot.vue` | 當日資產盤點 |
| `/settings` | `pages/settings.vue` | 備份、匯出、功能開關、重設 |

### 服務層

| 檔案 | 說明 |
|---|---|
| `money-domain.js` | 設定正規化、資產摘要、週期收支換算、快照 upsert |
| `local-json-storage.js` | IndexedDB 讀寫、內部版本、JSON 匯入匯出與變更摘要 |
| `market-service.js` | 商品查詢、加權指數／240MA、市場快取備援 |
| `exchange-rate-service.js` | USD／JPY 參考匯率 |
| `excel-transfer.js` | 盤點歷史 Excel 匯出 |

## 刻意不放什麼

- **沒有 `server/`、`server-express/` 或 Express**：瀏覽器直接呼叫公開市場／匯率 API，失敗時改用建置期快取。
- **沒有 `data/config.json` 常駐檔**：執行時資料在 IndexedDB；範例備份在 `examples/`。
- **設計文件在 `docs/`**：不再使用獨立的 `design-system/` 目錄。

## 常用指令

```bash
npm run dev            # http://127.0.0.1:3000
npm test               # Vitest
npm run build          # 產出 .output/public
npm run preview        # 預覽靜態站
npm run update:market  # 更新官方商品／大盤快取
```
