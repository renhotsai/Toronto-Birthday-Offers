# 🎂 Toronto Birthday Offers｜多倫多生日優惠地圖

社群一起分享大多倫多地區的生日免費好康。有清單和地圖兩種模式，優惠都標示查證狀態。

A community map of birthday freebies across the GTA, with list and map views and a verification status on every offer.

## 功能（v1）

- **清單／地圖模式**：資料分成品牌、優惠、分店三層。連鎖店的優惠只寫一次，地圖顯示所有分店。
- **篩選**：類別、使用期間（當天／當週／當月）、免註冊會員、離我最近（瀏覽器定位）。篩選條件寫在網址裡，可以直接分享。
- **品牌頁** `/{en|zh}/brands/{slug}`：有 SEO metadata、`hreflang`、sitemap。
- **登入**：Google 或 email 登入連結（magic link）。瀏覽不用登入，分享和投票要登入。
- **混合制查證**：
  - 每個優惠都必須附官方條款連結。
  - 新優惠會立刻顯示，標「未查證」。
  - 審核員查證後改成「已查證」。
  - 超過 6 個月沒有重新查證，自動變成「待確認」。
  - 社群可以投「還有效／已失效」；失效票多時會顯示警告。
- **分店回報**：使用者可以回報某家分店不參加、已關閉或位置錯誤。審核員套用後，該分店會被隱藏。
- **管理後台** `/{lang}/admin`：
  - 審核員可以處理待審核和待重新確認的優惠：查證、編輯、隱藏、合併重複（票數會一起轉過去）。
  - 審核員也處理分店回報。
  - 管理員另外可以指派角色。
- **角色**：`user`、`moderator`、`admin`。`ADMIN_EMAILS` 裡的 email 第一次登入時會自動成為管理員。
- **中英雙語**：依瀏覽器語言或 cookie 自動導到 `/en` 或 `/zh`。
- **PWA manifest**：可以加到手機主畫面。

## 技術

Next.js 16（App Router）、Neon Postgres、Drizzle ORM、Better Auth、Leaflet 加 OpenStreetMap、Tailwind CSS 4、Vitest。

> 「離我最近」用 Haversine 公式在瀏覽器端計算。目前的資料量（幾百到幾千家分店）不需要 PostGIS；資料量變大時，再把計算移到資料庫並改用 PostGIS。

## 本機開發

```bash
cp .env.example .env        # 填入 DATABASE_URL、BETTER_AUTH_SECRET、ADMIN_EMAILS
npm install
npm run db:migrate          # 建立資料表
npm run db:seed             # 匯入第一批 30 個優惠（都是「未查證」）
npm run db:import-osm       # 從 OpenStreetMap 匯入連鎖店分店（可以重複執行）
npm run dev
```

本機沒有設定 `RESEND_API_KEY` 時，登入連結會印在終端機上。

## 測試

```bash
npm run typecheck && npm run lint
TEST_DATABASE_URL=postgres://...可以清空的測試資料庫... npm test
```

沒有設定 `TEST_DATABASE_URL` 時，只會執行純邏輯測試，資料庫和登入流程的測試會跳過。

## 部署（Vercel + Neon）

1. **資料庫**：在 Vercel 專案的 Storage 連接 Neon，Vercel 會自動設定 `DATABASE_URL` 和 `DATABASE_URL_UNPOOLED`。
   - 每次部署時 `vercel-build` 會自動跑 `db:deploy`：先套用 migration，再匯入 seed。seed 可以重複跑，不會重複寫入或覆蓋資料。
2. **Vercel 環境變數**：
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` 和 `NEXT_PUBLIC_SITE_URL`：都填 `https://你的網址.vercel.app`
   - `ADMIN_EMAILS`
   - `RESEND_API_KEY` 和 `EMAIL_FROM`
   - `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`
3. **Google 登入**：
   1. 到 Google Cloud Console，進入 APIs & Services → Credentials，建立 OAuth client ID（Web application）。
   2. Authorized redirect URI 填 `https://你的網址/api/auth/callback/google`，本機開發另外加 `http://localhost:3000/api/auth/callback/google`。
4. **Email 登入**：到 [Resend](https://resend.com) 註冊（免費方案每月 3,000 封）。要寄信給任何人，必須先驗證一個網域；只用 `onboarding@resend.dev` 時，只能寄給你自己的 email。
5. **之後改資料表**：修改 `src/db/schema.ts`，執行 `npm run db:generate`，把產生的 migration 一起 commit。下次部署時會自動套用。

Apple 登入需要 Apple Developer 帳號（每年 US$99），v1 先不做。

## 資料來源與查證

- `research/first-batch.md`：第一批 35 筆的整理過程和來源。其中 5 筆沒有優惠細節，所以只匯入 30 筆，全部都是二手資料。
- `data/seed-offers.ts`：部分官方連結暫時用搜尋連結代替（網站上會直接顯示網域，所以看得出來是搜尋頁）。審核員查證時要換成真正的條款頁。
- 地圖資料 © OpenStreetMap contributors（ODbL）。
