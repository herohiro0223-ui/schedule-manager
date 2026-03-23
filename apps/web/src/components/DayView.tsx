'use client';

import { useState } from 'react';
import { useAppointments } from '../hooks/useAppointments';
import { AppointmentCard } from './AppointmentCard';
import { Timeline } from './Timeline';
import { SyncStatus } from './SyncStatus';
import { TaskList } from './TaskList';
import { SOURCE_CONFIG, type AppointmentSource } from '../lib/supabase';
import { todayStr } from '../lib/date';
import { Spinner } from './ui/Spinner';

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

  const isToday = date === todayStr();

  const filters = [
    { key: 'all' as const, label: 'すべて' },
    { key: 'harilabo' as const, label: 'ハリラボ' },
    { key: 'sekkotwin' as const, label: '接骨院' },
    { key: 'personal' as const, label: '個人' },
    { key: 'icloud' as const, label: 'iCloud' },
  ];

  return (
    <div className="animate-fade-in">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400">
            {filtered.length} 件の予定
          </p>
        </div>

        {/* ビュー切替 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            リスト
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              viewMode === 'timeline'
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            タイムライン
          </button>
        </div>
      </div>

      {/* ソースフィルター */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {filters.map(({ key, label }) => {
          const count =
            key === 'all'
              ? appointments.length
              : appointments.filter((a) => a.source === key).length;

          const isActive = filterSource === key;
          const sourceColor = key !== 'all' ? SOURCE_CONFIG[key].color : undefined;

          return (
            <button
              key={key}
              onClick={() => setFilterSource(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: sourceColor ?? '#1f2937',
                    }
                  : undefined
              }
            >
              {!isActive && sourceColor && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sourceColor }}
                />
              )}
              {label}
              <span
                className={`text-[10px] ${
                  isActive ? 'text-white/70' : 'text-gray-300'
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
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 font-medium">データの取得に失敗しました</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-400">予定はありません</p>
          <p className="text-xs text-gray-300 mt-1">
            {isToday ? '今日はフリーです' : 'この日の予定はまだありません'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-2">
          {filtered.map((apt, i) => (
            <div key={apt.id} className="animate-slide-up" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
              <AppointmentCard appointment={apt} />
            </div>
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
