'use client';

import { type Notification, SOURCE_CONFIG } from '../lib/supabase';

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">
            通知 {unreadCount > 0 && <span className="text-blue-500">({unreadCount})</span>}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              すべて既読
            </button>
          )}
        </div>

        {/* 通知一覧 */}
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            通知はありません
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
            {notifications.map(notif => {
              const config = SOURCE_CONFIG[notif.source];
              return (
                <div
                  key={notif.id}
                  onClick={() => handleTap(notif)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notif.read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* 未読ドット */}
                    <div className="pt-1.5 w-2 flex-shrink-0">
                      {!notif.read && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ backgroundColor: config.color + '20', color: config.color }}
                        >
                          {config.label}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {relativeTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">
                        {notif.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500">
                        <span>{notif.date} {notif.start_time.slice(0, 5)}</span>
                        {notif.end_time && <span>- {notif.end_time.slice(0, 5)}</span>}
                        {notif.customer_name && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span>{notif.customer_name}</span>
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
