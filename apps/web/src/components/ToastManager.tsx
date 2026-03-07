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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Supabase RealtimeでINSERTを直接購読
    const channel = supabase
      .channel('toast-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const notif = payload.new as Notification;
          setQueue(prev => [...prev, notif]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
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
