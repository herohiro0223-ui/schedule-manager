/**
 * Google Calendar 同期
 *
 * iCal形式の非公開URLからイベントを取得し、Supabase に保存する。
 * OAuth/API不要。GoogleカレンダーのiCal非公開URLのみ必要。
 */

import 'dotenv/config';
import {
  type Appointment,
  replaceAllBySource,
  logSync,
} from '../lib/supabase.js';

/** iCal VEVENT からフィールドを抽出 */
function parseVEvents(ical: string): Appointment[] {
  const appointments: Appointment[] = [];
  const blocks = ical.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];

    const get = (key: string): string | undefined => {
      // 複数行折り返し対応（行頭スペース/タブで継続）
      const re = new RegExp(`^${key}[;:](.*)(?:\\r?\\n[ \\t].*)*`, 'm');
      const m = block.match(re);
      if (!m) return undefined;
      return m[0].replace(new RegExp(`^${key}[;:]`), '').replace(/\r?\n[ \t]/g, '').trim();
    };

    const uid = get('UID') ?? '';
    const summary = get('SUMMARY') ?? '（タイトルなし）';
    const description = get('DESCRIPTION')?.replace(/\\n/g, '\n').replace(/\\,/g, ',');
    const location = get('LOCATION')?.replace(/\\,/g, ',');
    const status = get('STATUS');

    if (status === 'CANCELLED') continue;

    const dtStartRaw = get('DTSTART') ?? '';
    const dtEndRaw = get('DTEND') ?? '';

    const isAllDay = dtStartRaw.includes('VALUE=DATE') || /^\d{8}$/.test(dtStartRaw);

    let date = '';
    let startTime = '00:00';
    let endTime: string | undefined;

    if (isAllDay) {
      const startMatch = dtStartRaw.match(/(\d{4})(\d{2})(\d{2})/);
      if (!startMatch) continue;
      const endMatch = dtEndRaw.match(/(\d{4})(\d{2})(\d{2})/);

      const startDate = new Date(+startMatch[1], +startMatch[2] - 1, +startMatch[3]);
      // DTEND は排他的（その日は含まない）。なければ1日イベント
      const endDate = endMatch
        ? new Date(+endMatch[1], +endMatch[2] - 1, +endMatch[3])
        : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

      // 過去のイベントは除外
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

      // 複数日にまたがる終日イベントは各日にアポイントメントを作成
      for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dayStr < todayStr) continue;

        appointments.push({
          source: 'personal',
          external_id: `gc-${uid}-${dayStr}`,
          date: dayStr,
          start_time: '00:00',
          end_time: undefined,
          title: summary.replace(/\\,/g, ','),
          customer_name: undefined,
          staff_name: undefined,
          service_types: [],
          appointment_type: 'all_day',
          status: 'confirmed',
          color: '#F97316',
          notes: [location, description].filter(Boolean).join('\n') || undefined,
        });
      }
      continue;
    } else {
      const parseTime = (raw: string): { date: string; time: string } | null => {
        const tzMatch = raw.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
        if (!tzMatch) return null;
        const [, y, mo, d, h, mi] = tzMatch;
        const isUTC = raw.endsWith('Z');

        if (isUTC) {
          const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
          const jst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
          return {
            date: `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`,
            time: `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`,
          };
        }
        return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
      };

      const start = parseTime(dtStartRaw);
      const end = parseTime(dtEndRaw);
      if (!start) continue;

      date = start.date;
      startTime = start.time;
      endTime = end?.time;
    }

    // 過去のイベントは除外（今日以降のみ、未来の制限なし）
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

    if (date < todayStr) continue;

    appointments.push({
      source: 'personal',
      external_id: `gc-${uid}`,
      date,
      start_time: startTime,
      end_time: endTime,
      title: summary.replace(/\\,/g, ','),
      customer_name: undefined,
      staff_name: undefined,
      service_types: [],
      appointment_type: isAllDay ? 'all_day' : 'event',
      status: 'confirmed',
      color: '#F97316',
      notes: [location, description].filter(Boolean).join('\n') || undefined,
    });
  }

  return appointments;
}

export async function syncGoogleCalendar(): Promise<void> {
  const icalUrl = process.env.GOOGLE_ICAL_URL ?? '';

  if (!icalUrl) {
    throw new Error('GOOGLE_ICAL_URL が未設定（GoogleカレンダーのiCal非公開URLを設定してください）');
  }

  try {
    await logSync('personal', 'running');
    console.log('Google Calendar: イベントを取得中...');

    const res = await fetch(icalUrl);
    if (!res.ok) {
      throw new Error(`iCal取得失敗: ${res.status} ${res.statusText}`);
    }

    const ical = await res.text();

    // iCalレスポンスの妥当性チェック
    if (!ical.includes('BEGIN:VCALENDAR')) {
      throw new Error('iCalレスポンスが不正です（VCALENDAR が見つかりません）');
    }

    const veventCount = (ical.match(/BEGIN:VEVENT/g) || []).length;
    const appointments = parseVEvents(ical);

    // 同期対象の開始日（今日、JST）
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

    console.log(`Google Calendar: ${appointments.length} 件のイベントを取得 (iCal内VEVENT: ${veventCount}件)`);

    if (appointments.length === 0 && veventCount > 0) {
      console.warn('Google Calendar: VEVENTは存在するがパース結果が0件。既存データを保持します。');
      await logSync('personal', 'success', 0);
      return;
    }

    await replaceAllBySource('personal', appointments, todayStr);
    await logSync('personal', 'success', appointments.length);

    console.log('Google Calendar: 同期完了');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Google Calendar: エラー', message);
    await logSync('personal', 'error', 0, message);
  }
}

// 直接実行時
if (process.argv[1]?.includes('google-calendar')) {
  syncGoogleCalendar().then(() => process.exit(0));
}
