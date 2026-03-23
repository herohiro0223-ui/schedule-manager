'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface SessionHealth {
  expired: boolean;
  ageHours: number | null;
  predictedExpiryHours: number | null;
  lastError: string | null;
  recheck: () => void;
}

/**
 * SALON BOARD のセッション切れを検知するフック（改善版）
 *
 * 改善点:
 * - error_message ベースで正確な検知（旧: records_synced === 0 のヒューリスティック）
 * - セッション経過時間・残り時間の予測
 * - browser_sessions テーブルからセッション年齢を取得
 */
export function useSessionExpiry(): SessionHealth {
  const [health, setHealth] = useState<SessionHealth>({
    expired: false,
    ageHours: null,
    predictedExpiryHours: null,
    lastError: null,
    recheck: () => {},
  });
  const recheckRef = useRef<() => void>(() => {});

  useEffect(() => {
    async function check() {
      // 1. 直近のエラーログからセッション切れを検知
      const { data: errorLogs } = await supabase
        .from('sync_logs')
        .select('error_message, started_at')
        .eq('source', 'harilabo')
        .eq('status', 'error')
        .order('started_at', { ascending: false })
        .limit(3);

      const sessionErrors = (errorLogs ?? []).filter(
        log => log.error_message?.includes('セッション切れ') ||
               log.error_message?.includes('ログイン失敗') ||
               log.error_message?.includes('CAPTCHA')
      );

      // 直近にセッション関連エラーがある場合
      const hasRecentSessionError = sessionErrors.length > 0;

      // ただし、その後に成功した同期があれば解消済み
      let resolvedBySuccess = false;
      if (hasRecentSessionError) {
        const latestErrorTime = sessionErrors[0].started_at;
        const { data: successLogs } = await supabase
          .from('sync_logs')
          .select('started_at')
          .eq('source', 'harilabo')
          .eq('status', 'success')
          .gt('started_at', latestErrorTime)
          .limit(1);

        resolvedBySuccess = (successLogs?.length ?? 0) > 0;
      }

      // 2. セッション経過時間を取得
      let ageHours: number | null = null;
      try {
        const { data: session } = await supabase
          .from('browser_sessions')
          .select('updated_at')
          .eq('service', 'salonboard')
          .single();

        if (session?.updated_at) {
          const updatedAt = new Date(session.updated_at).getTime();
          ageHours = (Date.now() - updatedAt) / (1000 * 60 * 60);
        }
      } catch {
        // browser_sessions がなくてもエラーにしない
      }

      // 3. 予測残り時間（デフォルト72時間寿命、学習データがあれば上書き）
      let predictedExpiryHours: number | null = null;
      if (ageHours != null) {
        // session_events テーブルから学習データ取得を試みる
        let avgLifetime = 72; // デフォルト
        try {
          const { data: events } = await supabase
            .from('session_events')
            .select('session_age_hours')
            .eq('service', 'salonboard')
            .eq('event_type', 'session_expired')
            .not('session_age_hours', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

          if (events && events.length >= 2) {
            const lifetimes = events.map(e => e.session_age_hours as number).filter(h => h > 0);
            if (lifetimes.length >= 2) {
              avgLifetime = lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length;
            }
          }
        } catch {
          // session_events テーブルがなくても継続
        }
        predictedExpiryHours = Math.max(avgLifetime - ageHours, 0);
      }

      const expired = hasRecentSessionError && !resolvedBySuccess;

      setHealth({
        expired,
        ageHours,
        predictedExpiryHours: expired ? 0 : predictedExpiryHours,
        lastError: sessionErrors[0]?.error_message ?? null,
        recheck: recheckRef.current,
      });
    }

    recheckRef.current = check;
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  return { ...health, recheck: recheckRef.current };
}
