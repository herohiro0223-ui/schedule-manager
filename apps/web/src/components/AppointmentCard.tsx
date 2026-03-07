'use client';

import { SOURCE_CONFIG, type Appointment } from '../lib/supabase';
import { SourceBadge } from './SourceBadge';

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const config = SOURCE_CONFIG[appointment.source];

  const formatTime = (time: string) => time.substring(0, 5);

  return (
    <div
      className="rounded-lg p-3 mb-2 border-l-4 transition-all hover:shadow-md"
      style={{
        borderLeftColor: config.color,
        backgroundColor: `${config.color}08`,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {formatTime(appointment.start_time)}
            {appointment.end_time && ` - ${formatTime(appointment.end_time)}`}
          </span>
          <SourceBadge source={appointment.source} />
        </div>
        {appointment.status === 'cancelled' && (
          <span className="text-xs text-red-500 font-medium">キャンセル</span>
        )}
      </div>

      <h3 className="font-medium text-gray-900 text-sm leading-tight">
        {appointment.title}
      </h3>

      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
        {appointment.customer_name && (
          <span>{appointment.customer_name} 様</span>
        )}
        {appointment.staff_name && (
          <span>担当: {appointment.staff_name}</span>
        )}
      </div>

      {appointment.service_types && appointment.service_types.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {appointment.service_types.map((service, i) => (
            <span
              key={i}
              className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600"
            >
              {service}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
