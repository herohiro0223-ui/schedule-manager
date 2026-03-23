'use client';

import { useState } from 'react';
import { useMonthAppointments } from '../hooks/useAppointments';
import { SOURCE_CONFIG, type AppointmentSource } from '../lib/supabase';
import { todayStr, WEEKDAYS_JA } from '../lib/date';

interface CalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function Calendar({ selectedDate, onSelectDate }: CalendarProps) {
  const selected = new Date(selectedDate + 'T00:00:00');
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth() + 1);

  const { appointments } = useMonthAppointments(year, month);

  // 月の日付グリッドを生成
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const todayDate = todayStr();

  // 各日のソースごとのドットと件数
  const dayInfo = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayAppts = appointments.filter((a) => a.date === dateStr);
    const sources = [...new Set(dayAppts.map((a) => a.source))];
    return { sources, count: dayAppts.length };
  };

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-scale-in">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 active:scale-90 transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-base font-bold text-gray-800">
          {year}年 {month}月
        </h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 active:scale-90 transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS_JA.map((wd, i) => (
          <div
            key={wd}
            className={`text-center text-[10px] font-semibold py-1 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-300'
            }`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayDate;
          const { sources: dots, count } = dayInfo(day);
          const dayOfWeek = new Date(year, month - 1, day).getDay();

          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all min-h-[44px]
                ${isSelected ? 'bg-gray-900 text-white shadow-md shadow-gray-900/20' : 'hover:bg-gray-50 active:bg-gray-100'}
                ${isToday && !isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : ''}
              `}
            >
              <span
                className={`text-xs font-medium ${
                  isSelected
                    ? 'text-white'
                    : isToday
                    ? 'text-blue-600 font-bold'
                    : dayOfWeek === 0
                    ? 'text-red-400'
                    : dayOfWeek === 6
                    ? 'text-blue-400'
                    : 'text-gray-700'
                }`}
              >
                {day}
              </span>
              {/* ソースドット + 件数 */}
              {dots.length > 0 && (
                <div className="flex flex-col items-center">
                  <div className="flex gap-0.5 mt-0.5">
                    {dots.map((source) => (
                      <span
                        key={source}
                        className="w-1 h-1 rounded-full"
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(255,255,255,0.7)'
                            : SOURCE_CONFIG[source as AppointmentSource].color,
                        }}
                      />
                    ))}
                  </div>
                  <span className={`text-[7px] leading-none mt-0.5 ${isSelected ? 'text-gray-400' : 'text-gray-300'}`}>
                    {count}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-gray-50">
        {(Object.entries(SOURCE_CONFIG) as [AppointmentSource, typeof SOURCE_CONFIG[AppointmentSource]][]).map(
          ([key, config]) => (
            <span key={key} className="flex items-center gap-1 text-[10px] text-gray-400">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              {config.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}
