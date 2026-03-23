/**
 * セッションライフサイクル追跡・学習モジュール
 *
 * SALON BOARD のセッション寿命パターンを記録・分析し、
 * プロアクティブな更新タイミングを提案する。
 */

import { supabase } from './supabase.js';

export type SessionEventType =
  | 'session_created'     // 新規ログイン・セッション作成
  | 'session_expired'     // セッション切れ検知
  | 'session_refreshed'   // 手動/自動でセッション更新
  | 'auto_login_success'  // 自動ログイン成功
  | 'auto_login_failed'   // 自動ログイン失敗（CAPTCHA等）
  | 'sync_success'        // セッションが有効で同期成功
  | 'sync_with_records';  // レコードありの同期成功

interface SessionEvent {
  service: string;
  event_type: SessionEventType;
  session_age_hours?: number;
  sync_attempt_count?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

/** テーブル存在フラグ（一度失敗したら再試行しない） */
let tableAvailable: boolean | null = null;

async function isTableAvailable(): Promise<boolean> {
  if (tableAvailable !== null) return tableAvailable;
  const { error } = await supabase
    .from('session_events')
    .select('id')
    .limit(1);
  tableAvailable = !error;
  if (!tableAvailable) {
    console.log('[session-tracker] session_events テーブル未作成（ログはコンソールのみ）');
  }
  return tableAvailable;
}

/**
 * セッションイベントを記録
 */
export async function logSessionEvent(event: SessionEvent): Promise<void> {
  const sessionAge = await getSessionAge(event.service);

  const record = {
    ...event,
    session_age_hours: event.session_age_hours ?? sessionAge,
  };

  // コンソールログは常に出力
  console.log(
    `[session-tracker] ${event.service}: ${event.event_type}` +
    (record.session_age_hours != null ? ` (セッション経過: ${record.session_age_hours.toFixed(1)}h)` : '') +
    (event.error_message ? ` - ${event.error_message}` : '')
  );

  // テーブルがあれば DB にも保存
  if (await isTableAvailable()) {
    const { error } = await supabase.from('session_events').insert(record);
    if (error) {
      console.error(`[session-tracker] DB書き込み失敗: ${error.message}`);
    }
  }
}

/**
 * 最後のセッション作成からの経過時間（時間）を取得
 */
async function getSessionAge(service: string): Promise<number | undefined> {
  // browser_sessions の updated_at から算出
  try {
    const { data } = await supabase
      .from('browser_sessions')
      .select('updated_at')
      .eq('service', service)
      .single();

    if (data?.updated_at) {
      const updatedAt = new Date(data.updated_at).getTime();
      const now = Date.now();
      return (now - updatedAt) / (1000 * 60 * 60);
    }
  } catch {
    // 無視
  }
  return undefined;
}

/**
 * セッション寿命パターンを分析
 * 過去のセッション期限切れイベントから平均寿命を算出
 */
export async function analyzeSessionLifetime(service: string): Promise<{
  averageLifetimeHours: number;
  minLifetimeHours: number;
  maxLifetimeHours: number;
  sampleCount: number;
  recommendedRefreshHours: number;
} | null> {
  if (!(await isTableAvailable())) return null;

  const { data } = await supabase
    .from('session_events')
    .select('session_age_hours')
    .eq('service', service)
    .eq('event_type', 'session_expired')
    .not('session_age_hours', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data || data.length < 2) return null;

  const lifetimes = data
    .map(d => d.session_age_hours as number)
    .filter(h => h > 0);

  if (lifetimes.length < 2) return null;

  const avg = lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length;
  const min = Math.min(...lifetimes);
  const max = Math.max(...lifetimes);

  // 推奨更新タイミング: 最短寿命の80%（安全マージン）
  const recommendedRefreshHours = Math.max(min * 0.8, 12); // 最低12時間

  return {
    averageLifetimeHours: avg,
    minLifetimeHours: min,
    maxLifetimeHours: max,
    sampleCount: lifetimes.length,
    recommendedRefreshHours,
  };
}

/**
 * セッション更新が必要かチェック
 * 学習データに基づいて判断（データ不足時はデフォルト72時間）
 */
export async function shouldRefreshSession(service: string): Promise<{
  shouldRefresh: boolean;
  reason: string;
  currentAgeHours?: number;
  thresholdHours: number;
}> {
  const currentAge = await getSessionAge(service);
  if (currentAge == null) {
    return { shouldRefresh: false, reason: 'セッション情報なし', thresholdHours: 72 };
  }

  // 学習データから閾値を取得
  const analysis = await analyzeSessionLifetime(service);
  let thresholdHours: number;

  if (analysis) {
    thresholdHours = analysis.recommendedRefreshHours;
    console.log(
      `[session-tracker] ${service}: 学習データに基づく閾値 ${thresholdHours.toFixed(1)}h` +
      ` (平均寿命: ${analysis.averageLifetimeHours.toFixed(1)}h, サンプル数: ${analysis.sampleCount})`
    );
  } else {
    // デフォルト: 3日の80% = 約58時間
    thresholdHours = 58;
    console.log(`[session-tracker] ${service}: デフォルト閾値 ${thresholdHours}h（学習データ不足）`);
  }

  const shouldRefresh = currentAge >= thresholdHours;

  return {
    shouldRefresh,
    reason: shouldRefresh
      ? `セッション経過 ${currentAge.toFixed(1)}h ≥ 閾値 ${thresholdHours.toFixed(1)}h`
      : `セッション経過 ${currentAge.toFixed(1)}h < 閾値 ${thresholdHours.toFixed(1)}h`,
    currentAgeHours: currentAge,
    thresholdHours,
  };
}

/**
 * セッション状態サマリーを取得（フロントエンド向け）
 */
export async function getSessionStatus(service: string): Promise<{
  ageHours: number | null;
  lastEvent: string | null;
  predictedExpiryHours: number | null;
  isHealthy: boolean;
}> {
  const age = await getSessionAge(service);

  // 最新イベント
  let lastEvent: string | null = null;
  if (await isTableAvailable()) {
    const { data } = await supabase
      .from('session_events')
      .select('event_type, created_at')
      .eq('service', service)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]) {
      lastEvent = data[0].event_type;
    }
  }

  // 予測残り時間
  let predictedExpiryHours: number | null = null;
  if (age != null) {
    const analysis = await analyzeSessionLifetime(service);
    const avgLifetime = analysis?.averageLifetimeHours ?? 72;
    predictedExpiryHours = Math.max(avgLifetime - age, 0);
  }

  // 直近のsync_logsでエラーがないか
  const { data: recentLogs } = await supabase
    .from('sync_logs')
    .select('status, error_message')
    .eq('source', service === 'salonboard' ? 'harilabo' : service)
    .order('started_at', { ascending: false })
    .limit(3);

  const hasRecentError = recentLogs?.some(
    log => log.error_message?.includes('セッション切れ') || log.error_message?.includes('ログイン失敗')
  ) ?? false;

  return {
    ageHours: age ?? null,
    lastEvent,
    predictedExpiryHours,
    isHealthy: !hasRecentError && (age == null || age < 72),
  };
}
