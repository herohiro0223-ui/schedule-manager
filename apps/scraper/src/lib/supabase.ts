import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type AppointmentSource = 'harilabo' | 'sekkotwin' | 'personal' | 'icloud';
export type AppointmentStatus = 'confirmed' | 'tentative' | 'cancelled' | 'completed';

export interface Appointment {
  id?: string;
  source: AppointmentSource;
  external_id?: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time?: string;   // HH:MM
  title: string;
  customer_name?: string;
  customer_name_kana?: string;
  staff_name?: string;
  service_types?: string[];
  appointment_type?: string;
  status?: AppointmentStatus;
  color?: string;
  notes?: string;
  raw_data?: Record<string, unknown>;
}

export type RequestChannel = 'line' | 'messenger' | 'gmail' | 'phone' | 'other';
export type RequestStatus = 'pending' | 'registered' | 'cancelled';

export interface AppointmentRequest {
  id?: string;
  customer_name: string;
  date: string;
  start_time: string;
  end_time?: string;
  source_channel: RequestChannel;
  status: RequestStatus;
  matched_appointment_id?: string;
  message_text?: string;
}

// Supabaseへのupsert（重複防止）
export async function upsertAppointments(appointments: Appointment[]) {
  if (appointments.length === 0) return;

  const { data, error } = await supabase
    .from('appointments')
    .upsert(appointments, {
      onConflict: 'source,external_id',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }
  return data;
}

// 新規予約を検知して通知テーブルに挿入
async function detectAndNotifyNew(
  source: AppointmentSource,
  newAppointments: Appointment[],
  filterQuery?: { column: string; value: string }
) {
  try {
    // 既存のexternal_idを取得
    let query = supabase
      .from('appointments')
      .select('external_id')
      .eq('source', source);

    if (filterQuery) {
      query = query.eq(filterQuery.column, filterQuery.value);
    }

    const { data: existingRows, error } = await query;

    if (error) {
      console.error(`[detectAndNotifyNew] 既存ID取得失敗: ${error.message}`);
      return;
    }

    const existingIds = new Set(
      (existingRows ?? []).map(r => r.external_id as string).filter(Boolean)
    );

    // 初回同期（既存0件）はスキップ
    if (existingIds.size === 0) {
      console.log(`[detectAndNotifyNew] ${source}: 初回同期のため通知スキップ`);
      return;
    }

    // 新しいexternal_idを持つ予約を特定
    const newOnes = newAppointments.filter(
      a => a.external_id && !existingIds.has(a.external_id)
    );

    if (newOnes.length === 0) return;

    console.log(`[detectAndNotifyNew] ${source}: ${newOnes.length}件の新規予約を検知`);

    // 通知テーブルに挿入
    const notifications = newOnes.map(a => ({
      source: a.source,
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time ?? null,
      title: a.title,
      customer_name: a.customer_name ?? null,
      staff_name: a.staff_name ?? null,
    }));

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error(`[detectAndNotifyNew] 通知挿入失敗: ${insertError.message}`);
    }
  } catch (err) {
    console.error(`[detectAndNotifyNew] エラー:`, err);
  }
}

// 日付範囲の既存予約を削除して再挿入（external_idがない場合用）
export async function replaceAppointments(
  source: AppointmentSource,
  date: string,
  appointments: Appointment[]
) {
  // 削除前に新規予約を検知
  await detectAndNotifyNew(source, appointments, { column: 'date', value: date });

  // まず該当日のデータを削除
  const { error: deleteError } = await supabase
    .from('appointments')
    .delete()
    .eq('source', source)
    .eq('date', date);

  if (deleteError) {
    throw new Error(`Delete failed: ${deleteError.message}`);
  }

  if (appointments.length === 0) return;

  // 新しいデータを挿入
  const { error: insertError } = await supabase
    .from('appointments')
    .insert(appointments);

  if (insertError) {
    throw new Error(`Insert failed: ${insertError.message}`);
  }
}

// ソースの全データを削除して再挿入（全期間同期用）
// 安全対策: 新データが0件の場合は削除しない（データ消失防止）
export async function replaceAllBySource(
  source: AppointmentSource,
  appointments: Appointment[]
) {
  // 新データが0件の場合、既存データを保持（誤削除防止）
  if (appointments.length === 0) {
    console.log(`[replaceAllBySource] ${source}: 新データが0件のため既存データを保持`);
    return;
  }

  // upsert前に新規予約を検知
  await detectAndNotifyNew(source, appointments);

  // 既存件数を取得して異常な減少を検知
  const { count: existingCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('source', source);

  if (existingCount && existingCount > 0 && appointments.length < existingCount * 0.3) {
    console.warn(
      `[replaceAllBySource] ${source}: 既存${existingCount}件 → 新${appointments.length}件（70%以上減少）。` +
      `データ異常の可能性があるため、upsertで更新します。`
    );
    // 大幅減少時はupsertのみ（削除しない）で安全に更新
    await upsertAppointments(appointments);
    return;
  }

  // まず新データをupsertで挿入/更新（先に挿入することでデータ消失を防ぐ）
  const batchSize = 500;
  const newExternalIds: string[] = [];

  for (let i = 0; i < appointments.length; i += batchSize) {
    const batch = appointments.slice(i, i + batchSize);
    const { error: upsertError } = await supabase
      .from('appointments')
      .upsert(batch, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      throw new Error(`Upsert batch failed: ${upsertError.message}`);
    }

    batch.forEach(a => {
      if (a.external_id) newExternalIds.push(a.external_id);
    });
  }

  // 新データに含まれないレコードを削除（古いイベントのクリーンアップ）
  if (newExternalIds.length > 0) {
    const newIdSet = new Set(newExternalIds);

    // 既存の全external_idを取得
    const { data: existingRows, error: fetchError } = await supabase
      .from('appointments')
      .select('external_id')
      .eq('source', source);

    if (fetchError) {
      console.error(`[replaceAllBySource] ${source}: 既存ID取得失敗: ${fetchError.message}`);
    } else if (existingRows) {
      const staleIds = existingRows
        .map(r => r.external_id as string)
        .filter(id => id && !newIdSet.has(id));

      if (staleIds.length > 0) {
        console.log(`[replaceAllBySource] ${source}: ${staleIds.length}件の古いレコードを削除`);
        // バッチで削除（PostgRESTのURL長制限回避）
        const deleteBatchSize = 100;
        for (let i = 0; i < staleIds.length; i += deleteBatchSize) {
          const batch = staleIds.slice(i, i + deleteBatchSize);
          const { error: deleteError } = await supabase
            .from('appointments')
            .delete()
            .eq('source', source)
            .in('external_id', batch);

          if (deleteError) {
            console.error(`[replaceAllBySource] ${source}: 古いレコード削除失敗: ${deleteError.message}`);
          }
        }
      }
    }
  }
}

/**
 * 予約リクエストとSALON BOARD予約の自動突き合わせ
 * - pending状態のリクエストとSALON BOARDの予約をマッチング
 * - 日付 + 時間（±30分）+ 顧客名（あいまい一致）でマッチ判定
 * - マッチしたら自動で registered に更新
 * - マッチしなければ通知テーブルにアラート挿入
 */
export async function reconcileRequests(dates: string[]) {
  try {
    // pending状態のリクエストを取得
    const { data: pendingRequests, error: reqError } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('status', 'pending')
      .in('date', dates);

    if (reqError) {
      console.error(`[reconcile] リクエスト取得失敗: ${reqError.message}`);
      return;
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('[reconcile] pending リクエストなし');
      return;
    }

    // 対象日のSALON BOARD予約を取得
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('source', 'harilabo')
      .in('date', dates);

    if (aptError) {
      console.error(`[reconcile] 予約取得失敗: ${aptError.message}`);
      return;
    }

    const aptList = appointments ?? [];
    let matchCount = 0;

    for (const req of pendingRequests) {
      const match = aptList.find(apt => {
        // 日付一致
        if (apt.date !== req.date) return false;

        // 時間（±30分以内）
        if (!isTimeClose(req.start_time, apt.start_time, 30)) return false;

        // 顧客名（あいまい一致）
        if (!isFuzzyNameMatch(req.customer_name, apt.customer_name ?? '')) return false;

        return true;
      });

      if (match) {
        // マッチ → registered に更新
        const { error: updateError } = await supabase
          .from('appointment_requests')
          .update({
            status: 'registered',
            matched_appointment_id: match.id,
          })
          .eq('id', req.id);

        if (updateError) {
          console.error(`[reconcile] ステータス更新失敗 (${req.id}): ${updateError.message}`);
        } else {
          matchCount++;
          console.log(`[reconcile] マッチ: ${req.customer_name} ${req.date} ${req.start_time} → ${match.customer_name} ${match.start_time}`);
        }
      }
    }

    const unmatchedCount = pendingRequests.length - matchCount;
    console.log(`[reconcile] 結果: ${matchCount}件マッチ, ${unmatchedCount}件未マッチ`);

    // 未マッチが残っている場合、通知テーブルにアラート挿入
    if (unmatchedCount > 0) {
      const unmatched = pendingRequests.filter(req => {
        return !aptList.some(apt =>
          apt.date === req.date &&
          isTimeClose(req.start_time, apt.start_time, 30) &&
          isFuzzyNameMatch(req.customer_name, apt.customer_name ?? '')
        );
      });

      const notifications = unmatched.map(req => ({
        source: 'harilabo' as const,
        date: req.date,
        start_time: req.start_time,
        end_time: req.end_time ?? null,
        title: `SALON BOARD未登録: ${req.customer_name}`,
        customer_name: req.customer_name,
        staff_name: null,
      }));

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notifError) {
          console.error(`[reconcile] 通知挿入失敗: ${notifError.message}`);
        }
      }
    }
  } catch (err) {
    console.error('[reconcile] エラー:', err);
  }
}

/** 時間がtolerance分以内かチェック (HH:MM形式) */
function isTimeClose(timeA: string, timeB: string, toleranceMinutes: number): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return Math.abs(toMin(timeA) - toMin(timeB)) <= toleranceMinutes;
}

/** 顧客名のあいまい一致（部分一致 or 姓のみ一致） */
function isFuzzyNameMatch(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const a = nameA.replace(/\s+/g, '').trim();
  const b = nameB.replace(/\s+/g, '').trim();

  // 完全一致
  if (a === b) return true;

  // 部分一致（片方がもう片方を含む）
  if (a.includes(b) || b.includes(a)) return true;

  // 姓（最初の1〜3文字）が一致
  const surnameA = a.slice(0, Math.min(3, a.length));
  const surnameB = b.slice(0, Math.min(3, b.length));
  if (surnameA.length >= 2 && surnameA === surnameB) return true;

  return false;
}

// 同期ログ記録
export async function logSync(
  source: AppointmentSource,
  status: 'running' | 'success' | 'error',
  recordsSynced?: number,
  errorMessage?: string
) {
  const { error } = await supabase
    .from('sync_logs')
    .insert({
      source,
      status,
      records_synced: recordsSynced ?? 0,
      completed_at: status !== 'running' ? new Date().toISOString() : null,
      error_message: errorMessage,
    });

  if (error) {
    console.error(`Failed to log sync: ${error.message}`);
  }
}
