'use client';

import { useState, useCallback } from 'react';
import { Calendar } from '../components/Calendar';
import { DayView } from '../components/DayView';
import { ToastManager } from '../components/ToastManager';
import { NotificationPanel } from '../components/NotificationPanel';
import { SearchPanel } from '../components/SearchPanel';
import { useNotifications } from '../hooks/useNotifications';
import { useSessionExpiry } from '../hooks/useSessionExpiry';
import { supabase } from '../lib/supabase';
import { todayStr, shiftDate, getWeekday } from '../lib/date';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const sessionHealth = useSessionExpiry();
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectResult, setReconnectResult] = useState<'success' | 'failed' | null>(null);

  const tryReconnect = useCallback(async () => {
    if (reconnecting) return;
    setReconnecting(true);
    setReconnectResult(null);
    try {
      // 同期リクエストを送信（スクレイパーが自動ログインを試行する）
      await supabase.from('sync_requests').insert({ status: 'pending' });

      // 完了を待つ（最大120秒）
      const start = Date.now();
      const waitForResult = async (): Promise<boolean> => {
        if (Date.now() - start > 120000) return false;
        const { data } = await supabase
          .from('sync_requests')
          .select('status')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.status === 'completed') return true;
        if (data?.status === 'error') return false;
        await new Promise(r => setTimeout(r, 3000));
        return waitForResult();
      };
      const success = await waitForResult();

      // 少し待ってからセッション状態を再チェック
      await new Promise(r => setTimeout(r, 2000));
      sessionHealth.recheck();

      if (success) {
        setReconnectResult('success');
        setTimeout(() => setReconnectResult(null), 5000);
      } else {
        setReconnectResult('failed');
      }
    } catch {
      setReconnectResult('failed');
    } finally {
      setReconnecting(false);
    }
  }, [reconnecting, sessionHealth]);

  const goToday = () => setSelectedDate(todayStr());

  const prevDay = () => setSelectedDate(shiftDate(selectedDate, -1));
  const nextDay = () => setSelectedDate(shiftDate(selectedDate, 1));

  const navigateToDate = useCallback((date: string) => {
    setSelectedDate(date);
    setShowCalendar(false);
    setShowNotifications(false);
    setShowSearch(false);
  }, []);

  const toggleSearch = () => {
    setShowSearch(prev => !prev);
    if (!showSearch) { setShowCalendar(false); setShowNotifications(false); }
  };

  const toggleNotifications = () => {
    setShowNotifications(prev => !prev);
    if (!showNotifications) { setShowCalendar(false); setShowSearch(false); }
  };

  const toggleCalendar = () => {
    setShowCalendar(prev => !prev);
    if (!showCalendar) { setShowNotifications(false); setShowSearch(false); }
  };

  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const isToday = selectedDate === todayStr();
  const weekday = getWeekday(selectedDate);
  const weekdayColor = (() => {
    const day = selectedDateObj.getDay();
    if (day === 0) return 'text-red-300';
    if (day === 6) return 'text-blue-300';
    return 'text-white/60';
  })();

  return (
    <div className="min-h-screen max-w-lg mx-auto">
      {/* トースト通知 */}
      <ToastManager onNavigateToDate={navigateToDate} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-gray-900 to-gray-800 text-white safe-area-top shadow-lg shadow-black/10">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-base font-bold tracking-tight">Schedule</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={goToday}
              className={`text-xs px-3 py-1 rounded-full transition-all ${
                isToday
                  ? 'bg-white/20 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
            >
              今日
            </button>
            {/* 検索アイコン */}
            <button
              onClick={toggleSearch}
              className={`p-2 rounded-xl transition-all ${
                showSearch ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {/* ベルアイコン（通知） */}
            <button
              onClick={toggleNotifications}
              className={`relative p-2 rounded-xl transition-all ${
                showNotifications ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 animate-scale-in">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {/* カレンダーアイコン */}
            <button
              onClick={toggleCalendar}
              className={`p-2 rounded-xl transition-all ${
                showCalendar ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>
        </div>

        {/* 日付ナビゲーション */}
        <div className="flex items-center justify-between px-4 pb-3">
          <button onClick={prevDay} className="p-1.5 hover:bg-white/10 rounded-xl transition-all active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="text-center">
            <span className="text-lg font-semibold tabular-nums">
              {selectedDateObj.getMonth() + 1}月{selectedDateObj.getDate()}日
            </span>
            <span className={`ml-1.5 text-sm font-normal ${weekdayColor}`}>
              {weekday}曜日
            </span>
            {isToday && (
              <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                TODAY
              </span>
            )}
          </div>
          <button onClick={nextDay} className="p-1.5 hover:bg-white/10 rounded-xl transition-all active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      {/* SALON BOARD セッション状態バナー */}
      {reconnectResult === 'success' && (
        <div className="mx-4 mt-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-sm animate-slide-down">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <p className="text-emerald-800 font-medium">SALON BOARD に再接続しました</p>
        </div>
      )}
      {sessionHealth.expired && reconnectResult !== 'success' && (
        <div className="mx-4 mt-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm animate-slide-down">
          <div className="flex items-start gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1">
              <p className="text-amber-800 font-medium">SALON BOARD の連携が切れています</p>
              {reconnectResult === 'failed' ? (
                <p className="text-red-600 text-xs mt-0.5">
                  自動再接続に失敗しました（CAPTCHAの可能性）。Macで手動再ログインが必要です。
                </p>
              ) : (
                <p className="text-amber-600 text-xs mt-0.5">
                  下のボタンで自動再接続を試せます。
                </p>
              )}
              {sessionHealth.ageHours != null && (
                <p className="text-amber-500 text-[10px] mt-1">
                  セッション経過: {Math.floor(sessionHealth.ageHours)}時間
                </p>
              )}
            </div>
          </div>
          <button
            onClick={tryReconnect}
            disabled={reconnecting}
            className={`mt-2.5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all ${
              reconnecting
                ? 'bg-amber-100 text-amber-400'
                : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98]'
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={reconnecting ? 'animate-spin' : ''}
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {reconnecting ? '再接続中...' : reconnectResult === 'failed' ? 'もう一度試す' : '再接続を試す'}
          </button>
        </div>
      )}
      {!sessionHealth.expired && sessionHealth.predictedExpiryHours != null && sessionHealth.predictedExpiryHours < 12 && (
        <div className="mx-4 mt-2 px-3 py-2 bg-yellow-50/80 border border-yellow-100 rounded-xl flex items-center gap-2 text-xs animate-slide-down">
          <span className="text-yellow-600">
            SALON BOARD セッション残り約{Math.floor(sessionHealth.predictedExpiryHours)}時間
          </span>
        </div>
      )}

      {/* 検索パネル（トグル表示、他パネルと排他） */}
      {showSearch && (
        <div className="animate-slide-down">
          <SearchPanel
            onNavigateToDate={navigateToDate}
            onClose={() => setShowSearch(false)}
          />
        </div>
      )}

      {/* 通知パネル（トグル表示、カレンダーと排他） */}
      {showNotifications && (
        <div className="animate-slide-down">
          <NotificationPanel
            notifications={notifications}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onNavigateToDate={navigateToDate}
          />
        </div>
      )}

      {/* カレンダー（トグル表示） */}
      {showCalendar && (
        <div className="px-4 pt-3 animate-slide-down">
          <Calendar
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setShowCalendar(false);
            }}
          />
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="px-4 py-4">
        <DayView date={selectedDate} />
      </main>

    </div>
  );
}
