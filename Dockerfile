FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# ルートの package.json と lock ファイル
COPY package.json package-lock.json ./

# スクレイパーの package.json
COPY apps/scraper/package.json apps/scraper/

# 依存関係インストール（scraper ワークスペースのみ）
RUN npm ci --workspace=apps/scraper

# スクレイパーのソースコードをコピー
COPY apps/scraper/ apps/scraper/

# 環境変数は Railway で設定
ENV NODE_ENV=production

CMD ["npx", "tsx", "apps/scraper/src/index.ts"]
