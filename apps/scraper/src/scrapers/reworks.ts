/**
 * レセプトワークス スクレイパー
 * satokotsu.re-works.net のタイムラインからデータを取得
 *
 * フロー:
 *   1. /master/login/ にPOSTしてログイン
 *   2. /master/timeline_shop_list.php から「閲覧」クリックでポップアップ起動
 *   3. ポップアップ (popup_timeline/?mode=3_3) からDOM解析
 *
 * DOM構造:
 *   - #staffNameArea tr: スタッフ名（行ごと、高さ48px）
 *   - .resItem: 予約ブロック（CSS top=スタッフ行, left=時間, width=所要時間）
 *   - .resItem .icon: 施術タイプ（初診/再診/後診/パーソナル/事務作業/EMS/一般/事故/鍼/マッサージ/回数券）
 *   - 44px = 30分、baseHour = 時間ヘッダーの最初の値（通常10:00）
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

const REWORKS_URL = process.env.REWORKS_URL ?? 'https://satokotsu.re-works.net';

// ブラウザ内で実行するスクリプト（esbuildの__name問題回避のため文字列）
const EXTRACT_SCRIPT = `
(() => {
  var results = [];

  // 1. スタッフ名と各行の実際の位置（累積top）
  var staffNames = [];
  var staffTops = [];
  var staffArea = document.querySelector('#staffNameArea');
  if (staffArea) {
    var rows = staffArea.querySelectorAll('tr');
    var cumulativeTop = 0;
    for (var i = 0; i < rows.length; i++) {
      var text = (rows[i].textContent || '').trim().split('\\n')[0].trim();
      staffNames.push(text);
      staffTops.push(cumulativeTop);
      var rh = parseFloat(window.getComputedStyle(rows[i]).height) || 48;
      cumulativeTop += rh;
    }
    staffTops.push(cumulativeTop); // 番兵（最後の行の終端）
  }

  // 3. baseHourとpxPerSlot
  var baseHour = 10;
  var pxPerSlot = 44; // 30分 = 44px（固定：ヘッダー幅とは異なる）
  var timeHeader = document.querySelector('#timelineHeader');
  if (timeHeader) {
    var divs = timeHeader.querySelectorAll('div');
    for (var ti = 0; ti < divs.length; ti++) {
      var t = (divs[ti].textContent || '').trim();
      var m = t.match(/^(\\d+):/);
      if (m) {
        baseHour = parseInt(m[1], 10);
        break;
      }
    }
  }

  // 4. 予約ブロック抽出
  var resItems = document.querySelectorAll('.resItem');
  for (var ri = 0; ri < resItems.length; ri++) {
    var item = resItems[ri];
    var el = item;
    var style = el.getAttribute('style') || '';

    // CSS位置
    var leftMatch = style.match(/left:\\s*([\\d.]+)px/);
    var widthMatch = style.match(/width:\\s*([\\d.]+)px/);
    var topMatch = style.match(/top:\\s*([\\d.]+)px/);

    if (!leftMatch || !topMatch) continue;

    var leftPx = parseFloat(leftMatch[1]);
    var widthPx = widthMatch ? parseFloat(widthMatch[1]) : pxPerSlot;
    var topPx = parseFloat(topMatch[1]);

    // スタッフ判定（各行の実際の累積位置から判定）
    var staffIdx = 0;
    for (var si = 0; si < staffTops.length - 1; si++) {
      if (topPx >= staffTops[si] && topPx < staffTops[si + 1]) {
        staffIdx = si;
        break;
      }
    }
    var staffName = staffNames[staffIdx] || '';

    // 時間計算
    var startMinutes = baseHour * 60 + (leftPx / pxPerSlot) * 30;
    var durationMinutes = (widthPx / pxPerSlot) * 30;
    var endMinutes = startMinutes + durationMinutes;

    var startH = Math.floor(startMinutes / 60);
    var startM = Math.round(startMinutes % 60);
    if (startM >= 60) { startH++; startM -= 60; }
    var endH = Math.floor(endMinutes / 60);
    var endM = Math.round(endMinutes % 60);
    if (endM >= 60) { endH++; endM -= 60; }

    var startTime = (startH < 10 ? '0' : '') + startH + ':' + (startM < 10 ? '0' : '') + startM;
    var endTime = (endH < 10 ? '0' : '') + endH + ':' + (endM < 10 ? '0' : '') + endM;

    // 患者名
    var customerName = '';
    var spans = item.querySelectorAll('span');
    for (var si = 0; si < spans.length; si++) {
      var st = (spans[si].textContent || '').trim();
      var cls = spans[si].className || '';
      if (cls.indexOf('icon') < 0 && st.length > 1 && st.length < 20) {
        customerName = st.replace(/^!\\s*/, '').trim();
        break;
      }
    }
    // フォールバック: .customer要素
    if (!customerName) {
      var custEl = item.querySelector('.customer');
      if (custEl) customerName = (custEl.textContent || '').trim().replace(/^!\\s*/, '').trim();
    }

    // 施術タイプ
    var icons = [];
    var iconEls = item.querySelectorAll('.icon');
    for (var ii = 0; ii < iconEls.length; ii++) {
      var iconText = (iconEls[ii].textContent || '').trim();
      if (iconText) icons.push(iconText);
    }

    // 予約ID
    var yoyakuId = el.getAttribute('id') || '';

    results.push({
      staffName: staffName,
      customerName: customerName,
      startTime: startTime,
      endTime: endTime,
      services: icons.join(' / '),
      type: icons.some(function(ic) { return ic === '事務作業'; }) ? 'task' : 'appointment',
      externalId: yoyakuId
    });
  }

  return results;
})()
`;

export async function scrapeReworks(dateStr?: string | string[]): Promise<void> {
  const dates = Array.isArray(dateStr) ? dateStr : [dateStr ?? today()];
  const browser = await chromium.launch({ headless: true });

  try {
    await logSync('sekkotwin', 'running');

    // Supabase からセッションを読み込み
    let context;
    try {
      const { data } = await supabase
        .from('browser_sessions')
        .select('session_data')
        .eq('service', 'reworks')
        .single();

      if (data?.session_data) {
        context = await browser.newContext({
          storageState: data.session_data as any,
          viewport: { width: 1400, height: 900 },
        });
        console.log('レセプトワークス: Supabase からセッション読み込み完了');
      } else {
        context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      }
    } catch {
      context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    }

    const page = await context.newPage();

    // ダッシュボードアクセスでセッション有効性を確認
    await page.goto(`${REWORKS_URL}/master/main.php`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const content = await page.content();

    // ログインが必要な場合
    if (content.length < 100 || !content.includes('satokotsu')) {
      console.log('レセプトワークス: ログイン中...');
      await page.goto(`${REWORKS_URL}/master/login/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);

      const user = process.env.REWORKS_USER ?? '';
      const password = process.env.REWORKS_PASSWORD ?? '';
      if (!user || !password) {
        throw new Error('REWORKS_USER / REWORKS_PASSWORD が未設定');
      }

      await page.fill('input[name="id"]', user);
      await page.fill('input[name="pass"]', password);
      await page.click('input[type="image"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // ログイン確認
      await page.goto(`${REWORKS_URL}/master/main.php`, { waitUntil: 'domcontentloaded' });
      const dashContent = await page.content();
      if (!dashContent.includes('satokotsu')) {
        throw new Error('レセプトワークス: ログイン失敗');
      }
      console.log('レセプトワークス: ログイン成功');

      // セッション保存（Supabase）
      await saveSession(context, 'reworks');
    }

    // 院選択ページ
    await page.goto(`${REWORKS_URL}/master/timeline_shop_list.php?cate=10&parentmenu_cd=25&menu_cd=137`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);

    // ポップアップを起動
    console.log(`レセプトワークス: ${dates.length}日分のスケジュールを取得中...`);
    const popupPromise = context.waitForEvent('page', { timeout: 60000 });
    await page.click('input[value="閲覧"]');
    const popup = await popupPromise;

    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(5000);
    // タイムラインとスタッフエリアの描画を待つ
    try {
      await popup.waitForSelector('#staffNameArea tr', { timeout: 10000 });
      await popup.waitForSelector('.resItem', { timeout: 10000 });
    } catch {
      // 予約なしの日は .resItem が存在しない場合がある
    }
    await popup.waitForTimeout(3000);

    // 日付文字列(YYYY-MM-DD)を「M/D(曜)」形式に変換
    function toDateTabLabel(dateStr: string): string {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      return `${m}/${d}(${dayNames[dt.getDay()]})`;
    }

    // 指定日のデータを抽出する関数
    async function scrapePopupDate(date: string): Promise<Appointment[]> {
      // 現在表示中の日付を確認
      const currentDate = await popup.evaluate(() => {
        const active = document.querySelector('li.active');
        return active ? (active.textContent || '').trim() : '';
      });

      const targetLabel = toDateTabLabel(date);

      if (currentDate !== targetLabel) {
        // 日付タブをクリックしてナビゲーション（最大12週先まで探索）
        // 目標日と現在表示中の日の差で前後を判定
        const [ty, tm, td] = date.split('-').map(Number);
        const targetTs = new Date(ty, tm - 1, td).getTime();

        let clicked = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          // 現在表示されているタブから目標日付を探す
          const tabExists = await popup.getByText(targetLabel, { exact: true }).count();
          if (tabExists > 0) {
            await popup.getByText(targetLabel, { exact: true }).click();
            await popup.waitForTimeout(3000);
            // スタッフエリアと予約ブロックの再描画を待つ
            try {
              await popup.waitForSelector('#staffNameArea tr', { timeout: 8000 });
              await popup.waitForSelector('.resItem', { timeout: 8000 });
            } catch {
              // 予約なしの日は .resItem が存在しない
            }
            await popup.waitForTimeout(2000);
            clicked = true;
            break;
          }

          // 現在のタブの最初の日付を取得して前後を判定
          const firstTabDate = await popup.evaluate(() => {
            const li = document.querySelector('#date-tab ul li');
            return li ? (li.textContent || '').trim() : '';
          });
          // firstTabDate: "3/6(金)" → 月/日を抽出
          const tabMatch = firstTabDate.match(/^(\d+)\/(\d+)/);
          let goForward = true;
          if (tabMatch) {
            const tabMonth = parseInt(tabMatch[1]);
            const tabDay = parseInt(tabMatch[2]);
            const tabTs = new Date(ty, tabMonth - 1, tabDay).getTime();
            goForward = targetTs > tabTs;
          }

          // #next（次の週）または #prev（前の週）をクリック
          const navSelector = goForward ? '#next' : '#prev';
          try {
            await popup.click(navSelector);
            await popup.waitForTimeout(3000);
          } catch {
            console.log(`レセプトワークス: ${targetLabel} へのナビゲーション失敗`);
            break;
          }
        }
        if (!clicked) {
          console.log(`レセプトワークス: ${targetLabel} が見つかりませんでした`);
          return [];
        }
      }

      const rawData = await popup.evaluate(EXTRACT_SCRIPT) as {
        staffName: string;
        customerName: string;
        startTime: string;
        endTime: string;
        services: string;
        type: string;
        externalId: string;
      }[];

      const seen = new Set<string>();
      const appointments: Appointment[] = [];

      // デバッグ: 全スタッフ名と予約数を出力
      const staffCounts: Record<string, number> = {};
      rawData.forEach(item => {
        staffCounts[item.staffName || '(空)'] = (staffCounts[item.staffName || '(空)'] || 0) + 1;
      });
      console.log(`  DOM抽出: ${rawData.length}件 スタッフ別:`, staffCounts);

      rawData.forEach((item) => {
        // 佐藤 洋のデータのみ取得
        if (!item.staffName.includes('佐藤') || !item.staffName.includes('洋')) return;

        const key = `${item.staffName}-${item.customerName}-${item.startTime}-${item.services}`;
        if (seen.has(key)) return;
        seen.add(key);

        if (item.customerName === 'ゲスト' && item.type === 'task') return;

        appointments.push({
          source: 'sekkotwin',
          external_id: `rw-${date}-${item.externalId || appointments.length}`,
          date: date,
          start_time: item.startTime || '00:00',
          end_time: item.endTime || undefined,
          title: item.services || (item.type === 'task' ? '事務作業' : '施術'),
          customer_name: item.customerName || undefined,
          staff_name: item.staffName || undefined,
          service_types: item.services ? item.services.split(' / ') : [],
          appointment_type: item.type,
          status: 'confirmed',
          color: '#22C55E',
        });
      });

      return appointments;
    }

    // 日付順にソート（タブナビゲーションの移動距離を最小化）
    const sortedDates = [...dates].sort();
    let totalCount = 0;

    for (const targetDate of sortedDates) {
      const appointments = await scrapePopupDate(targetDate);

      console.log(`レセプトワークス: ${targetDate} → ${appointments.length} 件`);
      appointments.forEach(a => {
        console.log(`  ${a.start_time}-${a.end_time ?? '??'} ${a.customer_name ?? a.title} (${a.staff_name})`);
      });

      await replaceAppointments('sekkotwin', targetDate, appointments);
      totalCount += appointments.length;
    }

    await logSync('sekkotwin', 'success', totalCount);
    console.log(`レセプトワークス: 同期完了 (${sortedDates.length}日, ${totalCount}件)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('レセプトワークス: エラー', message);
    await logSync('sekkotwin', 'error', 0, message);
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.includes('reworks')) {
  const dateArg = process.argv[2];
  scrapeReworks(dateArg).then(() => process.exit(0));
}
