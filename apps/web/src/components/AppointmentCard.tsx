'use client';

import { SOURCE_CONFIG, type Appointment } from '../lib/supabase';
import { SourceBadge } from './SourceBadge';
import { formatTime } from '../lib/date';

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const config = SOURCE_CONFIG[appointment.source];
  const isCancelled = appointment.status === 'cancelled';

  return (
    <div
      className={`rounded-xl p-3.5 border-l-[3px] transition-all ${
        isCancelled ? 'opacity-50' : ''
      }`}
      style={{
        borderLeftColor: config.color,
        backgroundColor: `${config.color}06`,
      }}
    >
      {/* 上段: 時刻 + ソース + キャンセル */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 tabular-nums">
            {formatTime(appointment.start_time)}
            {appointment.end_time && (
              <span className="text-gray-400 font-normal"> - {formatTime(appointment.end_time)}</span>
            )}
          </span>
          <SourceBadge source={appointment.source} />
        </div>
        {isCancelled && (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
            キャンセル
          </span>
        )}
      </div>

      {/* タイトル */}
      <h3 className="font-semibold text-gray-900 text-[13px] leading-snug">
        {appointment.title}
      </h3>

      {/* 顧客・担当 */}
      {(appointment.customer_name || appointment.staff_name) && (
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
          {appointment.customer_name && (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {appointment.customer_name} 様
            </span>
          )}
          {appointment.staff_name && (
            <span className="text-gray-400">
              担当: {appointment.staff_name}
            </span>
          )}
        </div>
      )}

      {/* サービス */}
      {appointment.service_types && appointment.service_types.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {appointment.service_types.map((service, i) => (
            <span
              key={i}
              className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500"
            >
              {service}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
