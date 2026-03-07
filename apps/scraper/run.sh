#!/bin/bash
# スケジュール管理 スクレイパー起動スクリプト
cd "/Users/satohiroshi/schedule-manager"
export PATH="/usr/local/bin:$PATH"
exec /usr/local/bin/node --import tsx/esm apps/scraper/src/index.ts
