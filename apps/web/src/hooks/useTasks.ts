'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, type Task } from '../lib/supabase';

export function useTasks(date: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('date', date)
      .order('completed')
      .order('priority', { ascending: false })
      .order('created_at');

    setTasks(data ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `date=eq.${date}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchTasks();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [date, fetchTasks]);

  const addTask = async (title: string) => {
    if (!title.trim()) return;
    await supabase.from('tasks').insert({ title: title.trim(), date });
    await fetchTasks();
  };

  const toggleTask = async (id: string, completed: boolean) => {
    await supabase.from('tasks').update({ completed }).eq('id', id);
    await fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    await fetchTasks();
  };

  const updateTask = async (id: string, updates: Partial<Pick<Task, 'title' | 'notes' | 'priority'>>) => {
    await supabase.from('tasks').update(updates).eq('id', id);
    await fetchTasks();
  };

  return { tasks, loading, addTask, toggleTask, deleteTask, updateTask, refetch: fetchTasks };
}
