/**
 * 統合スクレイパー エントリポイント
 *
 * 全ソースの同期を実行し、node-cron で定期実行する。
 */

import 'dotenv/config';
import cron from 'node-cron';
import { scrapeSalonBoard } from './scrapers/salonboard.js';
import { scrapeReworks } from './scrapers/reworks.js';
import { syncGoogleCalendar } from './scrapers/google-calendar.js';
// import { syncICloudCalendar } from './scrapers/icloud-calendar.js';
import { supabase } from './lib/supabase.js';

/** 日付を YYYY-MM-DD 形式で生成 */
function addDays(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 今日の日付（JST） */
function todayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 同期中フラグ（重複実行防止） */
let isSyncing = false;

/** 通常同期（今日のみ） */
async function syncAll(dateStr?: string) {
  if (isSyncing) {
    console.log('[skip] 前回の同期がまだ実行中です');
    return;
  }
  isSyncing = true;
  const start = Date.now();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`同期開始: ${new Date().toLocaleString('ja-JP')}`);
  console.log('='.repeat(50));

  const tasks: { name: string; fn: Promise<void> }[] = [
    { name: 'SALON BOARD', fn: scrapeSalonBoard(dateStr) },
    { name: 'レセプトワークス', fn: scrapeReworks(dateStr) },
    { name: 'Google Calendar', fn: syncGoogleCalendar() },
  ];

  // iCloud Calendar は無効化（不要）

  const results = await Promise.allSettled(tasks.map(t => t.fn));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`${tasks[index].name}: 同期失敗 -`, result.reason);
    }
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n同期完了 (${elapsed}秒)`);
  isSyncing = false;
}

/** 拡張同期（複数日） */
async function syncRange(days: number) {
  const start = Date.now();
  const today = todayJST();
  const dates = Array.from({ length: days + 1 }, (_, i) => addDays(today, i));
  console.log(`\n${'='.repeat(50)}`);
  console.log(`拡張同期開始: ${today} 〜 ${addDays(today, days)} (${days + 1}日間)`);
  console.log('='.repeat(50));

  // カレンダーは常に全件同期
  syncGoogleCalendar().catch(e => console.error('Google Calendar:', e));
  if (process.env.APPLE_ID && process.env.APPLE_APP_PASSWORD) {
    syncICloudCalendar().catch(e => console.error('iCloud Calendar:', e));
  }

  // レセプトワークスは1回のブラウザで複数日を処理可能
  // SALON BOARDは日ごとにURL変更で処理
  await Promise.allSettled([
    (async () => {
      for (const date of dates) {
        await scrapeSalonBoard(date).catch(e => console.error(`SALON BOARD ${date}:`, e));
      }
    })(),
    scrapeReworks(dates),
  ]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n拡張同期完了 (${elapsed}秒)`);
}

// 引数チェック
const args = process.argv.slice(2);
const isOneShot = args.includes('--once');
const rangeArg = args.find((a) => /^--range=\d+$/.test(a));
const rangeDays = rangeArg ? parseInt(rangeArg.split('=')[1]) : 0;
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

if (rangeDays > 0) {
  // 範囲同期して終了
  syncRange(rangeDays).then(() => process.exit(0));
} else if (isOneShot) {
  // 一回だけ実行して終了
  syncAll(dateArg).then(() => process.exit(0));
} else {
  // まず即時実行：今日の同期
  syncAll(dateArg);

  // 1分ごとに今日分を同期（24時間・毎日）
  cron.schedule('* * * * *', () => {
    console.log('\n[cron] 定期同期を開始...');
    syncAll();
  }, {
    timezone: 'Asia/Tokyo',
  });

  // 毎朝6:00に今後7日分を同期
  cron.schedule('0 6 * * *', () => {
    console.log('\n[cron] 週間同期を開始...');
    syncRange(7);
  }, {
    timezone: 'Asia/Tokyo',
  });

  // 毎週日曜5:00に今後60日分を同期
  cron.schedule('0 5 * * 0', () => {
    console.log('\n[cron] 2ヶ月同期を開始...');
    syncRange(60);
  }, {
    timezone: 'Asia/Tokyo',
  });

  // 手動同期リクエストを監視（Supabase Realtime）
  supabase
    .channel('sync_requests')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sync_requests' },
      async (payload) => {
        const id = payload.new?.id;
        console.log('\n[manual] 手動同期リクエストを受信');
        try {
          await supabase.from('sync_requests').update({ status: 'running' }).eq('id', id);
          await syncAll();
          await supabase.from('sync_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
        } catch (err) {
          await supabase.from('sync_requests').update({ status: 'error', completed_at: new Date().toISOString() }).eq('id', id);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('手動同期リクエストの監視を開始');
      }
    });

  console.log('\n定期同期スケジューラーを開始しました');
  console.log('- 24時間・毎日: 1分ごと（当日）※同期中はスキップ');
  console.log('- 毎朝6:00: 今後7日分');
  console.log('- 毎週日曜5:00: 今後2ヶ月分');
  console.log('- 手動同期: Web UIから随時');
  console.log('Ctrl+C で停止\n');
}
