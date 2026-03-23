/**
 * お客様かな辞書 自動同期
 *
 * SALON BOARD / レセプトワークス 両方の「お客様管理」ページから
 * お客様名とフリガナを取得し、customer_kana テーブルに自動登録する。
 *
 * 新規のお客様が来るたびに辞書が自動的に更新される。
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase } from '../lib/supabase.js';
import { saveSession } from '../lib/browser.js';

const SALON_LOGIN_URL = 'https://salonboard.com/login/';
const SALON_CUSTOMER_URL = 'https://salonboard.com/KLP/customer/customerList/';
const REWORKS_URL = process.env.REWORKS_URL ?? 'https://satokotsu.re-works.net';

// カタカナ → ひらがな変換
function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  ).replace(/\s+/g, ' ').trim();
}

// ========================
// SALON BOARD
// ========================
const SALON_EXTRACT_SCRIPT = `
(() => {
  var results = [];
  var rows = document.querySelectorAll('table tbody tr');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;

    var name = '';
    var kana = '';
    var nameCell = cells[0];
    if (!nameCell) continue;

    var nameLink = nameCell.querySelector('a');
    if (nameLink) {
      name = (nameLink.textContent || '').trim().replace(/\\s*様$/, '').trim();
    }

    var kanaEl = nameCell.querySelector('.kana, .furi, .furigana, [class*="kana"], [class*="Kana"], small, .sub');
    if (kanaEl) {
      kana = (kanaEl.textContent || '').trim();
    }

    if (!kana && cells.length >= 3) {
      for (var ci = 1; ci < cells.length; ci++) {
        var cellText = (cells[ci].textContent || '').trim();
        if (/^[\\u3040-\\u309F\\u30A0-\\u30FF\\s\\u3000]+$/.test(cellText) && cellText.length > 1) {
          kana = cellText;
          break;
        }
      }
    }

    if (!name) {
      var fullText = (nameCell.textContent || '').trim();
      name = fullText.split('\\n')[0].trim().replace(/\\s*様$/, '').trim();
    }

    if (!kana && nameLink) {
      kana = nameLink.getAttribute('title') || '';
    }

    if (name && name.length > 1 && name.length < 20) {
      results.push({ name: name, kana: kana });
    }
  }
  return results;
})()
`;

async function syncFromSalonBoard(): Promise<{ name: string; kana: string }[]> {
  const browser = await chromium.launch({ headless: false });
  const allCustomers: { name: string; kana: string }[] = [];

  try {
    let context: BrowserContext;
    try {
      const { data } = await supabase
        .from('browser_sessions')
        .select('session_data')
        .eq('service', 'salonboard')
        .single();

      context = data?.session_data
        ? await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: data.session_data as any })
        : await browser.newContext({ viewport: { width: 1280, height: 800 } });
    } catch {
      context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    }

    const page = await context.newPage();
    await page.goto(SALON_CUSTOMER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('login')) {
      console.log('  SALON BOARD: ログイン中...');
      await page.goto(SALON_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(1000);

      const loginId = process.env.SALON_BOARD_ID ?? '';
      const password = process.env.SALON_BOARD_PASSWORD ?? '';
      if (!loginId || !password) throw new Error('SALON_BOARD認証情報が未設定');

      await page.fill('input[name="userId"]', loginId);
      await page.fill('input[name="password"]', password);
      await page.click('a.common-CNCcommon__primaryBtn');
      try { await page.waitForURL('**/KLP/**', { timeout: 60000 }); } catch {
        throw new Error('ログイン失敗');
      }
      await saveSession(context, 'salonboard');
      await page.goto(SALON_CUSTOMER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
    }

    let pageNum = 1;
    let hasNext = true;

    while (hasNext) {
      try {
        await page.waitForSelector('table tbody tr', { timeout: 10000 });
        await page.waitForTimeout(1000);
      } catch { break; }

      const pageData = await page.evaluate(SALON_EXTRACT_SCRIPT) as { name: string; kana: string }[];
      console.log(`  SALON BOARD ページ${pageNum}: ${pageData.length}件`);
      allCustomers.push(...pageData);

      const nextBtn = page.locator('a:has-text("次へ"), .next a, [class*="next"]').first();
      try {
        if (await nextBtn.isVisible({ timeout: 3000 })) {
          await nextBtn.click();
          await page.waitForTimeout(2000);
          pageNum++;
        } else { hasNext = false; }
      } catch { hasNext = false; }

      if (pageNum > 50) break;
    }
  } catch (err) {
    console.error('  SALON BOARD:', err instanceof Error ? err.message : err);
  } finally {
    await browser.close();
  }

  return allCustomers;
}

// ========================
// レセプトワークス
// ========================
const REWORKS_EXTRACT_SCRIPT = `
(() => {
  var results = [];
  var rows = document.querySelectorAll('table tbody tr, .patient-list tr, .list-table tr');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;

    var name = '';
    var kana = '';

    // 名前セル
    var nameCell = cells[0];
    var nameLink = nameCell.querySelector('a');
    if (nameLink) {
      name = (nameLink.textContent || '').trim();
    } else {
      name = (nameCell.textContent || '').trim().split('\\n')[0].trim();
    }

    // フリガナ: 各セルからかな文字列を探す
    for (var ci = 0; ci < cells.length; ci++) {
      var kanaEl = cells[ci].querySelector('[class*="kana"], [class*="yomi"], [class*="Kana"], .furi, small');
      if (kanaEl) {
        kana = (kanaEl.textContent || '').trim();
        break;
      }
      // data属性
      var dk = cells[ci].getAttribute('data-kana') || cells[ci].getAttribute('data-yomi') || '';
      if (dk) { kana = dk; break; }
    }

    // フリガナが見つからない場合、かな文字だけのセルを探す
    if (!kana) {
      for (var ci2 = 1; ci2 < cells.length; ci2++) {
        var ct = (cells[ci2].textContent || '').trim();
        if (/^[\\u3040-\\u309F\\u30A0-\\u30FF\\s\\u3000]+$/.test(ct) && ct.length > 1) {
          kana = ct;
          break;
        }
      }
    }

    if (name && name.length > 1 && name.length < 20) {
      results.push({ name: name, kana: kana });
    }
  }
  return results;
})()
`;

async function syncFromReworks(): Promise<{ name: string; kana: string }[]> {
  const browser = await chromium.launch({ headless: true });
  const allCustomers: { name: string; kana: string }[] = [];

  try {
    let context: BrowserContext;
    try {
      const { data } = await supabase
        .from('browser_sessions')
        .select('session_data')
        .eq('service', 'reworks')
        .single();

      context = data?.session_data
        ? await browser.newContext({ storageState: data.session_data as any, viewport: { width: 1400, height: 900 } })
        : await browser.newContext({ viewport: { width: 1400, height: 900 } });
    } catch {
      context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    }

    const page = await context.newPage();

    // ログイン確認
    await page.goto(`${REWORKS_URL}/master/main.php`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const content = await page.content();

    if (content.length < 100 || !content.includes('satokotsu')) {
      console.log('  レセプトワークス: ログイン中...');
      await page.goto(`${REWORKS_URL}/master/login/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);

      const user = process.env.REWORKS_USER ?? '';
      const password = process.env.REWORKS_PASSWORD ?? '';
      if (!user || !password) throw new Error('REWORKS認証情報が未設定');

      await page.fill('input[name="id"]', user);
      await page.fill('input[name="pass"]', password);
      await page.click('input[type="image"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveSession(context, 'reworks');
    }

    // 患者一覧ページを探す（よくあるURL）
    const patientUrls = [
      `${REWORKS_URL}/master/patient_list.php`,
      `${REWORKS_URL}/master/patient/list/`,
      `${REWORKS_URL}/master/karte_list.php`,
      `${REWORKS_URL}/master/popup_patient_list.php`,
    ];

    let found = false;
    for (const url of patientUrls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        const bodyText = await page.textContent('body') ?? '';
        if (bodyText.length > 200 && !page.url().includes('login')) {
          found = true;
          break;
        }
      } catch { continue; }
    }

    if (!found) {
      // メニューから患者管理ページを探す
      try {
        await page.goto(`${REWORKS_URL}/master/main.php`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const menuLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('a').forEach(a => {
            const text = (a.textContent || '').trim();
            const href = a.getAttribute('href') || '';
            if (text.includes('患者') || text.includes('顧客') || text.includes('カルテ') || text.includes('一覧')) {
              links.push(href + ' | ' + text);
            }
          });
          return links;
        });
        console.log('  レセプトワークス: 患者管理メニュー候補:', menuLinks);
      } catch { /* skip */ }
    }

    if (found) {
      let pageNum = 1;
      let hasNext = true;

      while (hasNext) {
        try {
          await page.waitForSelector('table tbody tr', { timeout: 10000 });
          await page.waitForTimeout(1000);
        } catch { break; }

        const pageData = await page.evaluate(REWORKS_EXTRACT_SCRIPT) as { name: string; kana: string }[];
        console.log(`  レセプトワークス ページ${pageNum}: ${pageData.length}件`);
        allCustomers.push(...pageData);

        const nextBtn = page.locator('a:has-text("次"), .next a, [class*="next"]').first();
        try {
          if (await nextBtn.isVisible({ timeout: 3000 })) {
            await nextBtn.click();
            await page.waitForTimeout(2000);
            pageNum++;
          } else { hasNext = false; }
        } catch { hasNext = false; }

        if (pageNum > 50) break;
      }
    } else {
      console.log('  レセプトワークス: 患者一覧ページが見つかりませんでした');
    }
  } catch (err) {
    console.error('  レセプトワークス:', err instanceof Error ? err.message : err);
  } finally {
    await browser.close();
  }

  return allCustomers;
}

// ========================
// メイン処理
// ========================
export async function syncCustomerKana(): Promise<void> {
  console.log('かな辞書同期: 開始...');

  // 両方から取得
  const [salonData, reworksData] = await Promise.allSettled([
    syncFromSalonBoard(),
    syncFromReworks(),
  ]);

  const allCustomers: { name: string; kana: string }[] = [];
  if (salonData.status === 'fulfilled') allCustomers.push(...salonData.value);
  if (reworksData.status === 'fulfilled') allCustomers.push(...reworksData.value);

  console.log(`かな辞書同期: 合計 ${allCustomers.length}件取得`);

  // フリガナ付きのみ辞書に登録
  const withKana = allCustomers.filter(c => c.name && c.kana && c.kana.length > 0);

  if (withKana.length > 0) {
    // 重複排除（名前をキーに）
    const uniqueMap = new Map<string, string>();
    for (const c of withKana) {
      if (!uniqueMap.has(c.name)) {
        uniqueMap.set(c.name, toHiragana(c.kana));
      }
    }

    const entries = [...uniqueMap.entries()].map(([name, kana]) => ({
      name,
      name_kana: kana,
    }));

    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const { error } = await supabase
        .from('customer_kana')
        .upsert(batch, { onConflict: 'name', ignoreDuplicates: false });
      if (error) {
        console.error(`  upsertエラー: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }
    console.log(`かな辞書同期: ${inserted}件を登録/更新`);
  }

  // 予約データから未登録の顧客を検出
  await detectMissingCustomers();

  console.log('かな辞書同期: 完了');
}

/** 予約にあるが辞書にない顧客を検出 */
async function detectMissingCustomers(): Promise<void> {
  try {
    const { data: appointments } = await supabase
      .from('appointments')
      .select('customer_name')
      .not('customer_name', 'is', null);

    if (!appointments) return;

    const allNames = [...new Set(
      appointments.map(a => a.customer_name as string).filter(Boolean)
    )];

    const { data: existing } = await supabase.from('customer_kana').select('name');
    const existingNames = new Set((existing ?? []).map(e => e.name));
    const missing = allNames.filter(n => !existingNames.has(n) && n !== 'ゲスト');

    if (missing.length > 0) {
      console.log(`かな辞書: 未登録のお客様 ${missing.length}名: ${missing.join(', ')}`);
    }
  } catch { /* skip */ }
}

// 単体実行
if (process.argv[1]?.includes('customer-kana')) {
  syncCustomerKana().then(() => process.exit(0));
}
