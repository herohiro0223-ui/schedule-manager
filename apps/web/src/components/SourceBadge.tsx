'use client';

import { SOURCE_CONFIG, type AppointmentSource } from '../lib/supabase';

export function SourceBadge({ source }: { source: AppointmentSource }) {
  const config = SOURCE_CONFIG[source];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase"
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
