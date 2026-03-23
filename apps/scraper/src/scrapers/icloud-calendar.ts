/**
 * iCloud カレンダー同期
 *
 * CalDAV (tsdav) を使用して iCloud カレンダーの全イベントを取得し、
 * Supabase に保存する。
 */

import 'dotenv/config';
import { DAVClient } from 'tsdav';
import {
  type Appointment,
  replaceAllBySource,
  logSync,
} from '../lib/supabase.js';

/** 同期対象の日付範囲を計算（過去1ヶ月〜未来2ヶ月） */
function getSyncDateRange(): { fromStr: string; toStr: string } {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const from = new Date(jstNow);
  from.setUTCMonth(from.getUTCMonth() - 1);
  const to = new Date(jstNow);
  to.setUTCMonth(to.getUTCMonth() + 2);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { fromStr: fmt(from), toStr: fmt(to) };
}

/** iCal VEVENT からフィールドを抽出（過去1ヶ月〜未来2ヶ月） */
function parseVEvent(ical: string): {
  uid: string;
  summary: string;
  date: string;
  startTime: string;
  endTime: string | undefined;
  description: string | undefined;
  location: string | undefined;
  isAllDay: boolean;
} | null {
  const veventMatch = ical.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
  if (!veventMatch) return null;
  const block = veventMatch[0];

  const get = (key: string): string | undefined => {
    const re = new RegExp(`^${key}[;:](.*)$`, 'm');
    const m = block.match(re);
    return m ? m[1].trim() : undefined;
  };

  const uid = get('UID') ?? '';
  const summary = get('SUMMARY') ?? '（タイトルなし）';
  const description = get('DESCRIPTION')?.replace(/\\n/g, '\n').replace(/\\,/g, ',');
  const location = get('LOCATION')?.replace(/\\,/g, ',');

  const dtStartRaw = get('DTSTART') ?? '';
  const dtEndRaw = get('DTEND') ?? '';

  const isAllDay = dtStartRaw.includes('VALUE=DATE') || /^\d{8}$/.test(dtStartRaw);

  let date = '';
  let startTime = '00:00';
  let endTime: string | undefined;

  if (isAllDay) {
    const dateMatch = dtStartRaw.match(/(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) return null;
    date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  } else {
    const parseTime = (raw: string): { date: string; time: string } | null => {
      const tzMatch = raw.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
      if (!tzMatch) return null;

      const [, y, mo, d, h, mi] = tzMatch;
      const isUTC = raw.endsWith('Z');

      if (isUTC) {
        const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
        const jst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
        const jstDate = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;
        const jstTime = `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`;
        return { date: jstDate, time: jstTime };
      }

      return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
    };

    const start = parseTime(dtStartRaw);
    const end = parseTime(dtEndRaw);

    if (!start) return null;

    date = start.date;
    startTime = start.time;
    endTime = end?.time;
  }

  return { uid, summary, date, startTime, endTime, description, location, isAllDay };
}

export async function syncICloudCalendar(): Promise<void> {
  const appleId = process.env.APPLE_ID ?? '';
  const appPassword = process.env.APPLE_APP_PASSWORD ?? '';

  if (!appleId || !appPassword) {
    throw new Error('APPLE_ID / APPLE_APP_PASSWORD が未設定');
  }

  try {
    await logSync('icloud', 'running');

    console.log('iCloud Calendar: 全イベントを取得中...');

    const client = new DAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: {
        username: appleId,
        password: appPassword,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    await client.login();

    const calendars = await client.fetchCalendars();
    // リマインダーを除外
    const eventCalendars = calendars.filter(
      c => !c.url?.includes('/tasks')
    );
    console.log(`iCloud Calendar: ${eventCalendars.length} 個のカレンダーを同期`);

    const appointments: Appointment[] = [];
    const { fromStr, toStr } = getSyncDateRange();

    for (const calendar of eventCalendars) {
      const displayName = calendar.displayName ?? '（名前なし）';

      // 全イベントを取得（CalDAVレベルではフィルタなし）
      const objects = await client.fetchCalendarObjects({
        calendar,
      });

      let count = 0;
      for (const obj of objects) {
        if (!obj.data) continue;

        const parsed = parseVEvent(obj.data);
        if (!parsed) continue;

        // 同期範囲外は除外（過去1ヶ月〜未来2ヶ月）
        if (parsed.date < fromStr || parsed.date > toStr) continue;

        appointments.push({
          source: 'icloud',
          external_id: `ic-${parsed.uid}`,
          date: parsed.date,
          start_time: parsed.startTime,
          end_time: parsed.endTime,
          title: parsed.summary,
          customer_name: undefined,
          staff_name: undefined,
          service_types: [],
          appointment_type: parsed.isAllDay ? 'all_day' : 'event',
          status: 'confirmed',
          color: '#F97316',
          notes: [parsed.location, parsed.description].filter(Boolean).join('\n') || undefined,
        });
        count++;
      }

      if (count > 0) {
        console.log(`  ${displayName}: ${count} 件`);
      }
    }

    console.log(`iCloud Calendar: 合計 ${appointments.length} 件のイベントを同期 (範囲: ${fromStr}〜${toStr})`);

    if (appointments.length === 0 && eventCalendars.length > 0) {
      console.warn('iCloud Calendar: カレンダーは存在するがイベントが0件。既存データを保持します。');
      await logSync('icloud', 'success', 0);
      return;
    }

    await replaceAllBySource('icloud', appointments, fromStr);
    await logSync('icloud', 'success', appointments.length);

    console.log('iCloud Calendar: 同期完了');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('iCloud Calendar: エラー', message);
    await logSync('icloud', 'error', 0, message);
  }
}

// 直接実行時
if (process.argv[1]?.includes('icloud-calendar')) {
  syncICloudCalendar().then(() => process.exit(0));
}
