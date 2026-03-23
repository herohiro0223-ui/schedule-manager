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
    <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-gray-100 text-xs">
      <span className="text-gray-400 font-medium flex-shrink-0">同期</span>
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar flex-1">
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
            <span key={log.source} className="flex items-center gap-1 whitespace-nowrap">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isError ? 'bg-red-400' : 'bg-emerald-400'}`}
              />
              <span className="text-gray-500 font-medium">{config?.label ?? log.source}</span>
              <span className="text-gray-300 tabular-nums">{time}</span>
            </span>
          );
        })}
      </div>
      <button
        onClick={requestSync}
        disabled={syncing}
        className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all flex-shrink-0 text-[11px] font-medium ${
          syncing
            ? 'bg-gray-100 text-gray-400'
            : 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95'
        }`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={syncing ? 'animate-spin' : ''}
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        {syncing ? '同期中' : '同期'}
      </button>
    </div>
  );
}
