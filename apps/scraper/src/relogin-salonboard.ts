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

async function main() {
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
  console.log('セッションを Supabase に保存しました。Railway が次回同期で使用します。');

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
