#!/bin/bash
# スケジュール管理 スクレイパー起動スクリプト
cd "$(dirname "$0")"
export PATH="/usr/local/bin:$PATH"
exec npx tsx src/index.ts >> logs/scraper.log 2>&1
