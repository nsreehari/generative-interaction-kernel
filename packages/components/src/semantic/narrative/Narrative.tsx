import React from "react";
import { Badge, Card, Divider, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const NARRATIVE_SEMANTIC_TOKENS = ["primary", "supporting", "caution", "critical", "neutral"] as const;
export const NARRATIVE_VARIANTS = ["article", "outline", "briefing", "text"] as const;
type NarrativeToken = typeof NARRATIVE_SEMANTIC_TOKENS[number];
type NarrativeVariant = typeof NARRATIVE_VARIANTS[number];

interface NarrativeSpec {
  title?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
  fields: { id: string; heading: string; body: string; parent?: string; order?: string; role?: string; tone?: string };
  toneMap?: Record<string, NarrativeToken>;
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["sections", "spec"],
  properties: {
    ...componentStylePropsSchema,
    sections: { type: "array", items: { type: "object" } }, variant: { enum: NARRATIVE_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
      title: { type: "string" }, emptyText: { type: "string" }, density: { enum: ["comfortable", "compact"] },
      fields: { type: "object", additionalProperties: false, required: ["id", "heading", "body"], properties: {
        id: { type: "string", minLength: 1 }, heading: { type: "string", minLength: 1 }, body: { type: "string", minLength: 1 },
        parent: { type: "string", minLength: 1 }, order: { type: "string", minLength: 1 }, role: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 },
      } },
      toneMap: { type: "object", additionalProperties: { enum: NARRATIVE_SEMANTIC_TOKENS } },
    } },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalL, maxWidth: "52rem", minWidth: 0 },
  compact: { gap: tokens.spacingVerticalM },
  section: { display: "grid", gap: tokens.spacingVerticalS },
  heading: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  body: { color: tokens.colorNeutralForeground2, whiteSpace: "pre-line", lineHeight: tokens.lineHeightBase400 },
  outline: { display: "grid", gap: tokens.spacingVerticalM },
  outlineItem: { display: "grid", gap: tokens.spacingVerticalXS, borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke2}`, paddingLeft: tokens.spacingHorizontalM },
  briefing: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: tokens.spacingHorizontalM },
  briefingCard: { display: "grid", gap: tokens.spacingVerticalS, alignContent: "start" },
  text: { display: "grid", gap: tokens.spacingVerticalM },
});

function color(token: NarrativeToken | undefined): BadgeColor | undefined {
  if (token === "critical") return "danger";
  if (token === "caution") return "warning";
  if (token === "primary") return "brand";
  return token ? "informative" : undefined;
}

function orderedSections(sections: DataRecord[], orderField?: string) {
  return orderField ? [...sections].sort((left, right) => Number(textAt(left, orderField)) - Number(textAt(right, orderField))) : sections;
}

function outlineDepth(section: DataRecord, byId: Map<string, DataRecord>, spec: NarrativeSpec): number {
  if (!spec.fields.parent) return 0;
  let parentId = textAt(section, spec.fields.parent);
  let depth = 0;
  const visited = new Set<string>();
  while (parentId && byId.has(parentId) && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = textAt(byId.get(parentId)!, spec.fields.parent);
  }
  return depth;
}

function sectionBadge(section: DataRecord, spec: NarrativeSpec) {
  const role = textAt(section, spec.fields.role);
  const toneValue = textAt(section, spec.fields.tone);
  const token = toneValue ? spec.toneMap?.[toneValue] : undefined;
  return role || toneValue ? <Badge appearance="tint" color={color(token)}>{role || toneValue}</Badge> : null;
}

export const Narrative: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const sections = records(node.props.sections);
  const spec = (node.props.spec ?? {}) as unknown as NarrativeSpec;
  const variant = (node.props.variant ?? "article") as NarrativeVariant;
  if (!spec.fields || sections.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No narrative available."}</Text>;
  const ordered = orderedSections(sections, spec.fields.order);
  const title = spec.title ? <Text as="h2" weight="semibold" size={600}>{spec.title}</Text> : null;
  const root = componentRootProps(node, styles.root, spec.density === "compact" && styles.compact);

  if (variant === "text") return <section {...root}>{title}<div className={styles.text}>{ordered.map((section) => { const role = textAt(section, spec.fields.role) || textAt(section, spec.fields.tone); return <Text key={textAt(section, spec.fields.id)}>{role ? `[${role}] ` : ""}{textAt(section, spec.fields.heading)}: {textAt(section, spec.fields.body)}</Text>; })}</div></section>;

  if (variant === "outline") {
    const byId = new Map(ordered.map((section) => [textAt(section, spec.fields.id), section]));
    return <section {...root}>{title}<div className={styles.outline}>{ordered.map((section) => <section className={styles.outlineItem} style={{ marginLeft: `${outlineDepth(section, byId, spec) * 1.25}rem` }} key={textAt(section, spec.fields.id)}><div className={styles.heading}><Text as="h3" weight="semibold">{textAt(section, spec.fields.heading)}</Text>{sectionBadge(section, spec)}</div><Text className={styles.body}>{textAt(section, spec.fields.body)}</Text></section>)}</div></section>;
  }

  if (variant === "briefing") return <section {...root}>{title}<div className={styles.briefing}>{ordered.map((section) => <Card appearance="outline" className={styles.briefingCard} key={textAt(section, spec.fields.id)}><div className={styles.heading}><Text as="h3" weight="semibold">{textAt(section, spec.fields.heading)}</Text>{sectionBadge(section, spec)}</div><Text className={styles.body}>{textAt(section, spec.fields.body)}</Text></Card>)}</div></section>;

  return <article {...root} aria-label={spec.title ?? "Narrative"}>{title}{ordered.map((section, index) => <React.Fragment key={textAt(section, spec.fields.id)}>{index > 0 && spec.density !== "compact" ? <Divider /> : null}<section className={styles.section}><div className={styles.heading}><Text as="h3" weight="semibold" size={500}>{textAt(section, spec.fields.heading)}</Text>{sectionBadge(section, spec)}</div><Text className={styles.body}>{textAt(section, spec.fields.body)}</Text></section></React.Fragment>)}</article>;
};

const description: ComponentDescription = {
  capability: "semantic:narrative", summary: "Presents the same authored narrative sections as an article, outline, briefing, or text.", dataProp: "sections", events: [], semanticTokens: NARRATIVE_SEMANTIC_TOKENS, defaultVariant: "article",
  variants: [
    { value: "article", summary: "Continuous editorial reading flow.", useWhen: ["Narrative reading is primary"] },
    { value: "outline", summary: "Authored section hierarchy with complete section bodies.", useWhen: ["Structure and parentage should be visible"] },
    { value: "briefing", summary: "Compact operational section composition.", useWhen: ["Readers need rapid section scanning"] },
    { value: "text", summary: "Complete linear textual projection.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: { useWhen: ["Explanatory content is organized into stable sections"], avoidWhen: ["Records are primarily chronological; use event-series"], rules: ["All variants consume and preserve the same sections", "Outline depth comes only from authored parent links", "Briefing never summarizes or omits content", "Put density in spec"] },
};

export function getNarrativeSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateNarrative(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getNarrativeSchema(), message: "Invalid semantic:narrative props", code: "narrative-schema" }], props as Json); }
export function materializeNarrativeTrial() { return trialNode("semantic:narrative", { variant: "article", sections: [{ id: "access", heading: "Initial access", body: "The investigation links the first anomalous sign-in to a newly registered device.", order: 1, role: "Finding", tone: "primary" }, { id: "containment", heading: "Containment posture", body: "Current controls limit further access while identity review continues.", parentId: "access", order: 2, role: "Assessment", tone: "supporting" }], spec: { title: "Incident narrative", density: "comfortable", fields: { id: "id", heading: "heading", body: "body", parent: "parentId", order: "order", role: "role", tone: "tone" }, toneMap: { primary: "primary", supporting: "supporting" } } }); }
export const narrativeDefinition = defineComponent({ description, version: "1.0.0", component: Narrative, getSchema: getNarrativeSchema, validate: validateNarrative, materializeTrial: materializeNarrativeTrial });