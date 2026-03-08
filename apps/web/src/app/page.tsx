'use client';

import { useState, useCallback } from 'react';
import { Calendar } from '../components/Calendar';
import { DayView } from '../components/DayView';
import { ToastManager } from '../components/ToastManager';
import { NotificationPanel } from '../components/NotificationPanel';
import { SearchPanel } from '../components/SearchPanel';
import { useNotifications } from '../hooks/useNotifications';
import { usePendingRequestCount } from '../hooks/useAppointmentRequests';
import { QuickAddFAB } from '../components/QuickAddFAB';
import { RequestForm } from '../components/RequestForm';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const pendingRequestCount = usePendingRequestCount();

  const goToday = () => setSelectedDate(todayStr());

  const prevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  };

  const nextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  };

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

  return (
    <div className="min-h-screen max-w-lg mx-auto">
      {/* トースト通知 */}
      <ToastManager onNavigateToDate={navigateToDate} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-gray-900 text-white px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold tracking-tight">Schedule</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all"
            >
              今日
            </button>
            {/* 検索アイコン */}
            <button
              onClick={toggleSearch}
              className={`p-1.5 rounded-lg transition-all ${
                showSearch ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {/* ベルアイコン（通知） */}
            <button
              onClick={toggleNotifications}
              className={`relative p-1.5 rounded-lg transition-all ${
                showNotifications ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {/* カレンダーアイコン */}
            <button
              onClick={toggleCalendar}
              className={`p-1.5 rounded-lg transition-all ${
                showCalendar ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>
        </div>

        {/* 日付ナビゲーション */}
        <div className="flex items-center justify-between mt-2">
          <button onClick={prevDay} className="p-1 hover:bg-white/10 rounded-lg transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-sm font-medium">{selectedDate}</span>
          <button onClick={nextDay} className="p-1 hover:bg-white/10 rounded-lg transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      {/* 未登録リクエストアラートバナー */}
      {pendingRequestCount > 0 && (
        <div className="bg-red-500 text-white px-4 py-2 text-xs font-medium flex items-center justify-between">
          <span>SALON BOARD未登録のリクエストが{pendingRequestCount}件あります</span>
          <button
            onClick={() => setShowRequestForm(true)}
            className="text-[11px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded transition-all"
          >
            確認
          </button>
        </div>
      )}

      {/* 検索パネル（トグル表示、他パネルと排他） */}
      {showSearch && (
        <SearchPanel
          onNavigateToDate={navigateToDate}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* 通知パネル（トグル表示、カレンダーと排他） */}
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onNavigateToDate={navigateToDate}
        />
      )}

      {/* カレンダー（トグル表示） */}
      {showCalendar && (
        <div className="px-4 pt-3">
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

      {/* FAB（予約リクエスト追加） */}
      <QuickAddFAB onClick={() => setShowRequestForm(true)} />

      {/* 予約リクエスト登録フォーム */}
      <RequestForm
        open={showRequestForm}
        onClose={() => setShowRequestForm(false)}
        initialDate={selectedDate}
      />
    </div>
  );
}
