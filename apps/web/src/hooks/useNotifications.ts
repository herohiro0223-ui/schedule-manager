'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type Notification } from '../lib/supabase';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSeenIdRef = useRef<string | null>(null);
  const onNewNotificationRef = useRef<((n: Notification) => void) | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      // 新規通知を検知（ポーリングベース）
      if (lastSeenIdRef.current && data[0].id !== lastSeenIdRef.current) {
        const newNotifs = [];
        for (const n of data) {
          if (n.id === lastSeenIdRef.current) break;
          newNotifs.push(n);
        }
        newNotifs.forEach(n => onNewNotificationRef.current?.(n));
      }
      lastSeenIdRef.current = data[0].id;
    }

    setNotifications(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();

    // 30秒ポーリング（Realtimeの代替）
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  /** 新規通知コールバック登録（ToastManager用） */
  const onNewNotification = useCallback((cb: (n: Notification) => void) => {
    onNewNotificationRef.current = cb;
  }, []);

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
    onNewNotification,
  };
}
