'use client';

import { usePendingRequestCount } from '../hooks/useAppointmentRequests';

interface QuickAddFABProps {
  onClick: () => void;
}

export function QuickAddFAB({ onClick }: QuickAddFABProps) {
  const pendingCount = usePendingRequestCount();

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
      aria-label="予約リクエストを追加"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-[11px] font-bold bg-red-500 text-white rounded-full px-1">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </button>
  );
}
