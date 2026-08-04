export const SOURCE_LINE_CHANGES = ["unchanged", "added", "removed", "modified"] as const;
export type SourceLineChange = typeof SOURCE_LINE_CHANGES[number];

export interface SourceViewerLine {
  id: string;
  beforeNumber?: string;
  beforeText?: string;
  afterNumber?: string;
  afterText?: string;
  annotation?: string;
  change: SourceLineChange;
}

export function sourceLinePrefix(change: SourceLineChange): string {
  if (change === "added") return "+";
  if (change === "removed") return "-";
  if (change === "modified") return "~";
  return " ";
}

export function sourceLineText(line: SourceViewerLine): string {
  if (line.change === "removed") return line.beforeText ?? "";
  return line.afterText ?? line.beforeText ?? "";
}
