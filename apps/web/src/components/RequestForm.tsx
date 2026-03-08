'use client';

import { useState, useEffect } from 'react';
import { type RequestChannel, type AppointmentRequest, CHANNEL_CONFIG } from '../lib/supabase';
import { useAppointmentRequests } from '../hooks/useAppointmentRequests';
import { useAppointments } from '../hooks/useAppointments';
import { detectConflicts, type ConflictResult } from '../lib/conflictDetection';

interface RequestFormProps {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CHANNELS: RequestChannel[] = ['line', 'messenger', 'gmail', 'phone', 'other'];

export function RequestForm({ open, onClose, initialDate }: RequestFormProps) {
  const [channel, setChannel] = useState<RequestChannel>('line');
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(initialDate ?? todayStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [messageText, setMessageText] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);

  const { addRequest, requests } = useAppointmentRequests();
  const { appointments } = useAppointments(date);

  // initialDate変更時にフォームの日付を更新
  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  // リアルタイムダブルブッキングチェック
  useEffect(() => {
    if (!startTime || !endTime || !date) {
      setConflictResult(null);
      return;
    }
    const result = detectConflicts(startTime, endTime, date, appointments, requests);
    setConflictResult(result);
  }, [startTime, endTime, date, appointments, requests]);

  const resetForm = () => {
    setChannel('line');
    setCustomerName('');
    setDate(initialDate ?? todayStr());
    setStartTime('');
    setEndTime('');
    setMessageText('');
    setConflictResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !date || !startTime) return;

    setSaving(true);
    try {
      await addRequest({
        customer_name: customerName.trim(),
        date,
        start_time: startTime,
        end_time: endTime || undefined,
        source_channel: channel,
        message_text: messageText.trim() || undefined,
      });
      resetForm();
      onClose();
    } catch (err) {
      console.error('リクエスト登録失敗:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* フォーム本体 */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto safe-area-bottom">
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">予約リクエスト登録</h2>

          {/* チャンネル選択 */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">チャンネル</label>
            <div className="flex gap-1.5 flex-wrap">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    channel === ch
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={channel === ch ? { backgroundColor: CHANNEL_CONFIG[ch].color } : undefined}
                >
                  {CHANNEL_CONFIG[ch].label}
                </button>
              ))}
            </div>
          </div>

          {/* お客様名 */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">お客様名 *</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="山田 太郎"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              required
            />
          </div>

          {/* 日付 */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">日付 *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              required
            />
          </div>

          {/* 時間 */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">開始時間 *</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          {/* ダブルブッキング警告 */}
          {conflictResult?.hasConflict && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-bold text-red-600 mb-1">
                ダブルブッキングの可能性があります
              </p>
              {conflictResult.conflicts.map((c, i) => (
                <p key={i} className="text-xs text-red-500">
                  {c.label}
                </p>
              ))}
            </div>
          )}

          {/* 元メッセージ */}
          <div className="mb-5">
            <label className="text-xs font-medium text-gray-500 mb-1 block">元メッセージ（任意）</label>
            <textarea
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              placeholder="LINEやメールの内容をコピペ"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>

          {/* ボタン */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { resetForm(); onClose(); }}
              className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !customerName.trim() || !startTime}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
