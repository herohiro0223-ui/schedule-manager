'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, type AppointmentRequest, type RequestStatus } from '../lib/supabase';

export function useAppointmentRequests(date?: string) {
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('appointment_requests')
      .select('*')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) {
      query = query.eq('date', date);
    }

    const { data } = await query;
    setRequests(data ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchRequests();

    const channel = supabase
      .channel('appointment-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointment_requests',
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchRequests();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchRequests]);

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const pendingCount = pendingRequests.length;

  const addRequest = async (request: Omit<AppointmentRequest, 'id' | 'status' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase
      .from('appointment_requests')
      .insert({ ...request, status: 'pending' });
    if (error) throw error;
  };

  const updateStatus = async (id: string, status: RequestStatus) => {
    const { error } = await supabase
      .from('appointment_requests')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  };

  const deleteRequest = async (id: string) => {
    const { error } = await supabase
      .from('appointment_requests')
      .delete()
      .eq('id', id);
    if (error) throw error;
  };

  return {
    requests,
    pendingRequests,
    pendingCount,
    loading,
    addRequest,
    updateStatus,
    deleteRequest,
    refetch: fetchRequests,
  };
}

// 全日付のpending件数を取得するフック
export function usePendingRequestCount() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const { count: c } = await supabase
      .from('appointment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel('appointment-requests-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointment_requests',
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
