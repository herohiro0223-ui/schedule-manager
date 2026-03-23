'use client';

import { useEffect, useState } from 'react';
import { type Notification, SOURCE_CONFIG } from '../lib/supabase';
import { formatDateShort, formatTime } from '../lib/date';

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
  onTap: (date: string) => void;
}

export function Toast({ notification, onDismiss, onTap }: ToastProps) {
  const [visible, setVisible] = useState(false);

  const config = SOURCE_CONFIG[notification.source];

  useEffect(() => {
    // スライドインアニメーション
    requestAnimationFrame(() => setVisible(true));

    // 5秒後に自動消滅
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleTap = () => {
    setVisible(false);
    setTimeout(() => onTap(notification.date), 300);
  };

  return (
    <div
      onClick={handleTap}
      className={`mx-4 mb-2 rounded-2xl shadow-lg shadow-black/10 bg-white overflow-hidden cursor-pointer transition-all duration-300 border border-gray-100 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{ borderLeft: `3px solid ${config.color}` }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: config.color + '15', color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-[10px] text-gray-300 font-medium">新規予約</span>
        </div>
        <p className="text-[13px] font-semibold mt-1.5 text-gray-900">{notification.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span className="tabular-nums">{formatDateShort(notification.date)} {formatTime(notification.start_time)}</span>
          {notification.customer_name && (
            <>
              <span className="text-gray-200">·</span>
              <span>{notification.customer_name} 様</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
