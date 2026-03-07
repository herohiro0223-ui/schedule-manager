import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AppointmentSource = 'harilabo' | 'sekkotwin' | 'personal' | 'icloud';

export interface Appointment {
  id: string;
  source: AppointmentSource;
  external_id?: string;
  date: string;
  start_time: string;
  end_time?: string;
  title: string;
  customer_name?: string;
  staff_name?: string;
  service_types?: string[];
  appointment_type?: string;
  status?: string;
  color?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SyncLog {
  id: string;
  source: AppointmentSource;
  started_at: string;
  completed_at?: string;
  status: string;
  records_synced: number;
  error_message?: string;
}

export interface Task {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  priority: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  source: AppointmentSource;
  date: string;
  start_time: string;
  end_time?: string;
  title: string;
  customer_name?: string;
  staff_name?: string;
  read: boolean;
  created_at: string;
}

export const SOURCE_CONFIG: Record<AppointmentSource, { label: string; color: string; bgColor: string; borderColor: string }> = {
  harilabo: {
    label: 'ハリラボ',
    color: '#3B82F6',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-400',
  },
  sekkotwin: {
    label: '接骨院',
    color: '#22C55E',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-400',
  },
  personal: {
    label: '個人',
    color: '#F97316',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-400',
  },
  icloud: {
    label: 'iCloud',
    color: '#A855F7',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-400',
  },
};
