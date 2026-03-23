import type { Appointment } from './supabase';

/** ハリラボ・接骨院は佐藤洋の担当分のみ。personal/icloud は全件通す */
export function filterByStaff(appointments: Appointment[]): Appointment[] {
  return appointments.filter((a) => {
    if (a.source === 'personal' || a.source === 'icloud') return true;
    return a.staff_name?.includes('佐藤') && a.staff_name?.includes('洋');
  });
}
