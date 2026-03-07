'use client';

import { useState } from 'react';
import { useTasks } from '../hooks/useTasks';

interface TaskListProps {
  date: string;
}

export function TaskList({ date }: TaskListProps) {
  const { tasks, loading, addTask, toggleTask, deleteTask } = useTasks(date);
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await addTask(newTitle);
    setNewTitle('');
    setIsAdding(false);
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  return (
    <div className="mt-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-700">タスク</h3>
          {totalCount > 0 && (
            <span className="text-[10px] text-gray-400">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          追加
        </button>
      </div>

      {/* 追加フォーム */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="タスクを入力..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-3 py-2 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-all"
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(false); setNewTitle(''); }}
            className="px-2 py-2 text-xs text-gray-400 hover:text-gray-600 transition-all"
          >
            取消
          </button>
        </form>
      )}

      {/* タスクリスト */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
        </div>
      ) : tasks.length === 0 && !isAdding ? (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-3 text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-500 transition-all"
        >
          + タスクを追加
        </button>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-all ${
                task.completed ? 'bg-gray-50' : 'bg-white border border-gray-100'
              }`}
            >
              {/* チェックボックス */}
              <button
                onClick={() => toggleTask(task.id, !task.completed)}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  task.completed
                    ? 'bg-gray-400 border-gray-400'
                    : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {task.completed && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>

              {/* タイトル */}
              <span
                className={`flex-1 text-sm transition-all ${
                  task.completed ? 'text-gray-400 line-through' : 'text-gray-700'
                }`}
              >
                {task.title}
              </span>

              {/* 削除ボタン */}
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
