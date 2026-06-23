const NZ_TIMEZONE = "Pacific/Auckland";

/**
 * Returns the current date/time as a Date object, but with its components
 * (year, month, day, hour) representing NZ local time rather than the
 * server's own timezone (Vercel's servers run in UTC). Useful for any
 * "what day is it" or "start of today" logic that needs to match what a
 * person in NZ would expect, regardless of where the code executes.
 */
function nowInNZParts() {
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/**
 * Returns an ISO string representing midnight at the start of "today" in
 * NZ time, expressed as the equivalent UTC instant — safe to use directly
 * in Supabase queries comparing against logged_at timestamps (which are
 * stored as UTC instants regardless of where they were logged from).
 */
export function startOfTodayNZ_ISO(): string {
  const { year, month, day } = nowInNZParts();
  // NZ is UTC+12 (NZST) or UTC+13 (NZDT). Rather than hardcoding the
  // offset (which would break across daylight saving changes), we build
  // the date as a UTC instant and then adjust by finding the actual NZ
  // offset for that date via the formatter round-trip.
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Find what NZ local time that UTC instant actually corresponds to, to
  // derive the real offset, then correct.
  const checkFormatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  });
  const nzHourAtUtcGuess = Number(
    checkFormatter.formatToParts(utcGuess).find((p) => p.type === "hour")?.value ?? "0"
  );

  // nzHourAtUtcGuess tells us how far NZ midnight actually is from this UTC
  // guess; subtract that many hours to land on true NZ midnight as a UTC instant.
  const correctedUtcMs = utcGuess.getTime() - nzHourAtUtcGuess * 60 * 60 * 1000;
  return new Date(correctedUtcMs).toISOString();
}

/**
 * Returns today's date as a YYYY-MM-DD string in NZ time — useful for
 * display, and for default values in date pickers.
 */
export function todayDateStringNZ(): string {
  const { year, month, day } = nowInNZParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formats today's date for display in NZ time (e.g. "Tuesday, Jun 24").
 */
export function todayDisplayNZ(): string {
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIMEZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return formatter.format(new Date());
}
