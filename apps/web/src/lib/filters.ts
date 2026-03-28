import type { Appointment } from './supabase';

/** harilabo/sekkotwin は佐藤洋の担当分のみ表示。personal/icloud は全件通す */
export function filterByStaff(appointments: Appointment[]): Appointment[] {
  return appointments.filter((a) => {
    if (a.source === 'personal' || a.source === 'icloud') return true;
    return a.staff_name?.includes('佐藤') && a.staff_name?.includes('洋');
  });
}
