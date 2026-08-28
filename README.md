# myMoney

myMoney 是可純靜態部署的個人資產盤點工具。它能自由建立帳戶與分類、計算投資市值、驗算現金，並把每日重點保存在使用者選擇的本機 JSON。

## 架構

- Nuxt 4、Vue 3、Pinia、Tailwind CSS。
- 沒有 Express、資料庫或常駐本機後端。
- Chrome／Edge 桌面版可直接連結並更新本機 data.json。
- 未連結檔案時使用 IndexedDB 自動保存。
- JSON 可匯入／下載，Excel 作為歷史快照交換格式。
- Storage Adapter 已與頁面分離，後續可替換成 Remote API。

## 開始使用

需要 Node.js 22 以上。

    npm install
    npm run dev

開啟 http://127.0.0.1:3000。

第一次建議流程：

1. 到「設定」選擇既有 data.json，或建立新的 myMoney-data.json。
2. 到「帳戶結構」建立群組與帳戶項目。
3. 如有股票或債券，到「投資持倉」新增代號、數量與類別。
4. 到「資產盤點」更新餘額、加權指數和 240MA。
5. 定期從設定頁下載 JSON 備份；需要 Excel 時再匯出。

## 靜態產出

    npm run build

產出位於 .output/public，可部署至 GitHub Pages、Cloudflare Pages、Netlify 或任何靜態主機。

GitHub Pages 若使用 repository 子路徑，建置時設定：

    NUXT_APP_BASE_URL=/repository-name/

## 資料保存

- 已連結 JSON：每次修改直接寫回使用者授權的本機檔案。
- IndexedDB：尚未連結檔案時的主要保存位置，也是最近 10 份內部備份位置。
- JSON 下載：跨瀏覽器的手動備份。
- Excel：只匯入或匯出每日快照，不保存帳戶結構。

瀏覽器不允許網站自行指定本機路徑。第一次必須由使用者選擇檔案；重新開啟網站後也可能需要再次授權。

## 驗證

    npm test
    npm run build

## 目前限制

- File System Access API 以 Chrome／Edge 桌面版支援最完整；其他瀏覽器使用 IndexedDB 加 JSON 匯入／下載。
- 240MA 與外幣匯率目前手動輸入。
- TWSE 若被瀏覽器 CORS 或網路環境阻擋，股票價格與加權指數需手動輸入。
- 尚未處理登入、多人同步、成本、損益與股利。
