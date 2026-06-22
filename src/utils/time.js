/** Business timezone — all dashboard dates/times display in Sydney time. */
export const DASHBOARD_TIMEZONE = "Australia/Sydney";

const HAS_TIMEZONE_SUFFIX = /[zZ]$|[+-]\d{2}(:?\d{2})?$/;

/**
 * Forminator sends "2026-06-20 12:11:37" with no timezone (Sydney local).
 * Convert to a real UTC instant.
 */
export function parseAustralianLocalTime(value) {
  if (value == null || value === "") return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (HAS_TIMEZONE_SUFFIX.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)/);
  if (!match) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return localDateTimeInZoneToUtc(
    `${match[1]}T${match[2]}`,
    DASHBOARD_TIMEZONE,
  );
}

function readZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function localDateTimeInZoneToUtc(isoLocal, timeZone) {
  const [datePart, timePart] = isoLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, secondRaw] = timePart.split(":");
  const second = Number((secondRaw ?? "0").split(".")[0]);

  let utcMs = Date.UTC(year, month - 1, day, Number(hour), Number(minute), second);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zone = readZoneParts(new Date(utcMs), timeZone);
    const targetMs = Date.UTC(year, month - 1, day, Number(hour), Number(minute), second);
    const zoneMs = Date.UTC(
      zone.year,
      zone.month - 1,
      zone.day,
      zone.hour,
      zone.minute,
      zone.second,
    );
    utcMs += targetMs - zoneMs;
  }

  return new Date(utcMs);
}

export function startOfSydneyDay(dateStr) {
  return localDateTimeInZoneToUtc(`${dateStr}T00:00:00`, DASHBOARD_TIMEZONE);
}

export function endOfSydneyDay(dateStr) {
  return localDateTimeInZoneToUtc(`${dateStr}T23:59:59`, DASHBOARD_TIMEZONE);
}

const sydneyDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInSydney() {
  return sydneyDateFormatter.format(new Date());
}

export function isTodayInSydney(dateValue) {
  if (!dateValue) return false;
  return sydneyDateFormatter.format(new Date(dateValue)) === todayInSydney();
}
