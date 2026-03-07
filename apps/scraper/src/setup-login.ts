/**
 * 手動ログインスクリプト
 * ブラウザが開くので、手動でログインしてください。
 * ログイン完了後、セッションを保存して自動取得に使います。
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '../sessions');

const target = process.argv[2] ?? 'salonboard'; // salonboard or reworks

const urls: Record<string, string> = {
  salonboard: 'https://salonboard.com/login/',
  reworks: process.env.REWORKS_URL ?? 'https://satokotsu.re-works.net',
};

(async () => {
  console.log(`\n==========================`);
  console.log(`  ${target} 手動ログイン`);
  console.log(`==========================\n`);
  console.log('ブラウザが開きます。手動でログインしてください。');
  console.log('スケジュールページが表示されたら、ターミナルに戻って Enter を押してください。\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(urls[target] ?? urls.salonboard);

  // ユーザーがログインするのを待つ
  process.stdin.resume();
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  // セッション保存
  const storagePath = path.join(SESSIONS_DIR, `${target}.json`);
  await context.storageState({ path: storagePath });
  console.log(`\nセッションを保存しました: ${storagePath}`);
  console.log('現在のURL:', page.url());

  await browser.close();
  process.exit(0);
})();
