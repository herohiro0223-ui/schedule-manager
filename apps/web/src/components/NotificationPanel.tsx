'use client';

import { type Notification, SOURCE_CONFIG } from '../lib/supabase';
import { formatDateShort, formatTime } from '../lib/date';

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNavigateToDate: (date: string) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

export function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigateToDate,
}: NotificationPanelProps) {
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleTap = (notif: Notification) => {
    if (!notif.read) {
      onMarkAsRead(notif.id);
    }
    onNavigateToDate(notif.date);
  };

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900">通知</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-all"
            >
              すべて既読
            </button>
          )}
        </div>

        {/* 通知一覧 */}
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-50 mb-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">通知はありません</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.map((notif, i) => {
              const config = SOURCE_CONFIG[notif.source];
              return (
                <div
                  key={notif.id}
                  onClick={() => handleTap(notif)}
                  className={`px-4 py-3 cursor-pointer transition-all active:bg-gray-100 ${
                    !notif.read ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-gray-50'
                  } ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* 未読インジケーター */}
                    <div className="pt-1.5 w-2 flex-shrink-0">
                      {!notif.read && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-scale-in" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                          style={{ backgroundColor: config.color + '15', color: config.color }}
                        >
                          {config.label}
                        </span>
                        <span className="text-[10px] text-gray-300 flex-shrink-0">
                          {relativeTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold text-gray-900 mt-1 truncate">
                        {notif.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                        <span className="tabular-nums">{formatDateShort(notif.date)} {formatTime(notif.start_time)}</span>
                        {notif.end_time && <span className="tabular-nums">- {formatTime(notif.end_time)}</span>}
                        {notif.customer_name && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span>{notif.customer_name} 様</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
