# myMoney

myMoney 是可純靜態部署的個人資產盤點工具。它能自由建立帳戶與分類、計算投資市值、驗算現金，並把每日重點保存在使用者選擇的本機 JSON。

## 架構

- Nuxt 4、Vue 3、Pinia、Tailwind CSS。
- 沒有 Express、資料庫或常駐本機後端。
- Chrome／Edge 桌面版可直接連結並更新本機 data.json。
- 未連結檔案時使用 IndexedDB 自動保存。
- JSON 可匯入／下載，Excel 用來匯出與分析歷史快照。
- Storage Adapter 已與頁面分離，後續可替換成 Remote API。

## 開始使用

需要 Node.js 22 以上。

    npm install
    npm run dev

開啟 http://127.0.0.1:3000。

第一次建議流程：

1. 到「設定」選擇既有 data.json，或建立新的 myMoney-data.json。
2. 到「帳戶結構」建立群組與帳戶項目；外幣帳戶目前支援 USD、JPY，系統會用每日參考匯率換算成 TWD。
3. 如有台灣上市／上櫃股票或 ETF，到「投資持倉」輸入代號與數量，名稱和最近收盤價會自動帶入。
4. 到「資產盤點」更新餘額、加權指數和 240MA。
5. 定期從設定頁下載 JSON 備份；需要 Excel 時再匯出。

## 靜態產出

    npm run build

產出位於 .output/public，可部署至 GitHub Pages、Cloudflare Pages、Netlify 或任何靜態主機。

GitHub Pages 若使用 repository 子路徑，建置時設定：

    NUXT_APP_BASE_URL=/repository-name/

## 資料保存

- 已連結 JSON：每次修改直接寫回使用者授權的本機檔案。
- IndexedDB：尚未連結檔案時的主要保存位置，也是最近 5 份內部備份位置。
- JSON 下載：跨瀏覽器的手動備份。
- Excel：只匯出每日快照，不保存帳戶結構，也不作為復原格式。
- 外幣匯率：成功取得後會連同更新時間保存在 JSON／IndexedDB，離線時保留上次匯率。

瀏覽器不允許網站自行指定本機路徑。第一次必須由使用者選擇檔案；重新開啟網站後也可能需要再次授權。

## 驗證

    npm test
    npm run build

若要更新純靜態頁面內建的官方商品名稱、收盤價、加權指數與 240MA 快取：

    npm run update:market

## 目前限制

- File System Access API 以 Chrome／Edge 桌面版支援最完整；其他瀏覽器使用 IndexedDB 加 JSON 匯入／下載。
- 加權指數與 240MA 由證交所 FMTQIK 每日資料產生；瀏覽器無法跨站時使用建置時的官方快取。
- USD、JPY 使用 ExchangeRate-API 的每日參考匯率；不是銀行現鈔或即期實際成交價。
- 上市／上櫃商品會優先讀取官方線上資料；若瀏覽器跨站連線被阻擋，改用建置時保存的官方資料快取，畫面會標示更新日期。
- 尚未處理登入、多人同步、成本、損益與股利。
