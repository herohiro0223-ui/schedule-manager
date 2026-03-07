'use client';

import { SOURCE_CONFIG, type Appointment } from '../lib/supabase';

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 8;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getTopOffset(time: string): number {
  const minutes = timeToMinutes(time);
  const startMinutes = START_HOUR * 60;
  return ((minutes - startMinutes) / 60) * HOUR_HEIGHT;
}

function getHeight(start: string, end?: string): number {
  if (!end) return HOUR_HEIGHT; // デフォルト1時間
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  return Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24);
}

export function Timeline({ appointments }: { appointments: Appointment[] }) {
  const totalHeight = HOURS.length * HOUR_HEIGHT;

  // 現在時刻のライン
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;

  return (
    <div className="relative" style={{ height: totalHeight + 20 }}>
      {/* 時間軸 */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-gray-100"
          style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
        >
          <span className="absolute -top-2.5 left-0 text-[10px] text-gray-400 w-10 text-right pr-1">
            {hour}:00
          </span>
        </div>
      ))}

      {/* 現在時刻ライン */}
      {showNowLine && (
        <div
          className="absolute left-10 right-0 h-0.5 bg-red-400 z-20"
          style={{ top: nowTop }}
        >
          <div className="absolute -left-1.5 -top-1 w-3 h-3 rounded-full bg-red-400" />
        </div>
      )}

      {/* 予約ブロック */}
      <div className="ml-12 relative">
        {appointments.map((apt) => {
          const config = SOURCE_CONFIG[apt.source];
          const top = getTopOffset(apt.start_time);
          const height = getHeight(apt.start_time, apt.end_time);

          return (
            <div
              key={apt.id}
              className="absolute left-0 right-2 rounded-md px-2 py-1 overflow-hidden border-l-3 cursor-pointer transition-all hover:shadow-md hover:z-10"
              style={{
                top,
                height,
                borderLeftColor: config.color,
                borderLeftWidth: 3,
                backgroundColor: `${config.color}15`,
                zIndex: 1,
              }}
            >
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium" style={{ color: config.color }}>
                  {apt.start_time.substring(0, 5)}
                </span>
                <span className="text-[10px]" style={{ color: config.color }}>
                  {config.label}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-800 truncate leading-tight">
                {apt.title}
              </p>
              {apt.customer_name && height > 36 && (
                <p className="text-[10px] text-gray-500 truncate">
                  {apt.customer_name} 様
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
