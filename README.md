# myMoney

myMoney 是可純靜態部署的個人資產盤點工具。它能自由建立帳戶與分類、計算投資市值、管理週期收支、驗算現金，並把資料自動保存在目前瀏覽器。

## 架構

- **單一 Nuxt 4 靜態 SPA**（Vue 3、Pinia）；沒有 Express、資料庫或常駐本機後端。
- 樣式以 `app/assets/css/main.css` 的設計 token 與自訂元件 class 為主；建置時仍載入 Tailwind（目前幾乎只用到少數 utility，例如 `sr-only`）。
- IndexedDB 永遠是自動保存的主要位置，不依賴本機檔案權限。
- JSON 用來手動建立完整備份與復原；介面會提示目前資料是否比最近一次 JSON 更新。匯入會做欄位 allowlist、大小／筆數上限與危險鍵過濾。
- Excel 只匯出歷史盤點快照，不用來復原。
- 儲存邏輯集中在 `app/services/`，與頁面分離，之後若要接 Remote API 不必重寫畫面。
- 靜態頁面加上 CSP／Referrer-Policy；Yahoo 連結一律由代號重算，不信任備份內的 URL。

詳細目錄說明見 [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md)。

## 開始使用

需要 Node.js 22 以上。

```bash
npm install
npm run dev
```

開啟 http://127.0.0.1:3000。

第一次建議流程：

1. 到「帳戶結構」建立群組與帳戶項目；外幣帳戶目前支援 USD、JPY，系統會用每日參考匯率換算成 TWD。
2. 如有台灣上市／上櫃股票或 ETF，到「投資持倉」輸入代號與數量，名稱和最近收盤價會自動帶入。
3. （選用）到「收支規劃」建立薪資、房租等週期項目，查看月均與指定月份現金流。
4. 到「資產盤點」確認帳戶、投資、加權指數和 240MA 後保存快照。
5. 定期到「設定」建立附日期時間的 JSON 完整備份；需要 Excel 時再匯出。

## 範例資料

想先查看完整介面時，可以下載 [`examples/myMoney-demo-data.json`](./examples/myMoney-demo-data.json)，再到「設定」選擇「從 JSON 復原」。這份檔案包含虛構帳戶、持倉、現金驗算、週期收支與 6 個月盤點紀錄，不含任何真實個人資料或即時市場價格。

## 靜態產出

```bash
npm run build
```

產出位於 `.output/public`，可部署至 GitHub Pages、Cloudflare Pages、Netlify 或任何靜態主機。

GitHub Pages 若使用 repository 子路徑，建置時設定：

```bash
NUXT_APP_BASE_URL=/repository-name/
```

也可用本機預覽：

```bash
npm run preview
```

## 資料保存

- **IndexedDB**：所有操作的自動保存位置，也是最近 3 份內部版本的位置。
- **JSON**：跨瀏覽器與跨電腦的手動完整備份；每次儲存都是獨立檔案，不建立長期連結。
- **Excel**：只匯出每日快照，不保存帳戶結構，也不作為復原格式。
- **外幣匯率**：成功取得後會連同更新時間保存在 JSON／IndexedDB，離線時保留上次匯率。

儲存 JSON 時會開啟系統儲存視窗並自動建議日期時間檔名；若選擇同名檔案，由作業系統確認是否取代。

## 驗證

```bash
npm test
npm run build
```

若要更新純靜態頁面內建的官方商品名稱、收盤價、加權指數與 240MA 快取：

```bash
npm run update:market
```

## 文件

- [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) — 目錄與模組職責
- [`docs/MVP_SPEC.md`](./docs/MVP_SPEC.md) — 產品範圍與完成條件
- [`docs/design-system.md`](./docs/design-system.md) — 視覺與共用元件約定
- [`examples/README.md`](./examples/README.md) — 範例資料說明

## 目前限制

- Chrome／Edge 桌面版可顯示原生另存視窗；其他瀏覽器會改用一般 JSON 下載。
- 加權指數與 240MA 由證交所 FMTQIK 每日資料產生；瀏覽器無法跨站時使用建置時的官方快取。
- USD、JPY 使用 ExchangeRate-API 的每日參考匯率；不是銀行現鈔或即期實際成交價。
- 上市／上櫃商品會優先讀取官方線上資料；若瀏覽器跨站連線被阻擋，改用建置時保存的官方資料快取，畫面會標示更新日期。
- 尚未處理登入、多人同步、成本、損益與股利。
