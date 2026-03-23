'use client';

import { useRef, useEffect } from 'react';
import { useSearch } from '../hooks/useSearch';
import { SOURCE_CONFIG, type Appointment } from '../lib/supabase';
import { todayStr, formatTime, formatDateShort } from '../lib/date';

interface SearchPanelProps {
  onNavigateToDate: (date: string) => void;
  onClose: () => void;
}

export function SearchPanel({ onNavigateToDate, onClose }: SearchPanelProps) {
  const { results, loading, query, search, clear } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInput = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (apt: Appointment) => {
    clear();
    onNavigateToDate(apt.date);
    onClose();
  };

  const today = todayStr();

  // 未来（今日含む）と過去に分けてグループ化
  const futureGrouped: Record<string, Appointment[]> = {};
  const pastGrouped: Record<string, Appointment[]> = {};

  for (const apt of results) {
    if (apt.date >= today) {
      (futureGrouped[apt.date] ??= []).push(apt);
    } else {
      (pastGrouped[apt.date] ??= []).push(apt);
    }
  }

  // 未来: 直近→ 遠い日付
  const futureDates = Object.keys(futureGrouped).sort((a, b) => a.localeCompare(b));
  // 過去: 直近→ 遠い日付
  const pastDates = Object.keys(pastGrouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="bg-white border-b border-gray-100 shadow-sm">
      {/* 検索入力 */}
      <div className="px-4 py-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="お客様名で検索..."
            className="w-full pl-10 pr-10 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:bg-gray-100 transition-all"
            onChange={(e) => handleInput(e.target.value)}
          />
          <button
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 検索結果 */}
      {query.trim() && (
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-3 animate-fade-in">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">
                「{query}」に一致する予約はありません
              </p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-gray-300 font-medium mb-3">{results.length}件の結果</p>

              {/* 未来（今日以降） */}
              {futureDates.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">これから</span>
                    <span className="text-[10px] text-gray-300">{futureDates.reduce((n, d) => n + futureGrouped[d].length, 0)}件</span>
                  </div>
                  {futureDates.map((date) => (
                    <DateGroup key={date} date={date} apts={futureGrouped[date]} onSelect={handleSelect} />
                  ))}
                </div>
              )}

              {/* 過去 */}
              {pastDates.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">過去</span>
                    <span className="text-[10px] text-gray-300">{pastDates.reduce((n, d) => n + pastGrouped[d].length, 0)}件</span>
                  </div>
                  {pastDates.map((date) => (
                    <DateGroup key={date} date={date} apts={pastGrouped[date]} onSelect={handleSelect} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DateGroup({ date, apts, onSelect }: {
  date: string;
  apts: Appointment[];
  onSelect: (apt: Appointment) => void;
}) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold text-gray-400 mb-1 sticky top-0 bg-white py-1">
        {formatDateShort(date)}
      </div>
      {apts.map((apt) => {
        const config = SOURCE_CONFIG[apt.source];
        return (
          <button
            key={apt.id}
            onClick={() => onSelect(apt)}
            className="w-full text-left rounded-xl p-3 mb-1 hover:bg-gray-50 active:bg-gray-100 transition-all border-l-[3px]"
            style={{
              borderLeftColor: config.color,
              backgroundColor: `${config.color}04`,
            }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-gray-600 tabular-nums">
                {formatTime(apt.start_time)}
                {apt.end_time && ` - ${formatTime(apt.end_time)}`}
              </span>
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: `${config.color}15`, color: config.color }}
              >
                {config.label}
              </span>
            </div>
            <div className="text-[13px] font-semibold text-gray-800">{apt.title}</div>
            {apt.customer_name && (
              <div className="text-xs text-gray-400 mt-0.5">
                {apt.customer_name} 様
                {apt.staff_name && <span className="ml-2 text-gray-300">担当: {apt.staff_name}</span>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
