'use client';

import { SOURCE_CONFIG, type AppointmentSource } from '../lib/supabase';

export function SourceBadge({ source }: { source: AppointmentSource }) {
  const config = SOURCE_CONFIG[source];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
