# 部署指南

## Cloudflare Pages 部署

### 方法 1: 使用 Wrangler CLI

```bash
npm run build
npx wrangler pages deploy dist --project-name=shun1010-react
```

### 方法 2: 使用 GitHub Actions（自動部署）

1. 在 GitHub 創建新倉庫：`shun1010-react`
2. 推送代碼：
   ```bash
   git push -u origin main
   ```
3. 在 Cloudflare Pages Dashboard：
   - 連接 GitHub 倉庫
   - 建置命令：`npm run build`
   - 輸出目錄：`dist`
   - 環境變數：設置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

## 環境變數設置

在 Cloudflare Pages Dashboard 的環境變數中設置：

- `VITE_SUPABASE_URL` - Supabase 專案 URL
- `VITE_SUPABASE_ANON_KEY` - Supabase Anon Key
- `VITE_USE_SUPABASE` - 設為 `true` 啟用 Supabase

## 訪問

部署完成後，應用將在 `https://shun1010-react.pages.dev` 或您設定的自訂網域上可用。
