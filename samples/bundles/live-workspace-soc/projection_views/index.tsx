import React from "react";
import { Button, Select, Spinner, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  ArrowReset24Regular,
  BrainCircuit24Regular,
  CheckmarkCircle20Regular,
  Clock20Regular,
  DataTrending24Regular,
  Person24Regular,
  QuestionCircle20Regular,
  ShieldLock24Regular,
  Sparkle24Regular,
  WeatherMoon20Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import {
  SOC_BLUEPRINT_CONTEXTS,
  socBlueprint,
  traceSocBlueprint,
} from "../../../profiles/live-workspace-soc/compile";
import { readSocNavigation, writeSocNavigation, type SocPlane } from "../navigation";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  governance: string;
}

interface Presenter {
  pace: "manual" | "auto";
  durationMs: number;
  locked: boolean;
  advanceToken: number;
}

interface PresentationContext {
  id: string;
  label: string;
  audience: string;
  focus: string;
}

interface Presentation {
  selectedContext: string;
  revision: number;
  contexts: PresentationContext[];
}

interface Actor {
  id: string;
  kind: "human" | "agent";
  name: string;
  role: string;
  status: string;
  objective: string;
  authority: string;
  activity?: string;
}

type ParticipantPresence = "active" | "working" | "waiting" | "input-awaited" | "sleeping" | "complete";

export function participantPresence(status: string): ParticipantPresence {
  switch (status) {
    case "working":
    case "running":
      return "working";
    case "waiting":
    case "queued":
      return "waiting";
    case "needs-review":
    case "input-awaited":
    case "awaiting-input":
      return "input-awaited";
    case "sleeping":
    case "idle":
      return "sleeping";
    case "complete":
    case "completed":
    case "done":
      return "complete";
    default:
      return "active";
  }
}

interface Exploration {
  id: string;
  revision: number;
  status: string;
  question: string;
  windowMinutes: number;
  correlationKey: string;
  safety: string;
}

interface Evidence {
  id: string;
  actorId: string;
  source: string;
  summary: string;
  confidence: number;
}

interface Hypothesis {
  statement: string;
  confidence: number;
}

interface Proposal {
  id: string;
  actorId: string;
  action: string;
  target: string;
  status: string;
  reason?: string;
  fallback?: string;
  sequence?: string[];
  blastRadius?: string;
  payrollDependency?: string;
  reversible?: boolean;
  evidenceReady?: boolean;
}

interface Authorization {
  status: string;
  requiredRole: string;
  actorId?: string;
}

interface JournalEntry {
  id: string;
  time: string;
  actorId: string;
  result: string;
  summary: string;
  affected: string[];
}

export function isCausallyAffected(entry: JournalEntry | undefined, objectIds: readonly string[]): boolean {
  if (!entry) return false;
  const affected = new Set(entry.affected);
  return objectIds.some((id) => affected.has(id));
}

interface ScenarioStep {
  event: string;
  actorId: string;
}

const STEP_DELAY_MS = 760;
const ACT_STEPS: Record<number, ScenarioStep[]> = {
  0: [
    { event: "establishIntent", actorId: "human-morgan" },
    { event: "addConstraint", actorId: "human-priya" },
  ],
  1: [
    { event: "suggestExploration", actorId: "agent-correlation" },
    { event: "amendExploration", actorId: "human-morgan" },
    { event: "replanExploration", actorId: "agent-correlation" },
  ],
  2: [
    { event: "commitPartialFindings", actorId: "agent-correlation" },
    { event: "proposeDc01", actorId: "agent-response" },
    { event: "completeCorrelation", actorId: "agent-correlation" },
  ],
  3: [
    { event: "proposeHostA", actorId: "agent-response" },
    { event: "reviseResponse", actorId: "human-morgan" },
    { event: "calculateResponse", actorId: "agent-response" },
    { event: "recommendContainment", actorId: "human-morgan" },
  ],
};

const ACT_TITLES = [
  "Human intent and constraint",
  "Exploration and reorientation",
  "Correlation and governed overreach",
  "Response refinement",
  "Correct authority and execution",
];

const useStyles = makeStyles({
  workspace: {
    height: "100dvh",
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    overflow: "hidden",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    "@media (max-width: 1040px)": { height: "auto", minHeight: "100dvh", display: "block", overflowY: "auto" },
  },
  commandBar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1fr) auto",
    alignItems: "center",
    gap: tokens.spacingHorizontalL,
    minHeight: "68px",
    padding: `${tokens.spacingVerticalS} clamp(16px, 3vw, 40px)`,
    borderBottom: `1px solid var(--line)`,
    backgroundColor: "var(--panel)",
    "@media (max-width: 880px)": { position: "relative", gridTemplateColumns: "1fr" },
  },
  identity: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, minWidth: 0 },
  identityCopy: { minWidth: 0 },
  eyebrow: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  title: { margin: 0, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, overflowWrap: "anywhere" },
  controls: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS, flexWrap: "wrap", "@media (max-width: 880px)": { justifyContent: "flex-start" } },
  pill: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minHeight: "30px", padding: `0 ${tokens.spacingHorizontalS}`, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  pace: { display: "inline-flex", padding: "2px", gap: "2px", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)" },
  timerSlot: { minWidth: "118px", "& > button": { width: "100%", minHeight: "32px" } },
  actBar: { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: tokens.spacingHorizontalM, padding: `${tokens.spacingVerticalS} clamp(16px, 3vw, 40px)`, borderBottom: `1px solid var(--line)`, backgroundColor: "var(--panel-2)", "@media (max-width: 620px)": { gridTemplateColumns: "1fr" } },
  actNumber: { color: "var(--accent)", fontWeight: tokens.fontWeightBold, textTransform: "uppercase", fontSize: tokens.fontSizeBase100 },
  actTitle: { margin: 0, fontWeight: tokens.fontWeightSemibold },
  actDots: { display: "flex", gap: tokens.spacingHorizontalXS },
  actDot: { width: "24px", height: "4px", backgroundColor: "var(--line)" },
  actDotDone: { backgroundColor: "var(--accent)" },
  layout: { minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 360px)", overflow: "hidden", "@media (max-width: 1040px)": { gridTemplateColumns: "1fr", overflow: "visible" } },
  workColumn: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto" },
  shared: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", margin: `clamp(18px, 3vw, 36px) clamp(16px, 3vw, 40px)`, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)", overflow: "hidden", "@media (max-width: 1040px)": { display: "block" } },
  consoleChrome: { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto minmax(220px, auto)", alignItems: "center", gap: tokens.spacingHorizontalM, minHeight: "44px", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, borderBottom: `1px solid var(--line)`, backgroundColor: "var(--panel-2)", "@media (max-width: 760px)": { gridTemplateColumns: "1fr", alignItems: "start" } },
  consolePath: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0, color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  consoleLights: { display: "inline-flex", gap: "5px", flexShrink: 0 },
  consoleLight: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--line)" },
  consoleLightLive: { backgroundColor: "var(--good)" },
  consoleUri: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  contextSelect: { minWidth: "190px" },
  consoleControls: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  planeSwitch: { display: "inline-flex", padding: "2px", gap: "2px", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  contextMeta: { minWidth: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase100, textAlign: "right", "@media (max-width: 760px)": { textAlign: "left" } },
  contextFocus: { display: "block", color: "var(--text)", overflowWrap: "anywhere" },
  sharedViewport: { minHeight: 0, display: "grid", alignContent: "start", gap: tokens.spacingVerticalL, padding: `clamp(18px, 3vw, 32px)`, overflowY: "auto", "@media (max-width: 1040px)": { overflowY: "visible" } },
  blueprintIntro: { display: "flex", alignItems: "end", justifyContent: "space-between", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  blueprintPipeline: { display: "grid", gap: tokens.spacingVerticalS },
  blueprintStage: { display: "grid", gridTemplateColumns: "minmax(150px, .42fr) minmax(0, 1fr)", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, overflow: "hidden", "@media (max-width: 680px)": { gridTemplateColumns: "1fr" } },
  blueprintStageIdentity: { display: "grid", alignContent: "center", gap: tokens.spacingVerticalXXS, padding: tokens.spacingVerticalM, backgroundColor: "var(--panel-2)", borderRight: `1px solid var(--line)`, "@media (max-width: 680px)": { borderRight: 0, borderBottom: `1px solid var(--line)` } },
  blueprintKind: { color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  blueprintLayer: { fontWeight: tokens.fontWeightSemibold },
  blueprintStageBody: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalM },
  blueprintRecipe: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  blueprintOutput: { margin: 0, color: "var(--text)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase200, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  blueprintResources: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, overflow: "hidden", "@media (max-width: 760px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  blueprintResource: { padding: tokens.spacingVerticalM, borderRight: `1px solid var(--line)`, backgroundColor: "var(--panel-2)" },
  blueprintResourceValue: { display: "block", marginTop: tokens.spacingVerticalXXS, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightBold },
  contextMatrix: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  contextChip: { padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  contextChipActive: { borderTopColor: "var(--accent)", borderRightColor: "var(--accent)", borderBottomColor: "var(--accent)", borderLeftColor: "var(--accent)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--accent) 9%, var(--panel))" },
  sharedHeader: { display: "flex", alignItems: "end", justifyContent: "space-between", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  sharedTitle: { margin: 0, fontSize: tokens.fontSizeBase500 },
  sharedSubhead: { margin: `${tokens.spacingVerticalXXS} 0 0`, color: "var(--muted)" },
  contextRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalM, "@media (max-width: 680px)": { gridTemplateColumns: "1fr" } },
  contextBand: { padding: tokens.spacingVerticalM, borderLeft: `3px solid var(--accent)`, backgroundColor: "var(--panel-2)" },
  causalHighlight: {
    outline: `2px solid var(--accent)`,
    outlineOffset: "2px",
    backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--panel))",
    transitionProperty: "outline-color, background-color",
    transitionDuration: tokens.durationNormal,
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  contextLabel: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  contextText: { margin: `${tokens.spacingVerticalXS} 0 0`, lineHeight: tokens.lineHeightBase300 },
  emptyText: { color: "var(--muted)", fontStyle: "italic" },
  hypothesis: { padding: tokens.spacingVerticalL, ...shorthands.border("1px", "solid", "var(--line)"), borderLeftWidth: "5px", borderLeftColor: "var(--accent)", borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  hypothesisTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  hypothesisLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  confidence: { color: "var(--accent)", fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightBold },
  hypothesisText: { margin: `${tokens.spacingVerticalM} 0 0`, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  split: { display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(260px, .85fr)", gap: tokens.spacingHorizontalL, "@media (max-width: 760px)": { gridTemplateColumns: "1fr" } },
  splitSingle: { gridTemplateColumns: "minmax(0, 1fr)" },
  section: { minWidth: 0 },
  sectionTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase300 },
  explorationList: { display: "grid", gap: tokens.spacingVerticalS },
  exploration: { padding: tokens.spacingVerticalM, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  explorationMuted: { opacity: 0.62 },
  rowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  status: { color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalS, color: "var(--muted)", fontSize: tokens.fontSizeBase100, "@media (max-width: 520px)": { gridTemplateColumns: "1fr" } },
  evidenceList: { display: "grid", gap: tokens.spacingVerticalS },
  evidence: { padding: tokens.spacingVerticalS, borderBottom: `1px solid var(--line)` },
  evidenceMeta: { display: "flex", justifyContent: "space-between", gap: tokens.spacingHorizontalS, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  evidenceText: { margin: `${tokens.spacingVerticalXS} 0 0`, lineHeight: tokens.lineHeightBase200 },
  proposal: { padding: tokens.spacingVerticalL, border: `1px solid var(--line)`, borderLeft: `5px solid var(--accent)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  proposalRejected: { borderLeftColor: "var(--bad)" },
  proposalExecuted: { borderLeftColor: "var(--good)" },
  proposalTitle: { margin: `${tokens.spacingVerticalS} 0`, fontSize: tokens.fontSizeBase400 },
  proposalText: { margin: 0, color: "var(--muted)", lineHeight: tokens.lineHeightBase300 },
  fallback: { marginTop: tokens.spacingVerticalM, padding: tokens.spacingVerticalS, backgroundColor: "var(--panel-2)", borderRadius: tokens.borderRadiusMedium },
  metrics: { display: "flex", gap: tokens.spacingHorizontalM, flexWrap: "wrap", marginTop: tokens.spacingVerticalM, color: "var(--muted)", fontSize: tokens.fontSizeBase200 },
  participants: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", borderTop: `1px solid var(--line)`, backgroundColor: "var(--panel)", "@media (max-width: 880px)": { display: "flex", overflowX: "auto" } },
  participant: { position: "relative", minWidth: 0, padding: tokens.spacingVerticalM, borderRight: `1px solid var(--line)`, "@media (max-width: 880px)": { minWidth: "245px" } },
  participantActive: { backgroundColor: "color-mix(in srgb, var(--accent) 9%, var(--panel))" },
  participantTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  participantName: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, fontWeight: tokens.fontWeightSemibold },
  participantIdentity: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minWidth: 0 },
  presence: { width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--muted)" },
  presenceWorking: { color: "var(--accent)" },
  presenceAttention: { color: "var(--warning, #a15c00)" },
  presenceComplete: { color: "var(--good)" },
  kind: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold },
  role: { marginTop: tokens.spacingVerticalXXS, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  activity: { minHeight: "38px", margin: `${tokens.spacingVerticalS} 0`, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  authority: { color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  authorize: { width: "100%", marginTop: tokens.spacingVerticalS },
  journalRail: { minWidth: 0, borderLeft: `1px solid var(--line)`, backgroundColor: "var(--panel)", "@media (max-width: 1040px)": { borderLeft: 0, borderTop: `1px solid var(--line)` } },
  journalSticky: { height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", "@media (max-width: 1040px)": { height: "520px" } },
  journalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS, padding: tokens.spacingVerticalM, borderBottom: `1px solid var(--line)` },
  journalTabs: { display: "inline-flex", gap: "2px", padding: "2px", backgroundColor: "var(--panel-2)", borderRadius: tokens.borderRadiusMedium },
  journalList: { overflowY: "auto", padding: tokens.spacingVerticalS },
  journalEntry: { width: "100%", display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: tokens.spacingHorizontalS, padding: tokens.spacingVerticalS, border: 0, borderBottom: `1px solid var(--line)`, backgroundColor: "transparent", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", "&:focus-visible": { outline: `2px solid var(--accent)`, outlineOffset: "-2px" } },
  journalEntryActive: { backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)" },
  journalTime: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  journalResult: { color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  journalSummary: { marginTop: tokens.spacingVerticalXXS, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  ledgerMeta: { marginTop: tokens.spacingVerticalXS, color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, overflowWrap: "anywhere" },
  empty: { padding: tokens.spacingVerticalXXL, color: "var(--muted)", textAlign: "center" },
});

function openOverview() {
  const url = new URL(window.location.href);
  url.searchParams.set("bundle", "samples-overview");
  window.location.href = url.toString();
}

function ParticipantPresenceIcon({ status }: { status: string }): React.ReactElement {
  const styles = useStyles();
  const presence = participantPresence(status);
  const className = mergeClasses(
    styles.presence,
    presence === "working" ? styles.presenceWorking : undefined,
    presence === "input-awaited" ? styles.presenceAttention : undefined,
    presence === "complete" ? styles.presenceComplete : undefined
  );

  if (presence === "working") return <span className={className} title="Working"><Spinner size="tiny" /></span>;
  if (presence === "waiting") return <span className={className} title="Waiting"><Clock20Regular /></span>;
  if (presence === "input-awaited") return <span className={className} title="Input awaited"><QuestionCircle20Regular /></span>;
  if (presence === "sleeping") return <span className={className} title="Sleeping"><WeatherMoon20Regular /></span>;
  if (presence === "complete") return <span className={className} title="Complete"><CheckmarkCircle20Regular /></span>;
  return <span className={className} title="Available"><CheckmarkCircle20Regular /></span>;
}

const LiveWorkspaceSoc: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const presenter = node.props.presenter as unknown as Presenter;
  const presentation = node.props.presentation as unknown as Presentation;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const explorations = (node.props.explorations ?? []) as unknown as Exploration[];
  const evidence = (node.props.evidence ?? []) as unknown as Evidence[];
  const hypothesis = node.props.hypothesis as unknown as Hypothesis;
  const proposal = (node.props.proposal ?? null) as unknown as Proposal | null;
  const authorization = (node.props.authorization ?? null) as unknown as Authorization | null;
  const journal = (node.props.journal ?? []) as unknown as JournalEntry[];
  const intent = node.props.intent as unknown as { statement: string } | null;
  const constraints = (node.props.constraints ?? []) as unknown as Array<{ rule: string }>;
  const act = Number(node.props.act ?? 0);
  const stage = String(node.props.stage ?? "Incident opened");
  const [journalMode, setJournalMode] = React.useState<"journal" | "ledger">("journal");
  const [selectedJournalId, setSelectedJournalId] = React.useState<string | null>(null);
  const validContextIds = SOC_BLUEPRINT_CONTEXTS.map((item) => item.id);
  const initialNavigationRef = React.useRef(readSocNavigation(window.location.search, validContextIds));
  const [consolePlane, setConsolePlane] = React.useState<SocPlane>(initialNavigationRef.current.plane);
  const emitRef = React.useRef(emit);
  const processedTokenRef = React.useRef(0);
  const executionRequestedRef = React.useRef(false);
  const initialContextAppliedRef = React.useRef(false);
  emitRef.current = emit;

  const latestEntry = journal[journal.length - 1];
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? latestEntry
    : latestEntry;
  const actorNames = new Map(actors.map((item) => [item.id, item.name]));
  const actDisplay = Math.min(act + (act === 0 ? 1 : 0), 5);
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];
  const showExploration = !["priya-mobile", "priya-laptop", "response-agent"].includes(presentation.selectedContext);
  const showResponse = !["morgan-pager", "morgan-workstation", "correlation-agent"].includes(presentation.selectedContext);
  const blueprintTrace = traceSocBlueprint(presentation.selectedContext);
  const blueprintContext = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === presentation.selectedContext) ?? SOC_BLUEPRINT_CONTEXTS[0];
  const blueprintResources = socBlueprint.resources;
  const blueprintStageSummaries = blueprintTrace.map((item) => {
    const output = item.output as Record<string, unknown>;
    if (item.toKind === "interaction") {
      return `interaction=${String(output.interaction)}\ncapabilities=${JSON.stringify(output.capabilities ?? [])}`;
    }
    if (item.toKind === "presentation") {
      const regions = Array.isArray(output.regions) ? output.regions : [];
      return `layout=${String(output.layout)} · arrangement=${String(output.arrangement)}\nregions=${regions.map((region) => String((region as { name?: string }).name)).join(", ")}`;
    }
    const root = output.root as { capability?: string; edges?: { children?: unknown[] } } | undefined;
    return `root=${root?.capability ?? "unknown"}\nchildren=${root?.edges?.children?.length ?? 0} · terminal document matches bundle`;
  });

  React.useEffect(() => {
    if (initialContextAppliedRef.current) return;
    initialContextAppliedRef.current = true;
    const requestedContext = initialNavigationRef.current.context;
    if (requestedContext && requestedContext !== presentation.selectedContext) {
      emitRef.current("setPresentationContext", { contextId: requestedContext });
    }
  }, []);

  React.useEffect(() => {
    if (presenter.advanceToken === 0) {
      processedTokenRef.current = 0;
      return;
    }
    if (presenter.advanceToken === processedTokenRef.current) return;
    processedTokenRef.current = presenter.advanceToken;
    const steps = ACT_STEPS[act] ?? [];
    const timers = steps.map((step, index) => window.setTimeout(() => {
      emitRef.current(step.event, {}, step.actorId);
    }, index * STEP_DELAY_MS));
    timers.push(window.setTimeout(() => {
      emitRef.current("finishAct", {});
    }, steps.length * STEP_DELAY_MS + 120));
    return () => timers.forEach(window.clearTimeout);
  }, [presenter.advanceToken]);

  React.useEffect(() => {
    if (authorization?.status !== "authorized") {
      executionRequestedRef.current = false;
      return;
    }
    if (executionRequestedRef.current) return;
    executionRequestedRef.current = true;
    const timer = window.setTimeout(() => {
      emitRef.current("executeContainment", {}, "agent-response");
    }, STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [authorization?.status]);

  const reset = () => {
    processedTokenRef.current = 0;
    executionRequestedRef.current = false;
    setSelectedJournalId(null);
    emit("reset", {});
  };

  const selectPlane = (plane: SocPlane) => {
    setConsolePlane(plane);
    window.history.replaceState(null, "", writeSocNavigation(window.location.href, plane, presentation.selectedContext));
  };

  const selectContext = (contextId: string) => {
    emit("setPresentationContext", { contextId });
    window.history.replaceState(null, "", writeSocNavigation(window.location.href, consolePlane, contextId));
  };

  return (
    <main className={styles.workspace}>
      <header className={styles.commandBar}>
        <div className={styles.identity}>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />} aria-label="Return to overview" onClick={openOverview} />
          <div className={styles.identityCopy}>
            <div className={styles.eyebrow}>{incident.id} · Live Workspace : SOC</div>
            <h1 className={styles.title}>{incident.title}</h1>
          </div>
        </div>
        <div className={styles.controls}>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={styles.pill}>{incident.governance}</span>
          <div className={styles.pace} role="group" aria-label="Presenter pace">
            <Button size="small" appearance={presenter.pace === "manual" ? "primary" : "subtle"} onClick={() => emit("setPace", { pace: "manual" })}>Manual</Button>
            <Button size="small" appearance={presenter.pace === "auto" ? "primary" : "subtle"} onClick={() => emit("setPace", { pace: "auto" })}>Auto</Button>
          </div>
          <div className={styles.timerSlot}>{children}</div>
          <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" onClick={reset} />
        </div>
      </header>

      <section className={styles.actBar} aria-live="polite">
        <div className={styles.actNumber}>{incident.status === "Contained" ? "Journey complete" : `Act ${actDisplay} of 5`}</div>
        <p className={styles.actTitle}>{stage === "Incident opened" ? ACT_TITLES[0] : stage}</p>
        <div className={styles.actDots} aria-hidden="true">
          {ACT_TITLES.map((_, index) => <span key={index} className={mergeClasses(styles.actDot, index < act || incident.status === "Contained" ? styles.actDotDone : undefined)} />)}
        </div>
      </section>

      <div className={styles.layout}>
        <div className={styles.workColumn}>
          <section className={styles.shared} aria-label="Shared incident substrate">
            <header className={styles.consoleChrome}>
              <div className={styles.consolePath}>
                <span className={styles.consoleLights} aria-hidden="true">
                  <i className={styles.consoleLight} />
                  <i className={styles.consoleLight} />
                  <i className={mergeClasses(styles.consoleLight, styles.consoleLightLive)} />
                </span>
                <span className={styles.consoleUri}>{consolePlane === "runtime" ? "shared" : "blueprint"}://soc/{consolePlane === "runtime" ? incident.id.toLowerCase() : "live-workspace-soc/profile.json"}</span>
              </div>
              <div className={styles.consoleControls}>
                <div className={styles.planeSwitch} role="group" aria-label="Console plane">
                  <Button size="small" appearance={consolePlane === "runtime" ? "primary" : "subtle"} onClick={() => selectPlane("runtime")}>Runtime</Button>
                  <Button size="small" appearance={consolePlane === "blueprint" ? "primary" : "subtle"} onClick={() => selectPlane("blueprint")}>Blueprint</Button>
                </div>
                <Select
                  className={styles.contextSelect}
                  aria-label="Presentation context"
                  value={presentation.selectedContext}
                  onChange={(_, data) => selectContext(data.value)}
                >
                  {presentation.contexts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </Select>
              </div>
              <div className={styles.contextMeta}>
                {consolePlane === "runtime" ? `projection r${presentation.revision} · ${selectedContext.audience}` : "4 tiers · 3 lowering recipes"}
                <span className={styles.contextFocus}>{consolePlane === "runtime" ? selectedContext.focus : `${blueprintContext.role} · ${blueprintContext.device} · ${blueprintContext.task}`}</span>
              </div>
            </header>
            <div className={styles.sharedViewport}>
            {consolePlane === "blueprint" ? <>
              <header className={styles.blueprintIntro}>
                <div>
                  <div className={styles.eyebrow}>Executable semantic blueprint</div>
                  <h2 className={styles.sharedTitle}>Intent to runnable bundle</h2>
                  <p className={styles.sharedSubhead}>The selected context runs through the same authored tiers and terminal document contract.</p>
                </div>
                <span className={styles.pill}><CheckmarkCircle20Regular />Blueprint and lowering recipes validated</span>
              </header>

              <div className={styles.contextMatrix} aria-label="Authored presentation contexts">
                {SOC_BLUEPRINT_CONTEXTS.map((item) => <span key={item.id} className={mergeClasses(styles.contextChip, item.id === blueprintContext.id ? styles.contextChipActive : undefined)}>{item.id}</span>)}
              </div>

              <section className={styles.blueprintPipeline} aria-label="Blueprint lowering trace">
                {blueprintTrace.map((item, index) => <article className={styles.blueprintStage} key={`${item.fromLayerId}-${item.toLayerId}`}>
                  <div className={styles.blueprintStageIdentity}>
                    <span className={styles.blueprintKind}>{item.fromKind} → {item.toKind}</span>
                    <span className={styles.blueprintLayer}>{item.fromLayerId} → {item.toLayerId}</span>
                  </div>
                  <div className={styles.blueprintStageBody}>
                    <span className={styles.blueprintRecipe}>{socBlueprint.stages[index].recipe.id} · {String(socBlueprint.stages[index].recipe.metadata?.executor)}</span>
                    <pre className={styles.blueprintOutput}>{blueprintStageSummaries[index]}</pre>
                  </div>
                </article>)}
              </section>

              <section>
                <h3 className={styles.sectionTitle}>Blueprint-owned resources</h3>
                <div className={styles.blueprintResources}>
                  <div className={styles.blueprintResource}>Actors<span className={styles.blueprintResourceValue}>{(blueprintResources.actors as unknown[]).length}</span></div>
                  <div className={styles.blueprintResource}>Narrative acts<span className={styles.blueprintResourceValue}>{(blueprintResources.acts as unknown[]).length}</span></div>
                  <div className={styles.blueprintResource}>Projection contexts<span className={styles.blueprintResourceValue}>{SOC_BLUEPRINT_CONTEXTS.length}</span></div>
                  <div className={styles.blueprintResource}>Authority rule<span className={styles.blueprintResourceValue}>{String((blueprintResources.authorityPolicy as { requiredRole: string }).requiredRole)}</span></div>
                </div>
              </section>
            </> : <>
            <header className={styles.sharedHeader}>
              <div>
                <div className={styles.eyebrow}>One governed operational state</div>
                <h2 className={styles.sharedTitle}>Shared investigation</h2>
                <p className={styles.sharedSubhead}>Every contribution changes or challenges the same incident record.</p>
              </div>
              <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
            </header>

            <div className={styles.contextRow}>
              <div data-soc-object-id="intent" className={mergeClasses(styles.contextBand, isCausallyAffected(selectedEntry, ["intent"]) ? styles.causalHighlight : undefined)}>
                <div className={styles.contextLabel}>Morgan's intent</div>
                <p className={mergeClasses(styles.contextText, !intent ? styles.emptyText : undefined)}>{intent?.statement ?? "Waiting for the analyst to establish intent"}</p>
              </div>
              <div data-soc-object-id="constraints" className={mergeClasses(styles.contextBand, isCausallyAffected(selectedEntry, ["constraints", "DC-01"]) ? styles.causalHighlight : undefined)}>
                <div className={styles.contextLabel}>Priya's operating constraint</div>
                <p className={mergeClasses(styles.contextText, constraints.length === 0 ? styles.emptyText : undefined)}>{constraints[0]?.rule ?? "Waiting for incident-command constraints"}</p>
              </div>
            </div>

            <article data-soc-object-id="hypothesis" className={mergeClasses(styles.hypothesis, isCausallyAffected(selectedEntry, ["hypothesis", "corr-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
              <div className={styles.hypothesisTop}>
                <div className={styles.hypothesisLabel}><BrainCircuit24Regular />Working hypothesis</div>
                <div className={styles.confidence}>{hypothesis.confidence}%</div>
              </div>
              <p className={styles.hypothesisText}>{hypothesis.statement}</p>
            </article>

            <div className={mergeClasses(styles.split, showExploration && showResponse ? undefined : styles.splitSingle)}>
              {showExploration ? <section className={styles.section}>
                <h3 className={styles.sectionTitle}><Sparkle24Regular />Exploration and evidence</h3>
                {explorations.length > 0 ? <div className={styles.explorationList}>{explorations.map((item) => (
                  <article data-soc-object-id={item.id} key={item.id} className={mergeClasses(styles.exploration, item.status === "superseded" ? styles.explorationMuted : undefined, isCausallyAffected(selectedEntry, [item.id]) ? styles.causalHighlight : undefined)}>
                    <div className={styles.rowTop}><strong>Revision {item.revision}</strong><span className={styles.status}>{item.status}</span></div>
                    <div className={styles.detailGrid}><span>{item.windowMinutes} minute window</span><span>{item.correlationKey}</span><span>{item.safety}</span></div>
                  </article>
                ))}</div> : <div className={styles.empty}>No exploration proposed yet.</div>}
                {evidence.length > 0 ? <div className={styles.evidenceList}>{evidence.map((item) => (
                  <article data-soc-object-id={item.id} className={mergeClasses(styles.evidence, isCausallyAffected(selectedEntry, ["evidence", item.id]) ? styles.causalHighlight : undefined)} key={item.id}>
                    <div className={styles.evidenceMeta}><span>{item.source}</span><span>{item.confidence}%</span></div>
                    <p className={styles.evidenceText}>{item.summary}</p>
                  </article>
                ))}</div> : null}
              </section> : null}

              {showResponse ? <section className={styles.section}>
                <h3 className={styles.sectionTitle}><ShieldLock24Regular />Governed response</h3>
                {proposal ? <article data-soc-object-id={proposal.id} className={mergeClasses(styles.proposal, proposal.status === "rejected" ? styles.proposalRejected : undefined, proposal.status === "executed" ? styles.proposalExecuted : undefined, isCausallyAffected(selectedEntry, [proposal.id, "proposal-dc01", "proposal-host-a", "rec-1", "authorization", "DC-01", "Host-A"]) ? styles.causalHighlight : undefined)}>
                  <div className={styles.rowTop}><span className={styles.status}>{proposal.status}</span><span>{proposal.target}</span></div>
                  <h4 className={styles.proposalTitle}>{proposal.action}</h4>
                  {proposal.reason ? <p className={styles.proposalText}>{proposal.reason}</p> : null}
                  {proposal.fallback ? <div className={styles.fallback}><strong>Safe fallback applied</strong><br />{proposal.fallback}</div> : null}
                  {proposal.sequence ? <p className={styles.proposalText}>{proposal.sequence.join(" → ")}</p> : null}
                  {proposal.blastRadius ? <div className={styles.metrics}><span>Blast radius: {proposal.blastRadius}</span><span>Payroll: {proposal.payrollDependency}</span><span>{proposal.reversible ? "Reversible" : "Irreversible"}</span></div> : null}
                </article> : <div className={styles.empty}>Response is holding until evidence supports a bounded action.</div>}
              </section> : null}
            </div>
            </>}
            </div>
          </section>

          <section className={styles.participants} aria-label="Human and agent participants">
            {actors.map((item) => {
              const active = selectedEntry?.actorId === item.id;
              const canAuthorize = item.id === "human-priya" && authorization?.status === "pending";
              return <article data-soc-actor-id={item.id} key={item.id} className={mergeClasses(styles.participant, active ? styles.participantActive : undefined, active ? styles.causalHighlight : undefined)}>
                <div className={styles.participantTop}>
                  <div className={styles.participantIdentity}>
                    <ParticipantPresenceIcon status={canAuthorize ? "input-awaited" : item.status} />
                    <div className={styles.participantName}>{item.kind === "human" ? <Person24Regular /> : <Sparkle24Regular />}{item.name}</div>
                  </div>
                  <span className={styles.kind}>{item.kind.toUpperCase()}</span>
                </div>
                <div className={styles.role}>{item.role} · {canAuthorize ? "input awaited" : item.status.replaceAll("-", " ")}</div>
                <p className={styles.activity}>{item.activity ?? item.objective}</p>
                <div className={styles.authority}>{item.authority}</div>
                {canAuthorize ? <Button className={styles.authorize} appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
              </article>;
            })}
          </section>
        </div>

        <aside className={styles.journalRail} aria-label="Journal and ledger">
          <div className={styles.journalSticky}>
            <header className={styles.journalHeader}>
              <div><div className={styles.eyebrow}>Causal record</div><strong>Journal / Ledger</strong></div>
              <div className={styles.journalTabs}>
                {selectedJournalId ? <Button size="small" appearance="subtle" onClick={() => setSelectedJournalId(null)}>Latest</Button> : null}
                <Button size="small" appearance={journalMode === "journal" ? "primary" : "subtle"} onClick={() => setJournalMode("journal")}>Journal</Button>
                <Button size="small" appearance={journalMode === "ledger" ? "primary" : "subtle"} onClick={() => setJournalMode("ledger")}>Ledger</Button>
              </div>
            </header>
            <div className={styles.journalList}>
              {journal.length === 0 ? <div className={styles.empty}><Clock20Regular /><p>The first attributable action will appear here.</p></div> : journal.map((item) => (
                <button type="button" aria-pressed={selectedEntry?.id === item.id} aria-label={`${item.result}: ${item.summary}`} onClick={() => setSelectedJournalId(item.id)} key={item.id} className={mergeClasses(styles.journalEntry, selectedEntry?.id === item.id ? styles.journalEntryActive : undefined)}>
                  <span className={styles.journalTime}>{item.time}</span>
                  <div>
                    <div className={styles.journalResult}>{item.result} · {actorNames.get(item.actorId) ?? item.actorId}</div>
                    <div className={styles.journalSummary}>{item.summary}</div>
                    {journalMode === "ledger" ? <div className={styles.ledgerMeta}>actor={item.actorId}<br />affected={item.affected.join(", ")}</div> : null}
                  </div>
                </button>
              ))}
              {incident.status === "Contained" ? <div className={styles.fallback}><CheckmarkCircle20Regular /> <strong>Host-A contained under commander authority.</strong></div> : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default { workspace: LiveWorkspaceSoc };