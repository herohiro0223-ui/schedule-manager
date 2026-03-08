import type { Appointment, AppointmentRequest } from './supabase';

interface TimeSlot {
  start_time: string; // HH:MM
  end_time?: string;  // HH:MM
  customer_name?: string;
  label: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function hasOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: { label: string; start_time: string; end_time: string }[];
}

/**
 * 新しいリクエストが既存の予約・リクエストと重複するかチェック
 */
export function detectConflicts(
  newStartTime: string,
  newEndTime: string,
  date: string,
  appointments: Appointment[],
  existingRequests: AppointmentRequest[]
): ConflictResult {
  const newStart = timeToMinutes(newStartTime);
  const newEnd = timeToMinutes(newEndTime);

  if (newStart >= newEnd) {
    return { hasConflict: false, conflicts: [] };
  }

  const slots: TimeSlot[] = [];

  // 既存の予約（同じ日付）
  appointments
    .filter(a => a.date === date && a.end_time)
    .forEach(a => {
      slots.push({
        start_time: a.start_time,
        end_time: a.end_time,
        customer_name: a.customer_name,
        label: `予約: ${a.customer_name || a.title} (${a.start_time}-${a.end_time})`,
      });
    });

  // pending状態の既存リクエスト（同じ日付）
  existingRequests
    .filter(r => r.date === date && r.status === 'pending' && r.end_time)
    .forEach(r => {
      slots.push({
        start_time: r.start_time,
        end_time: r.end_time,
        customer_name: r.customer_name,
        label: `リクエスト: ${r.customer_name} (${r.start_time}-${r.end_time})`,
      });
    });

  const conflicts = slots.filter(slot => {
    if (!slot.end_time) return false;
    const slotStart = timeToMinutes(slot.start_time);
    const slotEnd = timeToMinutes(slot.end_time);
    return hasOverlap(newStart, newEnd, slotStart, slotEnd);
  }).map(slot => ({
    label: slot.label,
    start_time: slot.start_time,
    end_time: slot.end_time!,
  }));

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}
