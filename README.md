# 常順地產值班表 - React 版本

現代化的 React 應用，提供排班、值班台、Key 借還、工具與管理功能。

## 🚀 技術棧

- **React** + **TypeScript**
- **Vite** - 快速建置工具
- **Tailwind CSS** - 樣式框架
- **shadcn/ui** - UI 組件庫
- **Supabase** - 資料持久化
- **@tanstack/react-query** - 資料管理

## 📦 安裝

```bash
npm install
```

## 🛠️ 開發

```bash
npm run dev
```

訪問：`http://localhost:8080`

## 🏗️ 建置

```bash
npm run build
```

建置產物會在 `dist/` 目錄。

## 📤 部署

### Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name=shun1010-react
```

或使用 Cloudflare Pages Dashboard：
1. 連接 GitHub 倉庫
2. 建置命令：`npm run build`
3. 輸出目錄：`dist`

## 🔧 環境變數

複製 `.env.example` 為 `.env` 並填入：

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_USE_SUPABASE=true
```

## 📝 功能

- ✅ 自動排班系統
- ✅ 值班台管理
- ✅ 鑰匙借還系統
- ✅ 規則庫設定
- ✅ 資料匯出/匯入
- ✅ Supabase 資料同步

## 📄 授權

常順地產內部使用
