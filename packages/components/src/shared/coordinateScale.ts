import { formatTime, formatTimestamp } from "./dateTimeFormat";

export const MAX_COORDINATE_TICKS = 101;

export interface CoordinateScale {
  kind: "datetime" | "linear";
  hourFormat?: "24" | "12";
  displayPrefix?: string;
  minimum?: number;
  maximum?: number;
  tickStep?: number;
  showSeconds?: boolean;
  showTimeZone?: boolean;
}

export function parseCoordinate(value: unknown, scale: CoordinateScale): number {
  if (scale.kind === "datetime") return typeof value === "string" ? Date.parse(value) : Number.NaN;
  return typeof value === "number" ? value : Number.NaN;
}

export function formatCoordinate(value: unknown, scale: CoordinateScale): string {
  const text = value == null ? "" : String(value);
  if (scale.kind === "datetime") {
    return formatTimestamp(text, {
      hourFormat: scale.hourFormat,
      showSeconds: scale.showSeconds,
      showTimeZone: scale.showTimeZone,
    });
  }
  return scale.displayPrefix ? `${scale.displayPrefix}${text}` : text;
}

export function formatAxisCoordinate(value: number, scale: CoordinateScale): string {
  return scale.kind === "datetime"
    ? formatTime(value, {
      hourFormat: scale.hourFormat,
      showSeconds: scale.showSeconds,
      showTimeZone: scale.showTimeZone,
    })
    : formatCoordinate(value, scale);
}

export function coordinateTicks(minimum: number, maximum: number, tickStep?: number): number[] {
  if (tickStep === undefined || tickStep <= 0 || maximum < minimum) return [];
  const count = Math.floor((maximum - minimum) / tickStep) + 1;
  return Array.from({ length: Math.min(MAX_COORDINATE_TICKS, count) }, (_, index) => minimum + index * tickStep)
    .filter((value) => value <= maximum);
}

export function coordinateTickCountExceedsLimit(minimum: number, maximum: number, tickStep?: number): boolean {
  return tickStep !== undefined
    && tickStep > 0
    && Math.floor((maximum - minimum) / tickStep) + 1 > MAX_COORDINATE_TICKS;
}
