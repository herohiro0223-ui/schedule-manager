#!/bin/bash
# ==============================================
# 統合スケジュール管理ツール - セットアップスクリプト
# ==============================================

set -e

echo "============================================"
echo "  Schedule Manager セットアップ"
echo "============================================"
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 1. .env ファイルの確認
if [ ! -f .env ]; then
  echo "[1/5] .env ファイルを作成中..."
  cp .env.example .env
  echo ""
  echo "!! .env ファイルを編集して、以下の情報を入力してください:"
  echo "   - Supabase URL と API キー"
  echo "   - SALON BOARD のログイン情報"
  echo "   - レセプトワークスのログイン情報"
  echo "   - Google Calendar 設定"
  echo ""
  echo "   エディタ: nano .env"
  echo ""
  read -p "設定完了後、Enter を押してください..."
else
  echo "[1/5] .env ファイル確認 OK"
fi

# 2. 依存関係のインストール
echo "[2/5] 依存関係をインストール中..."
cd apps/scraper && npm install && cd ../..
cd apps/web && npm install && cd ../..
echo "  インストール完了"

# 3. Playwright ブラウザ
echo "[3/5] Playwright ブラウザを確認中..."
cd apps/scraper && npx playwright install chromium && cd ../..

# 4. セッションディレクトリ
echo "[4/5] ディレクトリを準備中..."
mkdir -p apps/scraper/sessions
mkdir -p apps/scraper/auth

# 5. LaunchAgent の設定
echo "[5/5] LaunchAgent を設定中..."
PLIST_SRC="$PROJECT_DIR/com.schedule-manager.scraper.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.schedule-manager.scraper.plist"

# 既存があれば停止
if launchctl list | grep -q "com.schedule-manager.scraper" 2>/dev/null; then
  launchctl unload "$PLIST_DST" 2>/dev/null || true
fi

cp "$PLIST_SRC" "$PLIST_DST"
echo "  LaunchAgent をコピーしました"
echo ""

echo "============================================"
echo "  セットアップ完了!"
echo "============================================"
echo ""
echo "次のステップ:"
echo ""
echo "1. Supabase でプロジェクトを作成し、.env に URL/KEY を設定"
echo "   https://supabase.com/dashboard"
echo ""
echo "2. Supabase SQL Editor で schema.sql を実行"
echo "   ファイル: $PROJECT_DIR/supabase/schema.sql"
echo ""
echo "3. スクレイパーをテスト実行:"
echo "   cd $PROJECT_DIR && npm run scrape -- --once"
echo ""
echo "4. Web アプリをローカルで確認:"
echo "   cd $PROJECT_DIR && npm run dev:web"
echo "   ブラウザで http://localhost:3000 を開く"
echo ""
echo "5. 定期実行を開始:"
echo "   launchctl load $PLIST_DST"
echo ""
echo "6. Vercel にデプロイ:"
echo "   cd apps/web && npx vercel"
echo ""
