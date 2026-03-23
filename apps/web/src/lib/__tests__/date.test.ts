import { describe, it, expect } from 'vitest';
import { todayStr, shiftDate, formatTime, getWeekday, formatDateShort, WEEKDAYS_JA } from '../date';

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shiftDate', () => {
  it('shifts forward by 1 day', () => {
    expect(shiftDate('2026-03-09', 1)).toBe('2026-03-10');
  });

  it('shifts backward by 1 day', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles month boundary', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('handles year boundary', () => {
    expect(shiftDate('2025-12-31', 1)).toBe('2026-01-01');
  });
});

describe('formatTime', () => {
  it('truncates HH:MM:SS to HH:MM', () => {
    expect(formatTime('09:30:00')).toBe('09:30');
  });

  it('handles already short time', () => {
    expect(formatTime('14:00')).toBe('14:00');
  });
});

describe('getWeekday', () => {
  it('returns correct weekday for Sunday', () => {
    // 2026-03-08 is Sunday
    expect(getWeekday('2026-03-08')).toBe('日');
  });

  it('returns correct weekday for Monday', () => {
    expect(getWeekday('2026-03-09')).toBe('月');
  });
});

describe('formatDateShort', () => {
  it('formats date as M/D(曜)', () => {
    expect(formatDateShort('2026-03-09')).toBe('3/9(月)');
  });

  it('formats January date', () => {
    expect(formatDateShort('2026-01-01')).toBe('1/1(木)');
  });
});

describe('WEEKDAYS_JA', () => {
  it('has 7 entries', () => {
    expect(WEEKDAYS_JA).toHaveLength(7);
  });

  it('starts with 日 and ends with 土', () => {
    expect(WEEKDAYS_JA[0]).toBe('日');
    expect(WEEKDAYS_JA[6]).toBe('土');
  });
});
