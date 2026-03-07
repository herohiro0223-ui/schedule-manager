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
  staff_name?: string;
  service_types?: string[];
  appointment_type?: string;
  status?: AppointmentStatus;
  color?: string;
  notes?: string;
  raw_data?: Record<string, unknown>;
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
