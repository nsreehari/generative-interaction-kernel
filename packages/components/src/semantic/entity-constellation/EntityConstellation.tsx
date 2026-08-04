import React from "react";
import { Badge, Card, CardHeader, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import type { ComponentValidationReport } from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../../shared/component";

export const ENTITY_CONSTELLATION_SEMANTIC_TOKENS = ["affected", "at-risk", "observed", "positive", "unknown"] as const;
export const ENTITY_CONSTELLATION_VARIANTS = ["grouped", "compact"] as const;
type EntityToken = typeof ENTITY_CONSTELLATION_SEMANTIC_TOKENS[number];
type EntityConstellationVariant = typeof ENTITY_CONSTELLATION_VARIANTS[number];

const entityConstellationPropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["items", "spec"],
  properties: {
    ...componentStylePropsSchema,
    items: { type: "array", items: { type: "object" } },
    variant: { enum: ENTITY_CONSTELLATION_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" },
      fields: { type: "object", additionalProperties: false, required: ["id", "label"], properties: {
        id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 },
        type: { type: "string", minLength: 1 }, status: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 },
      } },
      groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "label"], properties: { value: { type: "string" }, label: { type: "string" } } } },
      toneMap: { type: "object", additionalProperties: { enum: ENTITY_CONSTELLATION_SEMANTIC_TOKENS } },
    } },
  },
} as const;

type EntitySpec = {
  title?: string; description?: string; emptyText?: string;
  fields: { id: string; label: string; description?: string; type?: string; status?: string; group?: string };
  groups?: Array<{ value: string; label: string }>;
  toneMap?: Record<string, EntityToken>;
};
const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalL }, heading: { display: "grid", gap: tokens.spacingVerticalXXS },
  groups: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: tokens.spacingHorizontalL },
  compactGroups: { gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: tokens.spacingHorizontalS },
  group: { display: "grid", gap: tokens.spacingVerticalM }, groupTitle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  compactGroup: { gap: tokens.spacingVerticalS },
  entities: { display: "grid", gap: tokens.spacingVerticalS }, entity: { display: "grid", gap: tokens.spacingVerticalXS },
  compactEntities: { gap: tokens.spacingVerticalXS }, compactEntity: { gap: tokens.spacingVerticalXXS },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" }, detail: { color: tokens.colorNeutralForeground3 },
});
function tokenColor(token: EntityToken): BadgeColor {
  if (token === "affected") return "danger";
  if (token === "at-risk") return "warning";
  if (token === "positive") return "success";
  return "informative";
}
function groupValues(items: DataRecord[], spec: EntitySpec): Array<{ value: string; label: string }> {
  if (spec.groups?.length) return spec.groups;
  if (!spec.fields.group) return [{ value: "", label: "Entities" }];
  return [...new Set(items.map((item) => textAt(item, spec.fields.group)))].map((value) => ({ value, label: value || "Other" }));
}
export const EntityConstellation: ProjectionView = ({ node }) => {
  const styles = useStyles(); const items = records(node.props.items); const spec = (node.props.spec ?? {}) as EntitySpec;
  const variant = (node.props.variant ?? "grouped") as EntityConstellationVariant;
  if (!spec.fields || items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No entities."}</Text>;
  return <section {...componentRootProps(node, styles.root)}>
    {spec.title || spec.description ? <header className={styles.heading}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text>{spec.description}</Text> : null}</header> : null}
    <div className={mergeClasses(styles.groups, variant === "compact" && styles.compactGroups)}>{groupValues(items, spec).map((group) => {
      const members = items.filter((item) => !spec.fields.group || textAt(item, spec.fields.group) === group.value);
      return members.length ? <section className={mergeClasses(styles.group, variant === "compact" && styles.compactGroup)} key={group.value}><div className={styles.groupTitle}><Text weight="semibold">{group.label}</Text><Badge appearance="outline">{members.length}</Badge></div><div className={mergeClasses(styles.entities, variant === "compact" && styles.compactEntities)}>{members.map((item, index) => {
        const status = textAt(item, spec.fields.status); const token = spec.toneMap?.[status];
        return <Card className={mergeClasses(styles.entity, variant === "compact" && styles.compactEntity)} appearance="outline" key={textAt(item, spec.fields.id) || index}><CardHeader header={<div className={styles.titleRow}>{spec.fields.type && textAt(item, spec.fields.type) ? <Badge appearance="tint">{textAt(item, spec.fields.type)}</Badge> : null}<Text weight="semibold">{textAt(item, spec.fields.label)}</Text>{token ? <Badge appearance="tint" color={tokenColor(token)}>{status}</Badge> : null}</div>} />{spec.fields.description && textAt(item, spec.fields.description) ? <Text className={styles.detail}>{textAt(item, spec.fields.description)}</Text> : null}</Card>;
      })}</div></section> : null;
    })}</div>
  </section>;
};
export function getEntityConstellationSchema(): Record<string, unknown> { return entityConstellationPropsSchema as unknown as Record<string, unknown>; }
export function validateEntityConstellation(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getEntityConstellationSchema(), message: "Invalid entity-set renderer props", code: "entity-set-renderer-schema" }], props as Json); }