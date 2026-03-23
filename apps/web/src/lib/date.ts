export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** YYYY-MM-DD 形式で今日の日付を返す */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 指定日付を delta 日分シフトした YYYY-MM-DD を返す */
export function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "HH:MM:SS" → "HH:MM" */
export function formatTime(time: string): string {
  return time.substring(0, 5);
}

/** YYYY-MM-DD → 曜日（日本語） */
export function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return WEEKDAYS_JA[d.getDay()];
}

/** YYYY-MM-DD → "M/D(曜)" */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS_JA[d.getDay()]})`;
}
