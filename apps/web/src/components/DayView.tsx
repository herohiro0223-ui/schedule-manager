'use client';

import { useState } from 'react';
import { useAppointments } from '../hooks/useAppointments';
import { AppointmentCard } from './AppointmentCard';
import { Timeline } from './Timeline';
import { SyncStatus } from './SyncStatus';
import { TaskList } from './TaskList';
import { type AppointmentSource } from '../lib/supabase';

interface DayViewProps {
  date: string;
}

type ViewMode = 'list' | 'timeline';

export function DayView({ date }: DayViewProps) {
  const { appointments, loading, error } = useAppointments(date);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterSource, setFilterSource] = useState<AppointmentSource | 'all'>('all');

  const filtered =
    filterSource === 'all'
      ? appointments
      : appointments.filter((a) => a.source === filterSource);

  const dateObj = new Date(date + 'T00:00:00');
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isToday = date === todayStr;

  return (
    <div>
      {/* 日付ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {dateObj.getMonth() + 1}/{dateObj.getDate()}
            <span className="text-gray-400 font-normal ml-1">({weekday})</span>
            {isToday && (
              <span className="ml-2 text-xs bg-gray-800 text-white px-2 py-0.5 rounded-full">
                今日
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} 件の予定
          </p>
        </div>

        {/* ビュー切替 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            リスト
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              viewMode === 'timeline'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            タイムライン
          </button>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {(['all', 'harilabo', 'sekkotwin', 'personal', 'icloud'] as const).map((source) => {
          const label =
            source === 'all'
              ? 'すべて'
              : source === 'harilabo'
              ? 'ハリラボ'
              : source === 'sekkotwin'
              ? '接骨院'
              : source === 'icloud'
              ? 'iCloud'
              : '個人';

          const count =
            source === 'all'
              ? appointments.length
              : appointments.filter((a) => a.source === source).length;

          return (
            <button
              key={source}
              onClick={() => setFilterSource(source)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                filterSource === source
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
              <span
                className={`text-[10px] ${
                  filterSource === source ? 'text-gray-300' : 'text-gray-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* コンテンツ */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">
          <p>データの取得に失敗しました</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">
            {String.fromCodePoint(0x1F4CB)}
          </p>
          <p className="text-sm">予定はありません</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1">
          {filtered.map((apt) => (
            <AppointmentCard key={apt.id} appointment={apt} />
          ))}
        </div>
      ) : (
        <Timeline appointments={filtered} />
      )}

      {/* タスク */}
      <TaskList date={date} />

      {/* 同期状態 */}
      <div className="mt-6">
        <SyncStatus />
      </div>
    </div>
  );
}
