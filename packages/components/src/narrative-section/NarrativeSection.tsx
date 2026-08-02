import React from "react";
import { Badge, Divider, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { trialNode, type ComponentDescription, type ComponentValidationReport, type DeclarativeComponentDefinition } from "../definition";
import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor } from "../shared";

export const NARRATIVE_SECTION_SEMANTIC_TOKENS = ["primary", "supporting", "caution", "critical", "neutral"] as const;
export const NARRATIVE_SECTION_VARIANTS = ["standard", "compact"] as const;
type NarrativeToken = typeof NARRATIVE_SECTION_SEMANTIC_TOKENS[number];

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["sections", "spec"],
  properties: {
    ...componentStylePropsSchema,
    sections: { type: "array", items: { type: "object" } }, variant: { enum: NARRATIVE_SECTION_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
      title: { type: "string" }, emptyText: { type: "string" },
      fields: { type: "object", additionalProperties: false, required: ["heading", "body"], properties: { heading: { type: "string", minLength: 1 }, body: { type: "string", minLength: 1 }, eyebrow: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 } } },
      toneMap: { type: "object", additionalProperties: { enum: NARRATIVE_SECTION_SEMANTIC_TOKENS } },
    } },
  },
} as const;
type NarrativeSpec = { title?: string; emptyText?: string; fields: { heading: string; body: string; eyebrow?: string; tone?: string }; toneMap?: Record<string, NarrativeToken> };
const useStyles = makeStyles({ root: { display: "grid", gap: tokens.spacingVerticalL, maxWidth: "52rem" }, compact: { gap: tokens.spacingVerticalM }, section: { display: "grid", gap: tokens.spacingVerticalS }, header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: tokens.spacingHorizontalM }, eyebrow: { color: tokens.colorNeutralForeground3 }, body: { color: tokens.colorNeutralForeground2, whiteSpace: "pre-line", lineHeight: tokens.lineHeightBase400 } });
function color(token: NarrativeToken): BadgeColor { if (token === "critical") return "danger"; if (token === "caution") return "warning"; if (token === "primary") return "brand"; return "informative"; }
export const NarrativeSection: ProjectionView = ({ node }) => {
  const styles = useStyles(); const sections = records(node.props.sections); const spec = (node.props.spec ?? {}) as NarrativeSpec; const compact = (node.props.variant ?? "standard") === "compact";
  if (!spec.fields || sections.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No narrative available."}</Text>;
  return <article {...componentRootProps(node, mergeClasses(styles.root, compact && styles.compact))} aria-label={spec.title ?? "Narrative"}>
    {spec.title ? <Text as="h2" weight="semibold" size={600}>{spec.title}</Text> : null}
    {sections.map((section, index) => { const toneValue = textAt(section, spec.fields.tone); const token = toneValue ? spec.toneMap?.[toneValue] : undefined; return <React.Fragment key={`${textAt(section, spec.fields.heading)}-${index}`}>
      {index > 0 && !compact ? <Divider /> : null}
      <section className={styles.section}>
        {spec.fields.eyebrow && textAt(section, spec.fields.eyebrow) ? <Text className={styles.eyebrow} size={200}>{textAt(section, spec.fields.eyebrow)}</Text> : null}
        <div className={styles.header}><Text as="h3" weight="semibold" size={compact ? 400 : 500}>{textAt(section, spec.fields.heading)}</Text>{token ? <Badge appearance="tint" color={color(token)}>{toneValue}</Badge> : null}</div>
        <Text className={styles.body}>{textAt(section, spec.fields.body)}</Text>
      </section>
    </React.Fragment>; })}
  </article>;
};
const description: ComponentDescription = { capability: "semantic:narrative-section", summary: "Presents structured explanatory prose as ordered, mapped narrative sections.", dataProp: "sections", events: [], semanticTokens: NARRATIVE_SECTION_SEMANTIC_TOKENS, defaultVariant: "standard", variants: [{ value: "standard", summary: "Spacious article treatment with section dividers.", useWhen: ["Narrative is a primary reading surface", "Sections need clear editorial rhythm"] }, { value: "compact", summary: "Tighter supporting narrative without dividers.", useWhen: ["Narrative supports a denser operational view", "Only short sections are expected"] }], authoring: { useWhen: ["Explanatory prose is organized into named sections", "Reading order matters more than chronology"], avoidWhen: ["Exact source wording must retain line references; use annotated-source-excerpt", "Events are chronological records; use timeline"], rules: ["Supply plain text rather than executable markup", "Keep each section focused on one idea", "Use source order as reading order", "Map tone only when it adds semantic meaning"] } };
export function describeNarrativeSection() { return description; }
export function getNarrativeSectionSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateNarrativeSection(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getNarrativeSectionSchema(), message: "Invalid semantic:narrative-section props", code: "semantic-narrative-section-schema" }], props as Json); }
export function materializeNarrativeSectionTrial() { return trialNode("semantic:narrative-section", { variant: "standard", sections: [{ kind: "Finding", heading: "Initial access", body: "The investigation links the first anomalous sign-in to a newly registered device.", tone: "primary" }, { kind: "Assessment", heading: "Containment posture", body: "Current controls limit further access while identity review continues.", tone: "supporting" }], spec: { title: "Incident narrative", fields: { eyebrow: "kind", heading: "heading", body: "body", tone: "tone" }, toneMap: { primary: "primary", supporting: "supporting" } } }); }
export const narrativeSectionDefinition: DeclarativeComponentDefinition = { capability: description.capability, version: "1.0.0", summary: description.summary, dataProp: description.dataProp, events: description.events, semanticTokens: description.semanticTokens, defaultVariant: description.defaultVariant, variants: description.variants, authoring: description.authoring, component: NarrativeSection, describe: describeNarrativeSection, getSchema: getNarrativeSectionSchema, validate: validateNarrativeSection, materializeTrial: materializeNarrativeSectionTrial };