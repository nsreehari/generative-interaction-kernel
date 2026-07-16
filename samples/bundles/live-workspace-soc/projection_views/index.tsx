import React from "react";
import { Button, Input, Select, Spinner, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  ArrowReset24Regular,
  BrainCircuit24Regular,
  CheckmarkCircle20Regular,
  ChevronDown20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  ChevronUp20Regular,
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
  compileSocPresentation,
  SOC_BLUEPRINT_CONTEXTS,
  socBlueprint,
  traceSocBlueprint,
} from "../../../profiles/live-workspace-soc/compile";
import { demoCatalog, resolveDemoComposition } from "../../../scenarios/catalog";
import {
  nextScenarioStep,
  selectionContainsFocus,
  selectionFromTimelineItem,
  writeDemoNavigation,
  type DemoSelection,
  type FocusRef,
  type TimelineItem,
} from "../../../shared/demo-runner";
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

type SubstrateRegion = "summary" | "intent" | "constraints" | "hypothesis" | "exploration" | "evidence" | "agent-request" | "response" | "authorization" | "causal-record";

export interface SocPresentationSpec {
  frame: "shared" | "mobile" | "laptop" | "pager" | "workstation" | "agent-console";
  arrangement: "war-room" | "inspection" | "decision" | "command" | "glanceable" | "investigation" | "agent";
  regions: SubstrateRegion[];
}

export function socPresentationSpec(contextId: string): SocPresentationSpec {
  const context = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === contextId) ?? SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === "war-room");
  if (!context) throw new Error("The SOC blueprint must define a war-room presentation context");
  const presentation = compileSocPresentation(context.id);
  return {
    frame: context.frame as SocPresentationSpec["frame"],
    arrangement: presentation.arrangement as SocPresentationSpec["arrangement"],
    regions: presentation.regions
      .filter((region) => region.disclosure !== "omitted" && region.materialize === false)
      .map((region) => region.name as SubstrateRegion),
  };
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

interface AgentProvider {
  mode: "mock" | "live";
  status: string;
  agentName: string;
  conversationId: string;
  responseId: string;
  lastProvider: "mock" | "live";
  fallbackReason: string;
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

export interface JournalEntry {
  id: string;
  time: string;
  actorId: string;
  result: string;
  summary: string;
  affected: string[];
  provider?: "mock" | "live";
  agentName?: string;
  conversationId?: string;
  responseId?: string;
  fallbackReason?: string;
}

function socFocusRef(kind: FocusRef["kind"], id: string, relation?: FocusRef["relation"]): FocusRef {
  return { namespace: "soc", kind, id, relation };
}

export function socJournalTimelineItem(entry: JournalEntry): TimelineItem {
  const actorRef = socFocusRef("actor", entry.actorId, "origin");
  return {
    id: entry.id,
    source: "organism",
    title: entry.result,
    summary: entry.summary,
    status: entry.result,
    operationRecordId: entry.id,
    timestamp: entry.time,
    actorRef,
    focusRefs: [
      actorRef,
      ...entry.affected.map((id) => socFocusRef("record", id, "affected")),
    ],
  };
}

export function socJournalSelection(entry: JournalEntry | undefined): DemoSelection | undefined {
  return entry ? selectionFromTimelineItem(socJournalTimelineItem(entry)) : undefined;
}

export function isCausallyAffected(entry: JournalEntry | undefined, objectIds: readonly string[]): boolean {
  return selectionContainsFocus(
    socJournalSelection(entry),
    objectIds.map((id) => socFocusRef("record", id))
  );
}

export function isActorSelected(entry: JournalEntry | undefined, actorId: string): boolean {
  return selectionContainsFocus(
    socJournalSelection(entry),
    [socFocusRef("actor", actorId)]
  );
}

const useStyles = makeStyles({
  workspace: {
    height: "100dvh",
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
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
  runnerDrawer: { position: "fixed", top: tokens.spacingVerticalM, right: "clamp(16px, 3vw, 40px)", zIndex: 40, border: "1px solid rgba(126, 91, 45, .3)", borderRadius: tokens.borderRadiusMedium, backgroundColor: "rgba(255, 235, 202, .58)", boxShadow: "0 16px 42px rgba(92, 65, 30, .16)", backdropFilter: "blur(12px) saturate(120%)", overflow: "hidden", transitionProperty: "width", transitionDuration: tokens.durationNormal, transitionTimingFunction: tokens.curveEasyEase },
  runnerDrawerCollapsed: { width: "auto" },
  runnerDrawerExpanded: { width: "min(1320px, calc(100vw - 80px))" },
  runnerDrawerHeader: { minHeight: "64px", display: "grid", gridTemplateColumns: "auto minmax(260px, 1fr) minmax(250px, auto) auto auto", alignItems: "center", gap: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalS, backgroundColor: "transparent" },
  runnerDrawerHeaderCollapsed: { gridTemplateColumns: "auto auto", gap: 0 },
  runnerDrawerToggle: { alignSelf: "stretch", minWidth: 0, display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, border: 0, backgroundColor: "transparent", color: "var(--text)", font: "inherit", textAlign: "left", cursor: "pointer", "&:hover": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" }, "&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: "-2px" } },
  runnerCollapsedAct: { whiteSpace: "nowrap", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  runnerDrawerTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  runnerControls: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS, whiteSpace: "nowrap" },
  demoMode: { display: "inline-flex", padding: "2px", gap: "2px", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)" },
  viewpointControl: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  viewpointLabel: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  pill: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minHeight: "30px", padding: `0 ${tokens.spacingHorizontalS}`, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)", fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  pace: { display: "inline-flex", padding: "2px", gap: "2px", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)" },
  timerSlot: { minWidth: "118px", paddingRight: tokens.spacingHorizontalS, "& > button": { width: "100%", minHeight: "32px" } },
  timerSlotCompact: { minWidth: "54px", paddingLeft: tokens.spacingHorizontalXS, "& .gx-timer-label": { display: "none" }, "& .gx-timer-separator": { display: "none" }, "& > button": { minWidth: "46px", width: "auto", paddingLeft: tokens.spacingHorizontalS, paddingRight: tokens.spacingHorizontalS } },
  actBar: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXXS },
  actNumber: { color: "var(--accent)", fontWeight: tokens.fontWeightBold, textTransform: "uppercase", fontSize: tokens.fontSizeBase100 },
  actTitle: { margin: 0, fontWeight: tokens.fontWeightSemibold },
  actDots: { display: "flex", gap: tokens.spacingHorizontalXS },
  actDot: { width: "12px", height: "4px", backgroundColor: "var(--line)" },
  actDotDone: { backgroundColor: "var(--accent)" },
  layout: { minHeight: 0, height: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 360px)", gridTemplateRows: "minmax(0, 1fr)", overflow: "hidden", "@media (max-width: 1040px)": { height: "auto", gridTemplateColumns: "1fr", gridTemplateRows: "auto", overflow: "visible" } },
  workColumn: { minWidth: 0, minHeight: 0, height: "100%", padding: `clamp(18px, 3vw, 36px) clamp(16px, 3vw, 40px)`, overflow: "hidden", "@media (max-width: 1040px)": { height: "auto", padding: `clamp(18px, 3vw, 36px) clamp(16px, 3vw, 40px)`, overflow: "visible" } },
  shared: { minWidth: 0, minHeight: 0, height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", border: `1px solid color-mix(in srgb, var(--accent) 24%, var(--line))`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "color-mix(in srgb, var(--accent) 7%, var(--panel))", boxShadow: "0 10px 28px color-mix(in srgb, var(--accent) 8%, transparent)", overflow: "hidden", "@media (max-width: 1040px)": { height: "auto", display: "block" } },
  consoleChrome: { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, auto)", alignItems: "center", gap: tokens.spacingHorizontalM, minHeight: "44px", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`, borderBottom: `1px solid color-mix(in srgb, var(--accent) 22%, var(--line))`, backgroundColor: "color-mix(in srgb, var(--accent) 11%, var(--panel))", "@media (max-width: 760px)": { gridTemplateColumns: "1fr", alignItems: "start" } },
  consolePath: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0, color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  consoleLights: { display: "inline-flex", gap: "5px", flexShrink: 0 },
  consoleLight: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--line)" },
  consoleLightLive: { backgroundColor: "var(--good)" },
  consoleUri: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  contextSelect: { minWidth: "190px" },
  contextMeta: { minWidth: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase100, textAlign: "right", "@media (max-width: 760px)": { textAlign: "left" } },
  contextFocus: { display: "block", color: "var(--text)", overflowWrap: "anywhere" },
  sharedViewport: { minHeight: 0, display: "grid", alignContent: "start", gap: tokens.spacingVerticalL, padding: `clamp(18px, 3vw, 32px)`, paddingBottom: "calc(clamp(18px, 3vw, 32px) + 50px)", scrollPaddingBottom: "50px", overflowY: "auto", "@media (max-width: 1040px)": { overflowY: "visible" } },
  contextProjection: { width: "100%", minWidth: 0, display: "grid", alignContent: "start", gap: tokens.spacingVerticalL, margin: "0 auto" },
  frameMobile: { maxWidth: "430px", padding: tokens.spacingVerticalL, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusLarge, backgroundColor: "var(--panel)", boxShadow: "0 16px 38px rgba(15, 23, 42, .16)" },
  frameLaptop: { maxWidth: "920px", padding: tokens.spacingVerticalL, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  framePager: { maxWidth: "540px", padding: tokens.spacingVerticalM, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  frameWorkstation: { maxWidth: "1100px" },
  frameAgent: { maxWidth: "920px", padding: tokens.spacingVerticalL, borderLeft: `3px solid var(--accent)`, backgroundColor: "color-mix(in srgb, var(--panel) 88%, transparent)" },
  agentEnvelope: { display: "grid", gap: tokens.spacingVerticalM },
  agentEnvelopeSection: { display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", border: `1px solid var(--line)`, backgroundColor: "var(--panel)", "@media (max-width: 680px)": { gridTemplateColumns: "1fr" } },
  agentEnvelopeLabel: { display: "grid", alignContent: "start", gap: tokens.spacingVerticalXXS, padding: tokens.spacingVerticalM, borderRight: `1px solid var(--line)`, backgroundColor: "var(--panel-2)", "@media (max-width: 680px)": { borderRight: 0, borderBottom: `1px solid var(--line)` } },
  agentEnvelopeStep: { color: "var(--accent)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  agentEnvelopeBody: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalS, padding: tokens.spacingVerticalM },
  agentEnvelopeTitle: { margin: 0, fontSize: tokens.fontSizeBase300 },
  agentEnvelopeText: { margin: 0, color: "var(--muted)", lineHeight: tokens.lineHeightBase300 },
  agentEnvelopeMeta: { display: "flex", gap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  agentEnvelopeChip: { padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusSmall, color: "var(--text)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  agentEnvelopeOutcome: { borderLeft: `4px solid var(--good)` },
  viewpointIdentity: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM, paddingBottom: tokens.spacingVerticalS, borderBottom: `1px solid var(--line)` },
  viewpointName: { margin: 0, fontSize: tokens.fontSizeBase300 },
  viewpointDevice: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, textTransform: "uppercase" },
  blueprintIntro: { display: "flex", alignItems: "end", justifyContent: "space-between", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  blueprintPipeline: { display: "grid", gap: tokens.spacingVerticalS },
  blueprintStage: { display: "grid", gridTemplateColumns: "minmax(150px, .42fr) minmax(0, 1fr)", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, overflow: "hidden", "@media (max-width: 680px)": { gridTemplateColumns: "1fr" } },
  blueprintStageIdentity: { display: "grid", alignContent: "center", gap: tokens.spacingVerticalXXS, padding: tokens.spacingVerticalM, backgroundColor: "var(--panel-2)", borderRight: `1px solid var(--line)`, "@media (max-width: 680px)": { borderRight: 0, borderBottom: `1px solid var(--line)` } },
  blueprintKind: { color: "var(--accent)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightBold, textTransform: "uppercase" },
  blueprintLayer: { fontWeight: tokens.fontWeightSemibold },
  blueprintStageBody: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalM },
  blueprintRecipe: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  blueprintOutput: { margin: 0, color: "var(--text)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, lineHeight: tokens.lineHeightBase200, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  blueprintContextContract: { display: "grid", gridTemplateColumns: "minmax(180px, .38fr) minmax(0, 1fr)", border: `1px solid var(--line)`, borderLeft: `4px solid var(--accent)`, backgroundColor: "var(--panel)", "@media (max-width: 680px)": { gridTemplateColumns: "1fr" } },
  blueprintContextIdentity: { display: "grid", alignContent: "center", gap: tokens.spacingVerticalXXS, padding: tokens.spacingVerticalM, backgroundColor: "var(--panel-2)" },
  blueprintContextBody: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacingHorizontalM, padding: tokens.spacingVerticalM, "@media (max-width: 760px)": { gridTemplateColumns: "1fr" } },
  blueprintContextField: { minWidth: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  blueprintContextValue: { display: "block", marginTop: tokens.spacingVerticalXXS, color: "var(--text)", fontFamily: tokens.fontFamilyMonospace, overflowWrap: "anywhere" },
  blueprintContextRegions: { gridColumn: "1 / -1" },
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
  contextRowSingle: { gridTemplateColumns: "minmax(0, 1fr)" },
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
  participantDrawer: { position: "fixed", left: "clamp(16px, 3vw, 40px)", right: "clamp(376px, 27vw, 410px)", bottom: tokens.spacingVerticalL, zIndex: 30, border: "1px solid color-mix(in srgb, #a15c00 34%, var(--line))", borderRadius: tokens.borderRadiusMedium, backgroundColor: "color-mix(in srgb, var(--panel) 96%, transparent)", boxShadow: "0 18px 48px rgba(15, 23, 42, .22)", backdropFilter: "blur(14px)", overflow: "hidden", "@media (max-width: 1040px)": { right: "64px" }, "@media (max-width: 620px)": { left: "16px", right: "16px", bottom: "16px" } },
  participantDrawerToggle: { width: "100%", minHeight: "46px", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: tokens.spacingHorizontalM, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, border: 0, borderLeft: "4px solid #a15c00", backgroundColor: "color-mix(in srgb, #f2c97d 24%, var(--panel))", color: "var(--text)", font: "inherit", textAlign: "left", cursor: "pointer", "&:hover": { backgroundColor: "color-mix(in srgb, #f2c97d 32%, var(--panel))" }, "&:focus-visible": { outline: "2px solid #a15c00", outlineOffset: "-2px" }, "@media (max-width: 620px)": { gridTemplateColumns: "minmax(0, 1fr) auto" } },
  participantDrawerTitle: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, fontWeight: tokens.fontWeightSemibold },
  participantSummaries: { minWidth: 0, display: "flex", justifyContent: "center", gap: tokens.spacingHorizontalL, overflow: "hidden", "@media (max-width: 620px)": { display: "none" } },
  participantSummary: { minWidth: 0, display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS, color: "var(--muted)", fontSize: tokens.fontSizeBase100, whiteSpace: "nowrap" },
  participantSummaryName: { color: "var(--text)", fontWeight: tokens.fontWeightSemibold },
  participants: { minWidth: 0, maxHeight: "280px", display: "grid", gridTemplateColumns: "minmax(0, .85fr) minmax(0, .85fr) minmax(0, 1.15fr) minmax(0, 1.15fr)", borderTop: `1px solid var(--line)`, backgroundColor: "var(--panel)", overflowY: "auto", "@media (max-width: 880px)": { display: "flex", overflowX: "auto" } },
  participant: { position: "relative", minWidth: 0, padding: tokens.spacingVerticalS, borderRight: `1px solid var(--line)`, "@media (max-width: 880px)": { minWidth: "245px" } },
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
  providerControls: { display: "grid", gap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalS, paddingTop: tokens.spacingVerticalS, borderTop: `1px solid var(--line)` },
  providerHeader: { display: "grid", gap: tokens.spacingVerticalXS },
  providerMode: { width: "100%", display: "flex", padding: "2px", gap: "2px", border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel-2)", "& > button": { flex: 1 } },
  providerName: { color: "var(--muted)", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  providerStatus: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, overflowWrap: "anywhere" },
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
  const requestedDemoId = new URLSearchParams(window.location.search).get("demo");
  const runnerEnabled = requestedDemoId !== null;
  const incident = node.props.incident as unknown as Incident;
  const presenter = (node.props.presenter ?? {
    pace: "manual",
    durationMs: 120000,
    locked: false,
    advanceToken: 0,
  }) as unknown as Presenter;
  const presentation = node.props.presentation as unknown as Presentation;
  const actors = (node.props.actors ?? []) as unknown as Actor[];
  const agentProviders = (node.props.agentProviders ?? {}) as unknown as Record<string, AgentProvider>;
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
  const [runnerExpanded, setRunnerExpanded] = React.useState(true);
  const [participantsExpanded, setParticipantsExpanded] = React.useState(false);
  const [activeAgentId, setActiveAgentId] = React.useState<string | null>(null);
  const validContextIds = SOC_BLUEPRINT_CONTEXTS.map((item) => item.id);
  const initialNavigationRef = React.useRef(readSocNavigation(window.location.search, validContextIds));
  const demoComposition = resolveDemoComposition(requestedDemoId);
  const scenarioPlan = demoComposition.scenarioPlan;
  const actTitles = scenarioPlan.steps.map((step) => step.title);
  const [consolePlane, setConsolePlane] = React.useState<SocPlane>(initialNavigationRef.current.plane);
  const emitRef = React.useRef(emit);
  const processedTokenRef = React.useRef(0);
  const initialContextAppliedRef = React.useRef(false);
  emitRef.current = emit;

  const latestEntry = journal[journal.length - 1];
  const selectedEntry = selectedJournalId
    ? journal.find((item) => item.id === selectedJournalId) ?? latestEntry
    : latestEntry;
  const actorNames = new Map(actors.map((item) => [item.id, item.name]));
  const actDisplay = Math.min(act + 1, actTitles.length);
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];
  const presentationSpec = socPresentationSpec(presentation.selectedContext);
  const hasRegion = (region: SubstrateRegion) => presentationSpec.regions.includes(region);
  const showInvestigation = hasRegion("exploration") || hasRegion("evidence");
  const showResponse = hasRegion("response");
  const projectionFrameClass = presentationSpec.frame === "mobile" ? styles.frameMobile
    : presentationSpec.frame === "laptop" ? styles.frameLaptop
    : presentationSpec.frame === "pager" ? styles.framePager
    : presentationSpec.frame === "workstation" ? styles.frameWorkstation
    : presentationSpec.frame === "agent-console" ? styles.frameAgent
    : undefined;
  const regionOrder = (...regions: SubstrateRegion[]) => Math.min(...regions.map((region) => {
    const index = presentationSpec.regions.indexOf(region);
    return index < 0 ? 50 : index;
  }));
  const blueprintTrace = traceSocBlueprint(presentation.selectedContext);
  const blueprintContext = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === presentation.selectedContext) ?? SOC_BLUEPRINT_CONTEXTS[0];
  const blueprintPresentation = blueprintTrace[1].output as { layout: string; arrangement: string; regions: Array<{ name: string; group?: string; priority: string; disclosure: string; presentation?: string; materialize?: boolean }> };
  const blueprintRegions = blueprintPresentation.regions.filter((region) => region.disclosure !== "omitted" && region.presentation !== "presenter-control");
  const selectedAgent = actors.find((actor) => actor.id === blueprintContext.actor);
  const selectedAgentEntries = selectedAgent ? journal.filter((entry) => entry.actorId === selectedAgent.id) : [];
  const latestAgentEntry = selectedAgentEntries.at(-1);
  const agentRegions = (group: string) => blueprintRegions.filter((region) => region.group === group).map((region) => region.name);
  const agentRequest = presentation.selectedContext === "correlation-agent"
    ? explorations.at(-1)?.question ?? selectedAgent?.objective ?? "Awaiting an investigation task"
    : proposal ? `Prepare and govern ${proposal.action} for ${proposal.target}` : selectedAgent?.objective ?? "Awaiting a response-planning task";
  const agentResponse = presentation.selectedContext === "correlation-agent"
    ? evidence.filter((item) => item.actorId === "agent-correlation").at(-1)?.summary ?? selectedAgent?.activity ?? "No evidence contribution submitted yet."
    : proposal ? `${proposal.status}: ${proposal.action} for ${proposal.target}` : selectedAgent?.activity ?? "No response proposal submitted yet.";
  const blueprintResources = socBlueprint.resources;
  const blueprintStageSummaries = blueprintTrace.map((item) => {
    const output = item.output as Record<string, unknown>;
    if (item.toKind === "interaction") {
      return `interaction=${String(output.interaction)}\ncapabilities=${JSON.stringify(output.capabilities ?? [])}`;
    }
    if (item.toKind === "presentation") {
      const regions = Array.isArray(output.regions) ? output.regions : [];
      const visible = regions.filter((region) => (region as { disclosure?: string }).disclosure !== "omitted" && (region as { presentation?: string }).presentation !== "presenter-control");
      return `layout=${String(output.layout)} · arrangement=${String(output.arrangement)}\nprojection-frame=${blueprintContext.frame}\nreading-order=${visible.map((region) => String((region as { name?: string }).name)).join(" → ")}\ngroups=${[...new Set(visible.map((region) => String((region as { group?: string }).group ?? "ungrouped")))].join(" → ")}\nfacet-policy=${visible.map((region) => { const facet = region as { name?: string; group?: string; priority?: string; disclosure?: string }; return `${facet.name}[${facet.group ?? "ungrouped"}/${facet.priority}/${facet.disclosure}]`; }).join(", ")}`;
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
    if (!runnerEnabled) return;
    if (presenter.advanceToken === 0) {
      processedTokenRef.current = 0;
      return;
    }
    if (presenter.advanceToken === processedTokenRef.current) return;
    processedTokenRef.current = presenter.advanceToken;
    const nextAct = nextScenarioStep(scenarioPlan, {
      stepIndex: act,
      advanceToken: presenter.advanceToken,
    });
    if (!nextAct || nextAct.kind !== "dispatch" || !nextAct.command) return;
    const actorId = nextAct.actorRef?.id;
    let cancelled = false;
    let finishTimer: number | undefined;
    void (async () => {
      if (actorId?.startsWith("agent-")) setActiveAgentId(actorId);
      try {
        await Promise.resolve(emitRef.current(nextAct.command!, {}, actorId));
      } finally {
        if (!cancelled) setActiveAgentId(null);
      }
      if (cancelled) return;
      await new Promise<void>((resolve) => {
        finishTimer = window.setTimeout(resolve, nextAct.waitAfterMs ?? 0);
      });
      if (!cancelled) await Promise.resolve(emitRef.current("finishAct", {}));
    })();
    return () => {
      cancelled = true;
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [presenter.advanceToken, runnerEnabled]);

  const reset = () => {
    processedTokenRef.current = 0;
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

  const selectDemo = (demoId: string) => {
    const entry = resolveDemoComposition(demoId).entry;
    window.location.assign(writeDemoNavigation(window.location.href, entry));
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
          <div className={styles.demoMode} role="group" aria-label="Workspace mode">
            <Button size="small" appearance={consolePlane === "runtime" ? "primary" : "subtle"} onClick={() => selectPlane("runtime")}>Live workspace</Button>
            <Button size="small" appearance={consolePlane === "blueprint" ? "primary" : "subtle"} onClick={() => selectPlane("blueprint")}>Blueprint inspector</Button>
          </div>
          <label className={styles.viewpointControl}>
            <span className={styles.viewpointLabel}>View as</span>
            <Select
              className={styles.contextSelect}
              aria-label="View shared substrate as"
              value={presentation.selectedContext}
              onChange={(_, data) => selectContext(data.value)}
            >
              {presentation.contexts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </label>
          <span className={styles.pill}><ShieldLock24Regular />{incident.severity} · {incident.status}</span>
          <span className={styles.pill}>{incident.governance}</span>
        </div>
      </header>

      {runnerEnabled ? <aside className={mergeClasses(styles.runnerDrawer, runnerExpanded ? styles.runnerDrawerExpanded : styles.runnerDrawerCollapsed)} aria-label="Scenario runner">
        <div className={mergeClasses(styles.runnerDrawerHeader, !runnerExpanded ? styles.runnerDrawerHeaderCollapsed : undefined)}>
          <button
            type="button"
            className={styles.runnerDrawerToggle}
            aria-expanded={runnerExpanded}
            onClick={() => setRunnerExpanded((expanded) => !expanded)}
          >
            {runnerExpanded ? <ChevronRight20Regular /> : <ChevronLeft20Regular />}
            {runnerExpanded
              ? <span className={styles.runnerDrawerTitle}><DataTrending24Regular />Scenario runner</span>
              : <span className={styles.runnerCollapsedAct}>Act {actDisplay} of {actTitles.length}</span>}
          </button>
          {runnerExpanded ? <section className={styles.actBar} aria-live="polite">
            <div className={styles.actNumber}>{incident.status === "Contained" ? "Journey complete" : `Act ${actDisplay} of ${actTitles.length}`}</div>
            <p className={styles.actTitle}>{incident.status === "Contained" ? stage : actTitles[act]}</p>
            <div className={styles.actDots} aria-hidden="true">
              {actTitles.map((_, index) => <span key={index} className={mergeClasses(styles.actDot, index < act || incident.status === "Contained" ? styles.actDotDone : undefined)} />)}
            </div>
          </section> : null}
          {runnerExpanded ? <label className={styles.viewpointControl}>
            <span className={styles.viewpointLabel}>Demo</span>
            <Select
              className={styles.contextSelect}
              aria-label="Select demo Blueprint"
              value={demoComposition.entry.id}
              onChange={(_, data) => selectDemo(data.value)}
            >
              {demoCatalog.entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </Select>
          </label> : null}
          {runnerExpanded ? <div className={styles.runnerControls}>
            <div className={styles.pace} role="group" aria-label="Presenter pace">
              <Button size="small" appearance={presenter.pace === "manual" ? "primary" : "subtle"} onClick={() => emit("setPace", { pace: "manual" })}>Manual</Button>
              <Button size="small" appearance={presenter.pace === "auto" ? "primary" : "subtle"} onClick={() => emit("setPace", { pace: "auto" })}>Auto</Button>
            </div>
            <Button appearance="subtle" icon={<ArrowReset24Regular />} aria-label="Reset scenario" disabled={activeAgentId !== null} onClick={reset} />
          </div> : null}
          <div className={mergeClasses(styles.timerSlot, !runnerExpanded ? styles.timerSlotCompact : undefined)}>{children}</div>
        </div>
      </aside> : null}

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

              <section className={styles.blueprintContextContract} aria-label="Selected projection contract">
                <div className={styles.blueprintContextIdentity}>
                  <span className={styles.blueprintKind}>Selected projection contract</span>
                  <strong>{blueprintContext.id}</strong>
                  <span>{blueprintContext.actor}</span>
                </div>
                <div className={styles.blueprintContextBody}>
                  <div className={styles.blueprintContextField}>Role<span className={styles.blueprintContextValue}>{blueprintContext.role}</span></div>
                  <div className={styles.blueprintContextField}>Device / frame<span className={styles.blueprintContextValue}>{blueprintContext.device} / {blueprintContext.frame}</span></div>
                  <div className={styles.blueprintContextField}>Task<span className={styles.blueprintContextValue}>{blueprintContext.task}</span></div>
                  <div className={styles.blueprintContextField}>Disclosure<span className={styles.blueprintContextValue}>{blueprintContext.disclosure}</span></div>
                  <div className={styles.blueprintContextField}>Layout<span className={styles.blueprintContextValue}>{blueprintContext.layout}</span></div>
                  <div className={styles.blueprintContextField}>Arrangement<span className={styles.blueprintContextValue}>{blueprintPresentation.arrangement}</span></div>
                  <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Lowered reading order<span className={styles.blueprintContextValue}>{blueprintRegions.map((region) => region.name).join(" → ")}</span></div>
                  <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Envelope sequence<span className={styles.blueprintContextValue}>{[...new Set(blueprintRegions.map((region) => region.group ?? "substrate"))].join(" → ")}</span></div>
                  <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Group / priority / disclosure<span className={styles.blueprintContextValue}>{blueprintRegions.map((region) => `${region.name}: ${region.group ?? "substrate"} / ${region.priority} / ${region.disclosure}`).join(" · ")}</span></div>
                </div>
              </section>

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
                  {runnerEnabled ? <div className={styles.blueprintResource}>Scenario acts<span className={styles.blueprintResourceValue}>{scenarioPlan.steps.length}</span></div> : null}
                  <div className={styles.blueprintResource}>Projection contexts<span className={styles.blueprintResourceValue}>{SOC_BLUEPRINT_CONTEXTS.length}</span></div>
                  <div className={styles.blueprintResource}>Authority rule<span className={styles.blueprintResourceValue}>{String((blueprintResources.authorityPolicy as { requiredRole: string }).requiredRole)}</span></div>
                </div>
              </section>
            </> : <div className={mergeClasses(styles.contextProjection, projectionFrameClass)} data-soc-viewpoint={presentation.selectedContext}>
            <header className={styles.viewpointIdentity} style={{ order: -2 }}>
              <div>
                <div className={styles.eyebrow}>{selectedContext.audience}</div>
                <h2 className={styles.viewpointName}>{selectedContext.label}</h2>
              </div>
              <span className={styles.viewpointDevice}>{presentationSpec.frame} · {presentationSpec.arrangement}</span>
            </header>
            <header className={styles.sharedHeader} style={{ order: regionOrder("summary") }}>
              <div>
                <div className={styles.eyebrow}>One governed operational state</div>
                <h2 className={styles.sharedTitle}>Shared investigation</h2>
                <p className={styles.sharedSubhead}>Every contribution changes or challenges the same incident record.</p>
              </div>
              <span className={styles.pill}><DataTrending24Regular />{journal.length} attributable changes</span>
            </header>

            {presentationSpec.frame === "agent-console" ? <div className={styles.agentEnvelope} aria-label="Agent participation envelope" style={{ order: 1 }}>
              <section className={styles.agentEnvelopeSection} data-agent-envelope-group="context">
                <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>01 · Context</span><strong>Participation scope</strong></div>
                <div className={styles.agentEnvelopeBody}>
                  <h3 className={styles.agentEnvelopeTitle}>{selectedAgent?.name ?? blueprintContext.actor}</h3>
                  <p className={styles.agentEnvelopeText}>{selectedAgent?.objective ?? "No objective assigned."}</p>
                  <div className={styles.agentEnvelopeMeta}>
                    <span className={styles.agentEnvelopeChip}>actor={blueprintContext.actor}</span>
                    <span className={styles.agentEnvelopeChip}>role={blueprintContext.role}</span>
                    <span className={styles.agentEnvelopeChip}>revision={presentation.revision}</span>
                    <span className={styles.agentEnvelopeChip}>stage={stage}</span>
                  </div>
                  <p className={styles.agentEnvelopeText}>Authority: {selectedAgent?.authority ?? "No authority declared"}</p>
                </div>
              </section>

              <section className={styles.agentEnvelopeSection} data-agent-envelope-group="shared-state">
                <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>02 · State</span><strong>Shared with agent</strong></div>
                <div className={styles.agentEnvelopeBody}>
                  <div className={styles.agentEnvelopeMeta}>{agentRegions("shared-state").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
                  <p className={styles.agentEnvelopeText}>{hypothesis.statement} Confidence: {hypothesis.confidence}%.</p>
                  {constraints[0] ? <p className={styles.agentEnvelopeText}>Constraint: {constraints[0].rule}</p> : null}
                </div>
              </section>

              <section className={styles.agentEnvelopeSection} data-agent-envelope-group="request">
                <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>03 · Request</span><strong>Task envelope</strong></div>
                <div className={styles.agentEnvelopeBody}>
                  <h3 className={styles.agentEnvelopeTitle}>{blueprintContext.task}</h3>
                  <p className={styles.agentEnvelopeText}>{agentRequest}</p>
                  <div className={styles.agentEnvelopeMeta}>{agentRegions("request").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
                </div>
              </section>

              <section className={styles.agentEnvelopeSection} data-agent-envelope-group="response">
                <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>04 · Response</span><strong>Agent contribution</strong></div>
                <div className={styles.agentEnvelopeBody}>
                  <p className={styles.agentEnvelopeText}>{agentResponse}</p>
                  <div className={styles.agentEnvelopeMeta}>{agentRegions("response").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}</div>
                </div>
              </section>

              <section className={mergeClasses(styles.agentEnvelopeSection, latestAgentEntry ? styles.agentEnvelopeOutcome : undefined)} data-agent-envelope-group="governed-result">
                <div className={styles.agentEnvelopeLabel}><span className={styles.agentEnvelopeStep}>05 · Governed result</span><strong>Shared-state outcome</strong></div>
                <div className={styles.agentEnvelopeBody}>
                  <h3 className={styles.agentEnvelopeTitle}>{latestAgentEntry?.result ?? "No submitted result"}</h3>
                  <p className={styles.agentEnvelopeText}>{latestAgentEntry?.summary ?? "The kernel has not committed or rejected a contribution from this agent yet."}</p>
                  <div className={styles.agentEnvelopeMeta}>
                    {agentRegions("governed-result").map((region) => <span className={styles.agentEnvelopeChip} key={region}>{region}</span>)}
                    {latestAgentEntry?.affected.map((path) => <span className={styles.agentEnvelopeChip} key={path}>changed:{path}</span>)}
                  </div>
                </div>
              </section>
            </div> : <>
            {hasRegion("intent") || hasRegion("constraints") ? <div style={{ order: regionOrder("intent", "constraints") }} className={mergeClasses(styles.contextRow, hasRegion("intent") && hasRegion("constraints") ? undefined : styles.contextRowSingle)}>
              {hasRegion("intent") ? <div data-soc-object-id="intent" className={mergeClasses(styles.contextBand, isCausallyAffected(selectedEntry, ["intent"]) ? styles.causalHighlight : undefined)}>
                <div className={styles.contextLabel}>Morgan's intent</div>
                <p className={mergeClasses(styles.contextText, !intent ? styles.emptyText : undefined)}>{intent?.statement ?? "Waiting for the analyst to establish intent"}</p>
              </div> : null}
              {hasRegion("constraints") ? <div data-soc-object-id="constraints" className={mergeClasses(styles.contextBand, isCausallyAffected(selectedEntry, ["constraints", "DC-01"]) ? styles.causalHighlight : undefined)}>
                <div className={styles.contextLabel}>Priya's operating constraint</div>
                <p className={mergeClasses(styles.contextText, constraints.length === 0 ? styles.emptyText : undefined)}>{constraints[0]?.rule ?? "Waiting for incident-command constraints"}</p>
              </div> : null}
            </div> : null}

            {hasRegion("hypothesis") ? <article style={{ order: regionOrder("hypothesis") }} data-soc-object-id="hypothesis" className={mergeClasses(styles.hypothesis, isCausallyAffected(selectedEntry, ["hypothesis", "corr-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
              <div className={styles.hypothesisTop}>
                <div className={styles.hypothesisLabel}><BrainCircuit24Regular />Working hypothesis</div>
                <div className={styles.confidence}>{hypothesis.confidence}%</div>
              </div>
              <p className={styles.hypothesisText}>{hypothesis.statement}</p>
            </article> : null}

            {showInvestigation ? <section style={{ order: regionOrder("exploration", "evidence") }} className={styles.section}>
                <h3 className={styles.sectionTitle}><Sparkle24Regular />{hasRegion("exploration") ? "Exploration and evidence" : "Evidence summary"}</h3>
                {hasRegion("exploration") && explorations.length > 0 ? <div className={styles.explorationList}>{explorations.map((item) => (
                  <article data-soc-object-id={item.id} key={item.id} className={mergeClasses(styles.exploration, item.status === "superseded" ? styles.explorationMuted : undefined, isCausallyAffected(selectedEntry, [item.id]) ? styles.causalHighlight : undefined)}>
                    <div className={styles.rowTop}><strong>Revision {item.revision}</strong><span className={styles.status}>{item.status}</span></div>
                    <div className={styles.detailGrid}><span>{item.windowMinutes} minute window</span><span>{item.correlationKey}</span><span>{item.safety}</span></div>
                  </article>
                ))}</div> : hasRegion("exploration") ? <div className={styles.empty}>No exploration proposed yet.</div> : null}
                {hasRegion("evidence") && evidence.length > 0 ? <div className={styles.evidenceList}>{evidence.map((item) => (
                  <article data-soc-object-id={item.id} className={mergeClasses(styles.evidence, isCausallyAffected(selectedEntry, ["evidence", item.id]) ? styles.causalHighlight : undefined)} key={item.id}>
                    <div className={styles.evidenceMeta}><span>{item.source}</span><span>{item.confidence}%</span></div>
                    <p className={styles.evidenceText}>{item.summary}</p>
                  </article>
                ))}</div> : null}
            </section> : null}

            {showResponse ? <section style={{ order: regionOrder("response") }} className={styles.section}>
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

            {hasRegion("authorization") ? <section style={{ order: regionOrder("authorization") }} data-soc-object-id="authorization" className={mergeClasses(styles.contextBand, isCausallyAffected(selectedEntry, ["authorization", "rec-1", "Host-A"]) ? styles.causalHighlight : undefined)}>
              <div className={styles.contextLabel}>Commander authority</div>
              <p className={styles.contextText}>{authorization?.status === "pending" ? "Host-A isolation is ready for Incident Commander authorization." : authorization?.status === "authorized" ? "Containment has Incident Commander authorization." : "No consequential action is awaiting authorization."}</p>
              {authorization?.status === "pending" ? <Button appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
            </section> : null}

            {hasRegion("causal-record") ? <section style={{ order: regionOrder("causal-record") }} className={styles.contextBand}>
              <div className={styles.contextLabel}>Relevant causal record</div>
              <p className={styles.contextText}>{selectedEntry ? `${actorNames.get(selectedEntry.actorId) ?? selectedEntry.actorId}: ${selectedEntry.summary}` : "The first attributable action will appear here."}</p>
            </section> : null}
            </>}
            </div>}
            </div>
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
                    {journalMode === "ledger" ? <div className={styles.ledgerMeta}>actor={item.actorId}<br />affected={item.affected.join(", ")}{item.provider ? <><br />provider={item.provider} · agent={item.agentName}{item.conversationId ? <><br />conversation={item.conversationId} · response={item.responseId}</> : null}{item.fallbackReason ? <><br />fallback={item.fallbackReason}</> : null}</> : null}</div> : null}
                  </div>
                </button>
              ))}
              {incident.status === "Contained" ? <div className={styles.fallback}><CheckmarkCircle20Regular /> <strong>Host-A contained under commander authority.</strong></div> : null}
            </div>
          </div>
        </aside>
      </div>

      <section className={styles.participantDrawer} aria-label="Participant drawer">
        <button
          type="button"
          className={styles.participantDrawerToggle}
          aria-expanded={participantsExpanded}
          aria-controls="soc-participants"
          onClick={() => setParticipantsExpanded((expanded) => !expanded)}
        >
          <span className={styles.participantDrawerTitle}><Person24Regular />Participants</span>
          <span className={styles.participantSummaries} aria-hidden="true">
            {actors.map((item) => {
              const canAuthorize = item.id === "human-priya" && authorization?.status === "pending";
              const status = activeAgentId === item.id ? "working" : canAuthorize ? "input-awaited" : item.status;
              return <span className={styles.participantSummary} key={item.id}>
                <ParticipantPresenceIcon status={status} />
                <span className={styles.participantSummaryName}>{item.name}</span>
                <span>{activeAgentId === item.id ? "thinking" : canAuthorize ? "input awaited" : item.status.replaceAll("-", " ")}</span>
              </span>;
            })}
          </span>
          {participantsExpanded ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
        </button>
        {participantsExpanded ? <div id="soc-participants" className={styles.participants} aria-label="Human and agent participants">
            {actors.map((item) => {
              const active = isActorSelected(selectedEntry, item.id);
              const canAuthorize = item.id === "human-priya" && authorization?.status === "pending";
              const status = activeAgentId === item.id ? "working" : canAuthorize ? "input-awaited" : item.status;
              return <article data-soc-actor-id={item.id} key={item.id} className={mergeClasses(styles.participant, active ? styles.participantActive : undefined, active ? styles.causalHighlight : undefined)}>
                <div className={styles.participantTop}>
                  <div className={styles.participantIdentity}>
                    <ParticipantPresenceIcon status={status} />
                    <div className={styles.participantName}>{item.kind === "human" ? <Person24Regular /> : <Sparkle24Regular />}{item.name}</div>
                  </div>
                  <span className={styles.kind}>{item.kind.toUpperCase()}</span>
                </div>
                <div className={styles.role}>{item.role} · {activeAgentId === item.id ? "thinking" : canAuthorize ? "input awaited" : item.status.replaceAll("-", " ")}</div>
                <p className={styles.activity}>{item.activity ?? item.objective}</p>
                <div className={styles.authority}>{item.authority}</div>
                {item.kind === "agent" && agentProviders[item.id] ? <div className={styles.providerControls}>
                  <div className={styles.providerHeader}>
                    <span className={styles.providerName} title={agentProviders[item.id].agentName}>{agentProviders[item.id].agentName}</span>
                    <div className={styles.providerMode} role="group" aria-label={`${item.name} provider`}>
                      <Button size="small" appearance={agentProviders[item.id].mode === "mock" ? "primary" : "subtle"} onClick={() => { emit("setAgentMode", { agentId: item.id, mode: "mock" }, item.id); }}>Mock</Button>
                      <Button size="small" appearance={agentProviders[item.id].mode === "live" ? "primary" : "subtle"} onClick={() => { emit("setAgentMode", { agentId: item.id, mode: "live" }, item.id); }}>Live</Button>
                    </div>
                  </div>
                  <div className={styles.providerStatus}>{agentProviders[item.id].status}{agentProviders[item.id].fallbackReason ? ` · ${agentProviders[item.id].fallbackReason}` : agentProviders[item.id].conversationId ? ` · conversation active` : ""}</div>
                </div> : null}
                {canAuthorize ? <Button className={styles.authorize} appearance="primary" icon={<ShieldLock24Regular />} onClick={() => emit("authorizeContainment", {}, "human-priya")}>Authorize Host-A isolation</Button> : null}
              </article>;
            })}
          </div> : null}
      </section>
    </main>
  );
};

export default { workspace: LiveWorkspaceSoc };