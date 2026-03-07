'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, type Appointment, type SyncLog } from '../lib/supabase';

export function useAppointments(date: string) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      // ハリラボ・接骨院は佐藤洋の担当分のみ表示
      const filtered = (data ?? []).filter((a) => {
        if (a.source === 'personal' || a.source === 'icloud') return true;
        return a.staff_name?.includes('佐藤') && a.staff_name?.includes('洋');
      });
      setAppointments(filtered);
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchAppointments();

    // リアルタイム更新の購読
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `date=eq.${date}`,
        },
        () => {
          fetchAppointments();
        }
      )
      .subscribe();

    // アプリを開いた時・バックグラウンド復帰時に再取得
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAppointments();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [date, fetchAppointments]);

  return { appointments, loading, error, refetch: fetchAppointments };
}

export function useSyncStatus() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('latest_sync')
        .select('*');
      if (data) setSyncLogs(data);
    }
    fetch();

    const interval = setInterval(fetch, 60000); // 1分ごと
    return () => clearInterval(interval);
  }, []);

  return syncLogs;
}

export function useMonthAppointments(year: number, month: number) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data } = await supabase
      .from('appointments')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true });

    const filtered = (data ?? []).filter((a) => {
      if (a.source === 'personal' || a.source === 'icloud') return true;
      return a.staff_name?.includes('佐藤') && a.staff_name?.includes('洋');
    });
    setAppointments(filtered);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    fetchMonth();

    // アプリ復帰時に再取得
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchMonth();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchMonth]);

  return { appointments, loading };
}
