/**
 * SALON BOARD スクレイパー
 * salonboard.com のスケジュールページからデータを取得
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import {
  type Appointment,
  replaceAppointments,
  reconcileRequests,
  logSync,
  isSourceSyncing,
  supabase,
} from '../lib/supabase.js';
import { today, saveSession } from '../lib/browser.js';
import { logSessionEvent, shouldRefreshSession } from '../lib/session-tracker.js';

const LOGIN_URL = 'https://salonboard.com/login/';
const SCHEDULE_URL = 'https://salonboard.com/KLP/schedule/salonSchedule/';

// ブラウザ内で実行するスクリプト（esbuildの__name問題を回避するため文字列で定義）
const EXTRACT_SCRIPT = `
(() => {
  var results = [];

  // 1. スタッフ名リスト
  var staffHeaderList = document.querySelector('.jscScheduleMainHeadListStaff');
  var staffNames = [];
  if (staffHeaderList) {
    var lis = staffHeaderList.querySelectorAll(':scope > li');
    for (var i = 0; i < lis.length; i++) {
      var name = (lis[i].textContent || '').trim().split('\\n')[0].trim();
      if (name) staffNames.push(name);
    }
  }

  // 2. pxPerHour を動的に算出
  var pxPerHour = 132;
  var baseHour = 10;

  var firstTimeEl = document.querySelector('.scheduleTimeTableHour');
  if (firstTimeEl) {
    var tm = (firstTimeEl.textContent || '').trim().match(/^(\\d+)/);
    if (tm) baseHour = parseInt(tm[1], 10);
  }

  var todos = document.querySelectorAll('.scheduleToDo');
  for (var ti = 0; ti < todos.length; ti++) {
    var todoText = todos[ti].textContent || '';
    var timeMatch = todoText.match(/\\["(\\d+):(\\d+)",\\s*"(\\d+):(\\d+)"\\]/);
    var todoStyle = todos[ti].getAttribute('style') || '';
    var todoLeft = todoStyle.match(/left:\\s*([\\d.]+)px/);
    var todoWidth = todoStyle.match(/width:\\s*([\\d.]+)px/);

    if (timeMatch && todoLeft && todoWidth) {
      var sH = parseInt(timeMatch[1], 10);
      var sM = parseInt(timeMatch[2], 10);
      var eH = parseInt(timeMatch[3], 10);
      var eM = parseInt(timeMatch[4], 10);
      var dur = (eH + eM / 60) - (sH + sM / 60);
      var wPx = parseFloat(todoWidth[1]);
      if (dur > 0 && wPx > 0) {
        pxPerHour = wPx / dur;
        var lPx = parseFloat(todoLeft[1]);
        baseHour = Math.round((sH + sM / 60) - lPx / pxPerHour);
      }
      break;
    }
  }

  // 3. スタッフ列ごとに処理
  var staffTable = document.querySelector('.jscScheduleMainTableStaff');
  var columns = staffTable
    ? staffTable.querySelectorAll(':scope > li, :scope > .scheduleMainTableLine')
    : [];

  for (var ci = 0; ci < columns.length; ci++) {
    var col = columns[ci];
    var staffName = staffNames[ci] || '';

    // 予約ブロック
    var reservations = col.querySelectorAll('.scheduleReservation');
    for (var ri = 0; ri < reservations.length; ri++) {
      var block = reservations[ri];
      var cls = block.className || '';
      if (cls.indexOf('equipmentTask') >= 0) continue;

      var nameEl = block.querySelector('.scheduleReserveName');
      var customerName = (nameEl ? nameEl.textContent : '').trim().replace(/\\s*様$/, '').trim();

      // かな名を取得（data属性、title属性、別要素から）
      var customerNameKana = '';
      if (nameEl) {
        customerNameKana = nameEl.getAttribute('data-kana') || nameEl.getAttribute('title') || '';
      }
      if (!customerNameKana) {
        var kanaEl = block.querySelector('.scheduleReserveNameKana, .scheduleReserveKana, [class*="Kana"], [class*="kana"]');
        if (kanaEl) customerNameKana = (kanaEl.textContent || '').trim().replace(/\\s*様$/, '').trim();
      }

      // サービスアイコン
      var icons = [];
      var iconLis = block.querySelectorAll('.scheduleReserveIconList li');
      for (var ii = 0; ii < iconLis.length; ii++) {
        var liCls = iconLis[ii].className || '';
        if (liCls.indexOf('Name') >= 0) continue;
        var lt = (iconLis[ii].textContent || '').trim();
        if (lt.length > 0 && lt.length < 15 && lt.indexOf('様') < 0) {
          if (lt === 'i' || lt === '￥' || lt === '新' || lt === '指' || lt === 'ポ') continue;
          icons.push(lt);
        }
      }

      // CSS → 時間
      var bStyle = block.getAttribute('style') || '';
      var bLeft = bStyle.match(/left:\\s*([\\d.]+)px/);
      var bWidth = bStyle.match(/width:\\s*([\\d.]+)px/);
      var startTime = '';
      var endTime = '';
      if (bLeft && bWidth) {
        var startTotal = baseHour + parseFloat(bLeft[1]) / pxPerHour;
        var endTotal = baseHour + (parseFloat(bLeft[1]) + parseFloat(bWidth[1])) / pxPerHour;
        var sh = Math.floor(startTotal);
        var sm = Math.round((startTotal - sh) * 60);
        if (sm === 60) { sh++; sm = 0; }
        var eh = Math.floor(endTotal);
        var em = Math.round((endTotal - eh) * 60);
        if (em === 60) { eh++; em = 0; }
        startTime = (sh < 10 ? '0' : '') + sh + ':' + (sm < 10 ? '0' : '') + sm;
        endTime = (eh < 10 ? '0' : '') + eh + ':' + (em < 10 ? '0' : '') + em;
      }

      if (customerName) {
        results.push({
          staffName: staffName,
          customerName: customerName,
          customerNameKana: customerNameKana || '',
          startTime: startTime,
          endTime: endTime,
          services: icons.join(' / '),
          type: 'appointment'
        });
      }
    }

    // ToDo
    var todoBlocks = col.querySelectorAll('.scheduleToDo');
    for (var tdi = 0; tdi < todoBlocks.length; tdi++) {
      var tdBlock = todoBlocks[tdi];
      var tdCls = tdBlock.className || '';
      if (tdCls.indexOf('isDayOff') >= 0) continue;

      var tdText = (tdBlock.textContent || '').trim();
      var tdTitle = tdText.split('\\n')[0].trim();
      var tdTime = tdText.match(/\\["(\\d+:\\d+)",\\s*"(\\d+:\\d+)"\\]/);

      if (tdTitle) {
        results.push({
          staffName: staffName,
          customerName: '',
          startTime: tdTime ? tdTime[1] : '',
          endTime: tdTime ? tdTime[2] : '',
          services: tdTitle,
          type: 'todo'
        });
      }
    }
  }

  return results;
})()
`;

export async function scrapeSalonBoard(dateStr?: string | string[]): Promise<void> {
  const dates = Array.isArray(dateStr) ? dateStr : [dateStr ?? today()];
  const sortedDates = [...dates].sort();
  const isCI = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.CI;
  const browser = await chromium.launch({ headless: isCI });

  try {
    // 二重プロセス防止: 既に同期中ならスキップ
    if (await isSourceSyncing('harilabo')) {
      console.log('SALON BOARD: 別プロセスで同期中のためスキップ');
      await browser.close();
      return;
    }
    await logSync('harilabo', 'running');

    // Supabase からセッションを読み込み
    let context;
    try {
      const { data } = await supabase
        .from('browser_sessions')
        .select('session_data')
        .eq('service', 'salonboard')
        .single();

      if (data?.session_data) {
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          storageState: data.session_data as any,
        });
        console.log('SALON BOARD: Supabase からセッション読み込み完了');
      } else {
        context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      }
    } catch {
      context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    }

    const page = await context.newPage();

    // まずスケジュールページを試す
    try {
      await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
    } catch {}

    // プロアクティブ更新チェック
    const refreshCheck = await shouldRefreshSession('salonboard');
    if (refreshCheck.shouldRefresh) {
      console.log(`SALON BOARD: ${refreshCheck.reason} → プロアクティブ更新を推奨`);
    }

    // ログインページにリダイレクトされた場合
    if (page.url().includes('login')) {
      await logSessionEvent({
        service: 'salonboard',
        event_type: 'session_expired',
        error_message: 'スケジュールページからログインページにリダイレクト',
      });

      console.log('SALON BOARD: セッション切れ、自動ログインを試行...');
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(1000);

      const loginId = process.env.SALON_BOARD_ID ?? '';
      const password = process.env.SALON_BOARD_PASSWORD ?? '';
      if (!loginId || !password) {
        throw new Error('SALON_BOARD_ID / SALON_BOARD_PASSWORD が未設定');
      }

      await page.fill('input[name="userId"]', loginId);
      await page.fill('input[name="password"]', password);
      await page.click('a.common-CNCcommon__primaryBtn');

      try {
        await page.waitForURL('**/KLP/**', { timeout: 60000 });
      } catch {
        const currentUrl = page.url();
        const errMsg = currentUrl.includes('password')
          ? 'パスワード変更が必要です。npx tsx src/relogin-salonboard.ts を実行してください'
          : '自動ログイン失敗（CAPTCHAの可能性）。npx tsx src/relogin-salonboard.ts を実行してください';
        await logSessionEvent({
          service: 'salonboard',
          event_type: 'auto_login_failed',
          error_message: errMsg,
        });
        throw new Error(errMsg);
      }
      console.log('SALON BOARD: ログイン成功');
      await saveSession(context, 'salonboard');
      await logSessionEvent({
        service: 'salonboard',
        event_type: 'auto_login_success',
      });
    } else {
      // セッション有効
      await logSessionEvent({
        service: 'salonboard',
        event_type: 'sync_success',
      });
    }

    console.log(`SALON BOARD: ${sortedDates.length}日分のスケジュールを取得中...`);
    let totalCount = 0;
    let todayTableNotFound = false;
    const todayStr = today();

    for (const date of sortedDates) {
      const dateCompact = date.replace(/-/g, '');

      // ページ読み込み（最大3回リトライ）
      let loaded = false;
      let reloginAttempted = false; // 無限ループ防止: 再ログインは1回のみ
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(`${SCHEDULE_URL}?date=${dateCompact}`, {
            waitUntil: 'domcontentloaded', timeout: 60000,
          });
          const url = page.url();
          if (url === 'about:blank') throw new Error('about:blank');
          if (url.includes('login')) {
            if (reloginAttempted) {
              throw new Error('セッション切れ。npx tsx src/relogin-salonboard.ts を実行してください');
            }
            reloginAttempted = true;

            // 自動再ログインを試みる
            console.log(`SALON BOARD: ${date} ループ中にセッション切れ検知、自動再ログインを試行...`);
            await logSessionEvent({
              service: 'salonboard',
              event_type: 'session_expired',
              error_message: `ループ中セッション切れ (date: ${date})`,
            });

            const loginId = process.env.SALON_BOARD_ID ?? '';
            const password = process.env.SALON_BOARD_PASSWORD ?? '';
            try {
              await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
              await page.waitForTimeout(1000);
              await page.fill('input[name="userId"]', loginId);
              await page.fill('input[name="password"]', password);
              await page.click('a.common-CNCcommon__primaryBtn');
              await page.waitForURL('**/KLP/**', { timeout: 60000 });
              console.log('SALON BOARD: ループ中の自動再ログイン成功');
              await saveSession(context, 'salonboard');
              await logSessionEvent({
                service: 'salonboard',
                event_type: 'auto_login_success',
                error_message: `ループ中再ログイン成功 (date: ${date})`,
              });
              // リトライ: 同じ日付でもう一度試す
              attempt = -1; // forループで+1されて0になり再試行
              continue;
            } catch {
              await logSessionEvent({
                service: 'salonboard',
                event_type: 'auto_login_failed',
                error_message: 'ループ中の自動再ログイン失敗',
              });
              throw new Error('セッション切れ。npx tsx src/relogin-salonboard.ts を実行してください');
            }
          }
          loaded = true;
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('セッション切れ')) throw e;
          if (attempt < 2) {
            console.log(`SALON BOARD: ${date} リトライ (${attempt + 1}/3) - ${msg}`);
            await page.waitForTimeout(5000);
          }
        }
      }
      if (!loaded) {
        console.log(`SALON BOARD: ${date} スキップ`);
        await replaceAppointments('harilabo', date, []);
        continue;
      }

      // スケジュール描画を待つ
      try {
        await page.waitForSelector('.jscScheduleMainTableStaff', { timeout: 30000 });
        await page.waitForTimeout(2000);
      } catch {
        // 描画待ちタイムアウト（予約なしの日もある）
        console.log(`SALON BOARD: ${date} スケジュールテーブル未検出 (URL: ${page.url()})`);
        if (date === todayStr) {
          todayTableNotFound = true;
        }
      }

      const rawData = await page.evaluate(EXTRACT_SCRIPT) as {
        staffName: string;
        customerName: string;
        customerNameKana: string;
        startTime: string;
        endTime: string;
        services: string;
        type: string;
      }[];

      const seen = new Set<string>();
      const appointments: Appointment[] = [];

      rawData.forEach((item, idx) => {
        // 休憩・ToDo・接骨院タスクは除外（予約のみ）
        if (item.type === 'todo') return;
        if (item.customerName === '接骨院' || item.services.includes('接骨院')) return;

        const key = `${item.staffName}-${item.customerName}-${item.startTime}-${item.services}`;
        if (seen.has(key)) return;
        seen.add(key);

        appointments.push({
          source: 'harilabo',
          external_id: `sb-${date}-${idx}`,
          date: date,
          start_time: item.startTime || '00:00',
          end_time: item.endTime || undefined,
          title: item.services || '施術',
          customer_name: item.customerName || undefined,
          customer_name_kana: item.customerNameKana || undefined,
          staff_name: item.staffName || undefined,
          service_types: item.services ? item.services.split(' / ') : [],
          appointment_type: item.type,
          status: 'confirmed',
          color: '#3B82F6',
        });
      });

      console.log(`SALON BOARD: ${date} → ${appointments.length} 件`);
      appointments.forEach(a => {
        console.log(`  ${a.start_time}-${a.end_time ?? '??'} ${a.customer_name ?? a.title} (${a.staff_name})`);
      });

      // かな辞書に自動登録
      const kanaEntries = appointments
        .filter(a => a.customer_name && a.customer_name_kana)
        .map(a => ({ name: a.customer_name!, name_kana: a.customer_name_kana! }));
      if (kanaEntries.length > 0) {
        await supabase.from('customer_kana').upsert(kanaEntries, { onConflict: 'name', ignoreDuplicates: true });
      }

      await replaceAppointments('harilabo', date, appointments);
      totalCount += appointments.length;
    }

    await logSync('harilabo', 'success', totalCount);
    console.log(`SALON BOARD: 同期完了 (${sortedDates.length}日, ${totalCount}件)`);

    // セッション切れ検知ログ
    if (todayTableNotFound) {
      console.warn('SALON BOARD: セッション切れの可能性（スケジュールテーブル未検出）');
    }

    // 予約リクエストとの突き合わせ（失敗しても同期自体は成功扱い）
    try {
      await reconcileRequests(sortedDates);
    } catch (e) {
      console.error('SALON BOARD: reconcileRequests エラー（同期は成功）', e);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SALON BOARD: エラー', message);
    await logSync('harilabo', 'error', 0, message);
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.includes('salonboard')) {
  const dateArg = process.argv[2];
  scrapeSalonBoard(dateArg).then(() => process.exit(0));
}
