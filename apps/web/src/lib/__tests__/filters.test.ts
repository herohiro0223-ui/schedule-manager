import { describe, it, expect } from 'vitest';
import { filterByStaff } from '../filters';
import type { Appointment } from '../supabase';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: '1',
    source: 'harilabo',
    date: '2026-03-09',
    start_time: '10:00:00',
    title: 'テスト予約',
    read: false,
    created_at: '2026-03-09T00:00:00',
    ...overrides,
  } as Appointment;
}

describe('filterByStaff', () => {
  it('keeps personal appointments regardless of staff', () => {
    const apts = [makeAppointment({ source: 'personal', staff_name: '田中太郎' })];
    expect(filterByStaff(apts)).toHaveLength(1);
  });

  it('keeps icloud appointments regardless of staff', () => {
    const apts = [makeAppointment({ source: 'icloud', staff_name: undefined })];
    expect(filterByStaff(apts)).toHaveLength(1);
  });

  it('keeps harilabo appointments for 佐藤洋', () => {
    const apts = [makeAppointment({ source: 'harilabo', staff_name: '佐藤洋' })];
    expect(filterByStaff(apts)).toHaveLength(1);
  });

  it('filters out harilabo appointments for other staff', () => {
    const apts = [makeAppointment({ source: 'harilabo', staff_name: '田中太郎' })];
    expect(filterByStaff(apts)).toHaveLength(0);
  });

  it('keeps sekkotwin appointments for 佐藤洋', () => {
    const apts = [makeAppointment({ source: 'sekkotwin', staff_name: '佐藤洋先生' })];
    expect(filterByStaff(apts)).toHaveLength(1);
  });

  it('filters out sekkotwin appointments for other staff', () => {
    const apts = [makeAppointment({ source: 'sekkotwin', staff_name: '佐藤太郎' })];
    expect(filterByStaff(apts)).toHaveLength(0);
  });
});
