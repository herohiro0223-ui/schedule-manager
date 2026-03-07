'use client';

import { useState } from 'react';
import { useSyncStatus } from '../hooks/useAppointments';
import { supabase, SOURCE_CONFIG, type AppointmentSource } from '../lib/supabase';

export function SyncStatus() {
  const syncLogs = useSyncStatus();
  const [syncing, setSyncing] = useState(false);

  const requestSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await supabase.from('sync_requests').insert({ status: 'pending' });
      // 完了を待つ（最大90秒）
      const start = Date.now();
      const check = async (): Promise<void> => {
        if (Date.now() - start > 90000) {
          setSyncing(false);
          return;
        }
        const { data } = await supabase
          .from('sync_requests')
          .select('status')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.status === 'completed' || data?.status === 'error') {
          setSyncing(false);
        } else {
          await new Promise(r => setTimeout(r, 3000));
          return check();
        }
      };
      await check();
    } catch {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg text-xs">
      <span className="text-gray-400 font-medium">同期:</span>
      {syncLogs.map((log) => {
        const config = SOURCE_CONFIG[log.source as AppointmentSource];
        const time = log.completed_at
          ? new Date(log.completed_at).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '---';
        const isError = log.status === 'error';

        return (
          <span key={log.source} className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-400' : 'bg-green-400'}`}
            />
            <span style={{ color: config?.color }}>{config?.label ?? log.source}</span>
            <span className="text-gray-400">{time}</span>
          </span>
        );
      })}
      <button
        onClick={requestSync}
        disabled={syncing}
        className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
          syncing
            ? 'bg-gray-200 text-gray-400'
            : 'bg-gray-800 text-white hover:bg-gray-700 active:scale-95'
        }`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={syncing ? 'animate-spin' : ''}
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        {syncing ? '同期中...' : '同期'}
      </button>
    </div>
  );
}
