'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type Notification } from '../lib/supabase';
import { Toast } from './Toast';

interface ToastManagerProps {
  onNavigateToDate: (date: string) => void;
}

export function ToastManager({ onNavigateToDate }: ToastManagerProps) {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [current, setCurrent] = useState<Notification | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 初回: 最新IDを記録（既存通知はトースト表示しない）
    async function init() {
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0]) {
        lastSeenIdRef.current = data[0].id;
      }
    }
    init();

    // 15秒ポーリングで新規通知を検知（トースト用はやや頻度高め）
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (data && data.length > 0 && lastSeenIdRef.current) {
        const newNotifs: Notification[] = [];
        for (const n of data) {
          if (n.id === lastSeenIdRef.current) break;
          newNotifs.push(n);
        }
        if (newNotifs.length > 0) {
          lastSeenIdRef.current = data[0].id;
          setQueue(prev => [...prev, ...newNotifs.reverse()]);
        }
      } else if (data && data.length > 0 && !lastSeenIdRef.current) {
        lastSeenIdRef.current = data[0].id;
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // キューから1件ずつ表示
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(prev => prev.slice(1));
    }
  }, [current, queue]);

  const handleDismiss = useCallback(() => {
    setCurrent(null);
  }, []);

  const handleTap = useCallback((date: string) => {
    setCurrent(null);
    onNavigateToDate(date);
  }, [onNavigateToDate]);

  if (!current) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pt-[env(safe-area-inset-top)] pointer-events-none">
      <div className="max-w-lg mx-auto pt-2 pointer-events-auto">
        <Toast
          key={current.id}
          notification={current}
          onDismiss={handleDismiss}
          onTap={handleTap}
        />
      </div>
    </div>
  );
}
