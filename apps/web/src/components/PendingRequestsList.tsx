'use client';

import { useAppointmentRequests } from '../hooks/useAppointmentRequests';
import { RequestCard } from './RequestCard';

interface PendingRequestsListProps {
  date: string;
}

export function PendingRequestsList({ date }: PendingRequestsListProps) {
  const { requests, updateStatus, loading } = useAppointmentRequests(date);

  if (loading) return null;

  // pending を上に、registered/cancelled を下に
  const pending = requests.filter(r => r.status === 'pending');
  const done = requests.filter(r => r.status !== 'pending');

  if (requests.length === 0) return null;

  return (
    <div className="mt-5 mb-2">
      {/* セクションヘッダー */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-bold text-gray-800">予約リクエスト</h3>
        {pending.length > 0 && (
          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
            {pending.length}件 未登録
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {pending.map(r => (
          <RequestCard
            key={r.id}
            request={r}
            onMarkRegistered={id => updateStatus(id, 'registered')}
            onCancel={id => updateStatus(id, 'cancelled')}
          />
        ))}
        {done.map(r => (
          <RequestCard
            key={r.id}
            request={r}
            onMarkRegistered={id => updateStatus(id, 'registered')}
            onCancel={id => updateStatus(id, 'cancelled')}
          />
        ))}
      </div>
    </div>
  );
}
