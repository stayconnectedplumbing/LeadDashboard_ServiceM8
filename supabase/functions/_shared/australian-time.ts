export const DASHBOARD_TIMEZONE = "Australia/Sydney";

const HAS_TIMEZONE_SUFFIX = /[zZ]$|[+-]\d{2}(:?\d{2})?$/;

function readZoneParts(date: Date, timeZone: string) {
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

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function localDateTimeInZoneToUtc(isoLocal: string, timeZone: string): Date {
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

/** Forminator entry_time has no timezone — treat as Australia/Sydney. */
export function parseAustralianLocalTime(value: unknown): string | null {
  if (value == null || value === "") return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (HAS_TIMEZONE_SUFFIX.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)/,
  );
  if (!match) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return localDateTimeInZoneToUtc(
    `${match[1]}T${match[2]}`,
    DASHBOARD_TIMEZONE,
  ).toISOString();
}
