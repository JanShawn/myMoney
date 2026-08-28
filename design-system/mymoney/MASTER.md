# myMoney Design System

## Direction

清新、安靜、容易長時間閱讀的個人財務工具。資訊密度適中，重點數字清楚，但不營造交易軟體的緊張感。

## Colors

| Token | Value | Usage |
|---|---:|---|
| Primary | #0F766E | 主按鈕、目前導覽、關鍵數字 |
| Primary hover | #115E59 | Hover / active |
| Secondary | #0EA5A4 | 圖表與輔助互動 |
| Accent | #0369A1 | 市場對照線、資訊提示 |
| Background | #F4F8F7 | 頁面底色 |
| Surface | #FFFFFF | 卡片、表單 |
| Border | #DCE8E5 | 分隔線與輸入框 |
| Text | #163B3A | 主要文字 |
| Muted | #647B78 | 次要說明 |
| Danger | #B42318 | 錯誤與負債 |

## Typography and spacing

- 系統無襯線字體；數字使用 tabular-nums。
- 8px spacing scale，卡片圓角 16px，輸入與按鈕至少 44px 高。
- Dashboard 卡片使用舒展留白；資料輸入頁以清楚分組和短說明降低認知負擔。

## Interaction

- 所有互動元件有可見 focus ring；不只用顏色表達狀態。
- 動畫 150–220ms，尊重 prefers-reduced-motion。
- 行動版使用底部導覽，桌面版使用側欄。
- 錯誤訊息使用 aria-live；表單使用明確 label 與錯誤文字。
