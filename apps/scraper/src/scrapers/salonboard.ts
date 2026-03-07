/**
 * SALON BOARD スクレイパー
 * salonboard.com のスケジュールページからデータを取得
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import {
  type Appointment,
  replaceAppointments,
  logSync,
  supabase,
} from '../lib/supabase.js';
import { today, saveSession } from '../lib/browser.js';

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

export async function scrapeSalonBoard(dateStr?: string): Promise<void> {
  const targetDate = dateStr ?? today();
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

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
      await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
    } catch {}

    // ログインページにリダイレクトされた場合
    if (page.url().includes('login')) {
      // headlessモードではCAPTCHA対応不可のため、自動ログインを試みる
      console.log('SALON BOARD: セッション切れ、自動ログインを試行...');
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      const loginId = process.env.SALON_BOARD_ID ?? '';
      const password = process.env.SALON_BOARD_PASSWORD ?? '';
      if (!loginId || !password) {
        throw new Error('SALON_BOARD_ID / SALON_BOARD_PASSWORD が未設定');
      }

      await page.fill('input[name="userId"]', loginId);
      await page.fill('input[name="password"]', password);
      await page.click('a.common-CNCcommon__primaryBtn');

      // ログイン完了を待つ（headlessなので短めのタイムアウト）
      try {
        await page.waitForURL('**/KLP/**', { timeout: 15000 });
      } catch {
        // CAPTCHAやパスワード変更画面の可能性
        const currentUrl = page.url();
        if (currentUrl.includes('password')) {
          // Web UIに通知
          await supabase.from('notifications').insert({
            source: 'harilabo',
            date: targetDate,
            start_time: '00:00',
            title: 'SALON BOARD: パスワード変更が必要です',
          });
          throw new Error('パスワード変更が必要です。ブラウザで手動変更してください。その後 npx tsx src/relogin-salonboard.ts を実行してセッションを更新してください');
        }
        // Web UIに通知
        await supabase.from('notifications').insert({
          source: 'harilabo',
          date: targetDate,
          start_time: '00:00',
          title: 'SALON BOARD: セッション切れ。再ログインが必要です',
        });
        throw new Error('自動ログイン失敗（CAPTCHAの可能性）。npx tsx src/relogin-salonboard.ts を実行してセッションを更新してください');
      }
      console.log('SALON BOARD: ログイン成功');

      // セッション保存（Supabase）
      await saveSession(context, 'salonboard');

      // スケジュールページへ
      await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // 指定日のスケジュールを取得する関数
    async function scrapeDate(date: string): Promise<Appointment[]> {
      const dateCompact = date.replace(/-/g, '');

      // ページ読み込み（最大2回リトライ）
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await page.goto(`${SCHEDULE_URL}?date=${dateCompact}`, {
            waitUntil: 'networkidle', timeout: 60000,
          });
          break;
        } catch {
          if (attempt === 0) {
            console.log('SALON BOARD: ページ読み込みリトライ...');
            await page.waitForTimeout(3000);
          }
        }
      }

      // スケジュール描画を待つ（AJAX読み込み完了まで）
      const currentUrl = page.url();
      console.log(`SALON BOARD: ページURL: ${currentUrl}`);
      if (currentUrl.includes('login')) {
        throw new Error('セッション切れ。npx tsx src/relogin-salonboard.ts を実行してください');
      }
      try {
        await page.waitForSelector('.jscScheduleMainTableStaff', { timeout: 30000 });
        await page.waitForTimeout(3000);
      } catch {
        const html = await page.content();
        console.log(`SALON BOARD: 描画待ちタイムアウト (HTML長: ${html.length}, タイトル: ${await page.title()})`);
      }

      const rawData = await page.evaluate(EXTRACT_SCRIPT) as {
        staffName: string;
        customerName: string;
        startTime: string;
        endTime: string;
        services: string;
        type: string;
      }[];

      const seen = new Set<string>();
      const appointments: Appointment[] = [];

      // デバッグ: 全スタッフ名と予約数を出力
      const staffCounts: Record<string, number> = {};
      rawData.forEach(item => {
        staffCounts[item.staffName || '(空)'] = (staffCounts[item.staffName || '(空)'] || 0) + 1;
      });
      console.log(`  DOM抽出: ${rawData.length}件 スタッフ別:`, staffCounts);

      rawData.forEach((item, idx) => {
        // 佐藤 洋のデータのみ取得
        if (!item.staffName.includes('佐藤') || !item.staffName.includes('洋')) return;

        const key = `${item.staffName}-${item.customerName}-${item.startTime}-${item.services}`;
        if (seen.has(key)) return;
        seen.add(key);

        appointments.push({
          source: 'harilabo',
          external_id: `sb-${date}-${idx}`,
          date: date,
          start_time: item.startTime || '00:00',
          end_time: item.endTime || undefined,
          title: item.type === 'todo'
            ? item.services
            : item.services
              ? `${item.services}`
              : '施術',
          customer_name: item.customerName || undefined,
          staff_name: item.staffName || undefined,
          service_types: item.services ? item.services.split(' / ') : [],
          appointment_type: item.type,
          status: 'confirmed',
          color: '#3B82F6',
        });
      });

      return appointments;
    }

    // 対象日のスケジュールを取得
    console.log(`SALON BOARD: ${targetDate} のスケジュールを取得中...`);
    const appointments = await scrapeDate(targetDate);

    console.log(`SALON BOARD: ${appointments.length} 件の予約を取得`);
    appointments.forEach(a => {
      console.log(`  ${a.start_time}-${a.end_time ?? '??'} ${a.customer_name ?? a.title} (${a.staff_name})`);
    });

    await replaceAppointments('harilabo', targetDate, appointments);
    await logSync('harilabo', 'success', appointments.length);
    console.log('SALON BOARD: 同期完了');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SALON BOARD: エラー', message);
    await logSync('harilabo', 'error', 0, message);
  } finally {
    if (browser) await browser.close();
  }
}

if (process.argv[1]?.includes('salonboard')) {
  const dateArg = process.argv[2];
  scrapeSalonBoard(dateArg).then(() => process.exit(0));
}
