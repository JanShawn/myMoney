# myMoney Design System

## Direction

清新、安靜、容易長時間閱讀的個人財務工具。資訊密度適中，重點數字清楚，但不營造交易軟體的緊張感。

## Colors

| Token | Value | Usage |
|---|---:|---|
| Primary | #0B6B63 | 主按鈕、目前導覽、關鍵數字 |
| Primary hover | #07574F | Hover / active |
| Primary soft | #E8F5F2 | 選取狀態、柔和資訊底色 |
| Accent | #236B8E | 市場對照線、資訊提示 |
| Background | #F3F7F6 | 頁面底色 |
| Surface | #FFFFFF | 卡片、表單 |
| Border | #DCE7E4 | 分隔線與輸入框 |
| Text | #173D39 | 主要文字 |
| Muted | #6C8581 | 次要說明 |
| Danger | #AD352D | 錯誤與負債 |

## Typography and spacing

- 系統無襯線字體；數字使用 tabular-nums。
- 8px spacing scale，主要面板圓角 20px，輸入與按鈕至少 44px 高。
- Dashboard 卡片使用舒展留白；資料輸入頁以清楚分組和短說明降低認知負擔。

## Shared components

- `PageHeader`：所有頁面的標題、說明與主要操作區。
- `UiPanel`：內容面板、表單面板與資料清單容器，支援 flush 與 compact 模式。
- `AppNotice`：info、success、warning、error 四種狀態訊息。
- `EmptyState`：清單尚無資料時的統一引導。
- `MetricCard`：總覽頁的核心數字卡片。

## Interaction

- 所有互動元件有可見 focus ring；不只用顏色表達狀態。
- 動畫 150–220ms，尊重 prefers-reduced-motion。
- 行動版使用底部導覽，桌面版使用側欄。
- 錯誤訊息使用 aria-live；表單使用明確 label 與錯誤文字。
