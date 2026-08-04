export const DATE_TIME_PRESENTATIONS = ["date", "time", "timestamp"] as const;
export type DateTimePresentation = typeof DATE_TIME_PRESENTATIONS[number];

export interface DateTimeFormatOptions {
  hourFormat?: "24" | "12";
  locale?: Intl.LocalesArgument;
  now?: Date;
  showSeconds?: boolean;
  showTimeZone?: boolean;
}

function timeOptions({ hourFormat = "24", showSeconds = false, showTimeZone = false }: DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return {
    hour: "numeric",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" as const } : {}),
    ...(showTimeZone ? { timeZoneName: "short" as const } : {}),
    hourCycle: hourFormat === "12" ? "h12" : "h23",
  };
}

function dateOptions(date: Date, now: Date): Intl.DateTimeFormatOptions {
  return {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
  };
}

export function formatDateTime(value: string | number | Date, presentation: DateTimePresentation, options: DateTimeFormatOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const now = options.now ?? new Date();
  if (presentation === "date") return new Intl.DateTimeFormat(options.locale, dateOptions(date, now)).format(date);
  if (presentation === "time") return new Intl.DateTimeFormat(options.locale, timeOptions(options)).format(date);
  return new Intl.DateTimeFormat(options.locale, { ...dateOptions(date, now), ...timeOptions(options) }).format(date);
}

export function formatDate(value: string | number | Date, options?: DateTimeFormatOptions): string {
  return formatDateTime(value, "date", options);
}

export function formatTime(value: string | number | Date, options?: DateTimeFormatOptions): string {
  return formatDateTime(value, "time", options);
}

export function formatTimestamp(value: string | number | Date, options?: DateTimeFormatOptions): string {
  return formatDateTime(value, "timestamp", options);
}
