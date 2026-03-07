'use client';

import { useEffect, useState } from 'react';
import { type Notification, SOURCE_CONFIG } from '../lib/supabase';

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
      className={`mx-4 mb-2 rounded-xl shadow-lg bg-white overflow-hidden cursor-pointer transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{ borderLeft: `4px solid ${config.color}` }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: config.color + '20', color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-[10px] text-gray-400">新規予約</span>
        </div>
        <p className="text-sm font-semibold mt-1 text-gray-900">{notification.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>{notification.date} {notification.start_time.slice(0, 5)}</span>
          {notification.customer_name && <span>- {notification.customer_name}</span>}
        </div>
      </div>
    </div>
  );
}
