/**
 * SALON BOARD 再ログイン + セッション保存（Supabase）
 *
 * CAPTCHA 対応が必要な場合に Mac で実行:
 *   npx tsx src/relogin-salonboard.ts
 *
 * セッションは Supabase に保存され、Railway が次回同期で使用
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { saveSession } from './lib/browser.js';
import { logSessionEvent, analyzeSessionLifetime } from './lib/session-tracker.js';

async function main() {
  // 再ログイン前にセッション寿命の分析結果を表示
  const analysis = await analyzeSessionLifetime('salonboard');
  if (analysis) {
    console.log(`\n📊 セッション寿命の学習データ:`);
    console.log(`   平均寿命: ${analysis.averageLifetimeHours.toFixed(1)}時間`);
    console.log(`   最短: ${analysis.minLifetimeHours.toFixed(1)}時間 / 最長: ${analysis.maxLifetimeHours.toFixed(1)}時間`);
    console.log(`   推奨更新間隔: ${analysis.recommendedRefreshHours.toFixed(1)}時間`);
    console.log(`   サンプル数: ${analysis.sampleCount}回\n`);
  } else {
    console.log('\n📊 セッション寿命の学習データはまだありません（2回以上の期限切れが必要）\n');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('SALON BOARD: ログインページを開いています...');
  await page.goto('https://salonboard.com/login/', { timeout: 30000 });

  const loginId = process.env.SALON_BOARD_ID ?? '';
  const password = process.env.SALON_BOARD_PASSWORD ?? '';

  await page.fill('input[name="userId"]', loginId);
  await page.fill('input[name="password"]', password);
  await page.click('a.common-CNCcommon__primaryBtn');

  // ログイン完了を最大2分待つ（CAPTCHA時は手動対応）
  console.log('ログイン待機中...（CAPTCHAが出た場合は手動で解いてください）');
  await page.waitForURL('**/KLP/**', { timeout: 120000 });
  console.log('ログイン成功! URL:', page.url());

  // セッション保存（Supabase）
  await saveSession(context, 'salonboard');
  console.log('セッションを Supabase に保存しました。');

  // セッション作成イベントを記録
  await logSessionEvent({
    service: 'salonboard',
    event_type: 'session_created',
    metadata: { method: 'manual_relogin' },
  });

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
