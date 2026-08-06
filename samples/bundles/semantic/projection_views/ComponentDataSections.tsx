import React from "react";
import type { Json, ResolvedNode } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";
import { semanticComponentViews } from "@gik/components/semantic";
import { securityComponentViews } from "@gik/components/security";

type RecordValue = Record<string, unknown>;

const views: Record<string, ProjectionView> = {
  ...Object.fromEntries(Object.entries(semanticComponentViews).map(([id, view]) => [`semantic:${id}`, view])),
  ...Object.fromEntries(Object.entries(securityComponentViews).map(([id, view]) => [`security:${id}`, view])),
};

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function array(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function componentData(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return []; }
}

function distinctHeading(heading: string, data: unknown, fields: string[]): string | undefined {
  const normalizedHeading = heading.trim().toLocaleLowerCase();
  const values = Array.isArray(data) ? data.map(record) : [record(data)];
  return values.some((value) => fields.some((field) => String(value[field] ?? "").trim().toLocaleLowerCase() === normalizedHeading))
    ? undefined
    : heading;
}

function componentProps(capability: string, heading: string, data: unknown): Record<string, Json> {
  const value = record(data);
  if (capability === "semantic:argument") return { argument: value as Json, spec: { title: heading } };
  if (capability === "semantic:decision") return { variant: "summary", decision: value as Json, spec: { eyebrow: distinctHeading(heading, data, ["title"]), fields: { title: "title", summary: "summary", outcome: "outcome", rationale: "rationale", confidence: "confidence", impact: "impact", tone: "confidence" }, toneMap: { high: "affirmative", medium: "cautionary", low: "uncertain" } } };
  if (capability === "semantic:entity-set") return { variant: "list", items: array(data) as Json, spec: { title: heading, fields: { id: "id", label: "label", description: "description", type: "type", status: "status", group: "group" } } };
  if (capability === "semantic:event-series") return { items: array(data) as Json, spec: { title: heading, fields: { id: "id", title: "title", timestamp: "timestamp", detail: "detail", status: "status" }, sort: { direction: "ascending" } } };
  if (capability === "semantic:evidence-case") return { evidence: array(data) as Json, spec: { title: heading, fields: { id: "id", title: "title", source: "source", timestamp: "timestamp", excerpt: "excerpt", tone: "tone" } } };
  if (capability === "semantic:measure-set") return { measures: array(data) as Json, spec: { title: heading, fields: { id: "id", label: "label", value: "value", unit: "unit", baseline: "baseline", delta: "delta", order: "order", tone: "tone" } } };
  if (capability === "semantic:milestones") return { milestones: array(data) as Json, spec: { title: heading, fields: { id: "id", title: "title", timestamp: "timestamp", detail: "detail", status: "status", order: "order" } } };
  if (capability === "semantic:narrative") return { sections: array(data) as Json, spec: { title: distinctHeading(heading, data, ["heading"]), fields: { id: "id", heading: "heading", body: "body", parent: "parentId", order: "order", role: "role", tone: "tone" } } };
  if (capability === "semantic:process") return { items: array(data) as Json, spec: { title: heading, fields: { id: "id", title: "title", detail: "detail", order: "order", status: "status", reference: "reference" } } };
  if (capability === "semantic:relationship-set") return { graph: value as Json, spec: { title: heading, entityFields: { id: "id", label: "label", detail: "detail", type: "type", tone: "status" }, relationshipFields: { id: "id", source: "source", target: "target", label: "label" } } };
  if (capability === "semantic:work-set") return { variant: "list", items: array(data) as Json, spec: { title: heading, fields: { id: "id", title: "title", detail: "detail", group: "group", order: "order" }, groups: [{ value: "all", label: "Actions" }] } };
  return { graph: value as Json, spec: { title: heading, entityFields: { id: "id", label: "label", detail: "detail", type: "type", tone: "status" }, relationshipFields: { id: "id", source: "sourceId", target: "targetId", label: "label", start: "start", end: "end" } } };
}

export const ComponentDataSections: ProjectionView = ({ node, emit }) => <>
  {array(node.props.sections).sort((left, right) => Number(left.order) - Number(right.order)).flatMap((section) => {
    const heading = String(section.sourceHeading ?? "Report section");
    return array(section.options)
      .filter((option) => option.relationship === "preferred" || option.relationship === "complementary")
      .map((option) => {
        const capability = String(option.capability ?? "");
        const View = views[capability];
        if (!View) return null;
        const childNode: ResolvedNode = {
          id: `${node.id}-${String(option.id ?? capability)}`,
          capability,
          props: componentProps(capability, heading, componentData(option.data)),
          visible: true,
          fallback: false,
          children: [],
        };
        return <View key={childNode.id} node={childNode} emit={emit} children={undefined} />;
      });
  })}
</>;
