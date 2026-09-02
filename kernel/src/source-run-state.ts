import type {
  CellRunState,
  ProjectedCellRunState,
  ProjectedSourceRunState,
  SourceCompletionOutcome,
  SourceRunState,
} from "./types";

export function initialSourceRunState(id: string): SourceRunState {
  return {
    id,
    lastRequestedToken: null,
    lastCompletedToken: null,
    lastCompletionStatus: null,
    queueRequestedToken: null,
  };
}

export function isSourceInFlight(source: SourceRunState): boolean {
  return source.lastRequestedToken !== null
    && source.lastRequestedToken !== source.lastCompletedToken;
}

export function hasPendingSourceRequest(source: SourceRunState): boolean {
  return source.queueRequestedToken !== null
    && source.queueRequestedToken !== source.lastRequestedToken;
}

export function nextSourceRequestToken(previous: string | null, now = new Date()): string {
  const current = now.toISOString();
  if (previous === null || current > previous) return current;
  return new Date(Date.parse(previous) + 1).toISOString();
}

export function completeSourceRequest(
  source: SourceRunState,
  token: string,
  status: SourceCompletionOutcome,
  detail?: Record<string, import("./types").Json>,
): SourceRunState {
  return {
    ...source,
    lastCompletedToken: token,
    lastCompletionStatus: status === "failure"
      ? {
          status,
          error: structuredClone(detail ?? { error: "Source request failed" }),
        }
      : { status, error: null },
  };
}

export function projectSourceRunState(source: SourceRunState): ProjectedSourceRunState {
  return {
    ...source,
    status: isSourceInFlight(source) ? "running" : "idle",
    hasPendingRequest: hasPendingSourceRequest(source),
    lastRequestFailed: source.lastCompletionStatus?.status === "failure",
  };
}

export function projectCellRunState(cell: CellRunState): ProjectedCellRunState {
  const sources = cell.sources.map(projectSourceRunState);
  return {
    sources,
    numSourcesRunning: sources.filter(({ status }) => status === "running").length,
    sourceErrors: Object.fromEntries(sources.flatMap((source) =>
      source.lastCompletionStatus?.status === "failure"
        ? [[source.id, structuredClone(source.lastCompletionStatus.error ?? {})]]
        : [])),
  };
}