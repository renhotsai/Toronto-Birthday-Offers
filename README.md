# 🎂 多倫多生日優惠地圖 Toronto Birthday Offers

大家一起分享多倫多（GTA）的生日免費好康與優惠，用地圖找到離你最近的生日禮物。

A community map of birthday freebies and deals around Toronto.

## 功能

- 🗺️ **地圖 + 清單**：OpenStreetMap 地圖，依類別顯示圖示，點清單可跳到地圖位置
- ➕ **分享優惠**：填店名、優惠內容、條件、可用期間（當天／當週／當月），用地址搜尋或直接在地圖上點選位置
- 👍👎 **社群驗證**：每人可投「還有效」或「已失效」，失效票多時會標示「可能已失效」
- 🔍 **搜尋與分類篩選**：餐廳、飲品、甜點、美妝、購物、娛樂、其他
- 🌐 **中文／English** 切換，支援手機與深色模式

## 快速開始

需要 Node.js 22.13 以上（使用內建的 `node:sqlite`，**不需安裝任何套件**）。

```bash
npm start          # http://localhost:3000
npm run dev        # 修改檔案時自動重啟
npm test
```

## 設定（環境變數）

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `3000` | 伺服器埠號 |
| `DB_PATH` | `data/offers.db` | SQLite 資料庫位置 |
| `TRUST_PROXY` | 未設定 | 部署在反向代理後面時設為 `1`，才會使用 `X-Forwarded-For` 辨識使用者 |
| `VOTER_SALT` | `birthday` | 投票者 IP 雜湊用的 salt，正式環境請改成隨機字串 |

## API

| Method | Path | 說明 |
| --- | --- | --- |
| `GET` | `/api/offers?category=&q=` | 列出優惠 |
| `GET` | `/api/offers/:id` | 單一優惠 |
| `POST` | `/api/offers` | 新增優惠（每個 IP 每小時最多 10 筆） |
| `POST` | `/api/offers/:id/vote` | `{ "kind": "valid" \| "expired" }`，重複投票會覆蓋前一票 |

## 專案結構

```
server.js        HTTP 伺服器、API、驗證
db.js            SQLite 資料表與查詢
seed.js          第一次啟動時的範例優惠
public/          前端（Leaflet 地圖、純 JS，無需打包）
test/            API 測試
```

## 部署

任何能跑 Node 22 並有持久磁碟的平台都可以（Render、Railway、Fly.io、VPS）。
記得把 `DB_PATH` 指到持久化的磁碟，並設定 `TRUST_PROXY=1` 與 `VOTER_SALT`。

> 優惠由社群分享，條款可能隨時變動，出發前請先向店家確認。
