'use client';

import { type AppointmentRequest, CHANNEL_CONFIG } from '../lib/supabase';

interface RequestCardProps {
  request: AppointmentRequest;
  onMarkRegistered: (id: string) => void;
  onCancel: (id: string) => void;
}

export function RequestCard({ request, onMarkRegistered, onCancel }: RequestCardProps) {
  const channelConf = CHANNEL_CONFIG[request.source_channel];
  const isRegistered = request.status === 'registered';
  const isCancelled = request.status === 'cancelled';
  const isDone = isRegistered || isCancelled;

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isDone
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : 'bg-white border-red-200 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* チャンネル + ステータス */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: channelConf.color }}
            >
              {channelConf.label}
            </span>
            {!isDone && (
              <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                SALON BOARD未登録
              </span>
            )}
            {isRegistered && (
              <span className="text-[10px] text-gray-400">登録済み</span>
            )}
            {isCancelled && (
              <span className="text-[10px] text-gray-400">キャンセル</span>
            )}
          </div>

          {/* お客様名 + 時間 */}
          <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            {request.customer_name}
          </p>
          <p className="text-xs text-gray-500">
            {request.start_time}
            {request.end_time ? `〜${request.end_time}` : ''}
          </p>

          {/* メッセージ抜粋 */}
          {request.message_text && (
            <p className="text-[11px] text-gray-400 mt-1 truncate">
              {request.message_text}
            </p>
          )}
        </div>

        {/* アクションボタン */}
        {!isDone && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={() => onMarkRegistered(request.id)}
              className="text-[11px] px-2.5 py-1 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-all whitespace-nowrap"
            >
              登録済み
            </button>
            <button
              onClick={() => onCancel(request.id)}
              className="text-[11px] px-2.5 py-1 bg-gray-100 text-gray-500 rounded-md hover:bg-gray-200 transition-all whitespace-nowrap"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
