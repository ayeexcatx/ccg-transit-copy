import { format, isValid, parseISO } from 'date-fns';

export function dateOnly(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const ymdMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymdMatch) return ymdMatch[1];

    const parsed = parseISO(value);
    if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
    return '';
  }

  if (value instanceof Date && isValid(value)) {
    return format(value, 'yyyy-MM-dd');
  }

  return '';
}

export function formatDispatchDate(dateStr) {
  const normalized = dateOnly(dateStr);
  if (!normalized) return '';

  const parsed = parseISO(normalized);
  if (!isValid(parsed)) return '';

  return format(parsed, 'EEEE, MMMM d, yyyy');
}

export function formatDispatchTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';

  const raw = timeStr.trim();
  if (!raw) return '';

  const ampmMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    const hour = Number(ampmMatch[1]);
    const minute = ampmMatch[2] ?? '00';
    const period = ampmMatch[3].toUpperCase();
    if (hour >= 1 && hour <= 12 && Number(minute) >= 0 && Number(minute) <= 59) {
      return `${hour}:${minute.padStart(2, '0')} ${period}`;
    }
    return '';
  }

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmmMatch) return '';

  const hour24 = Number(hhmmMatch[1]);
  const minute = Number(hhmmMatch[2]);
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return '';

  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatDispatchDateTime({ date, start_time, status } = {}) {
  const formattedDate = formatDispatchDate(date);
  if (!formattedDate) return '';

  if (status === 'Scheduled' || status === 'Schedule') {
    return formattedDate;
  }

  const formattedTime = formatDispatchTime(start_time);
  return formattedTime ? `${formattedDate} ${formattedTime}` : formattedDate;
}
