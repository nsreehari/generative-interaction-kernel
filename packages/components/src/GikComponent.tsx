import React from "react";
import type { Json, ResolvedNode } from "@gik/kernel";

import { fluentComponentDefinitions } from "./fluent/registry";
import { primitiveComponentDefinitions } from "./primitives/registry";
import { semanticComponentDefinitions } from "./semantic/registry";
import { securityComponentDefinitions } from "./security/registry";
import { softwareComponentDefinitions } from "./software/registry";
import type { DeclarativeComponentDefinition } from "./shared/definition";

type FluentComponentName = keyof typeof fluentComponentDefinitions & string;
type PrimitiveComponentName = keyof typeof primitiveComponentDefinitions & string;
type SemanticComponentName = keyof typeof semanticComponentDefinitions & string;
type SecurityComponentName = keyof typeof securityComponentDefinitions & string;
type SoftwareComponentName = keyof typeof softwareComponentDefinitions & string;

export type GikComponentKind =
  | `fluent:${FluentComponentName}`
  | `primitive:${PrimitiveComponentName}`
  | `semantic:${SemanticComponentName}`
  | `security:${SecurityComponentName}`
  | `software:${SoftwareComponentName}`;

export interface GikComponentEvent {
  kind: GikComponentKind;
  name: string;
  payload: Record<string, unknown>;
  actorId?: string;
}

export interface GikComponentProps {
  kind: GikComponentKind;
  id?: string;
  spec?: Json;
  data?: Json;
  variant?: string;
  componentProps?: Record<string, Json>;
  children?: React.ReactNode;
  onEvent?: (event: GikComponentEvent) => void | Promise<unknown>;
}

function resolveDefinition(kind: GikComponentKind): DeclarativeComponentDefinition {
  const separator = kind.indexOf(":");
  const layer = kind.slice(0, separator);
  const name = kind.slice(separator + 1);
  const definition = layer === "fluent" ? fluentComponentDefinitions[name as FluentComponentName]
    : layer === "primitive" ? primitiveComponentDefinitions[name as PrimitiveComponentName]
      : layer === "semantic" ? semanticComponentDefinitions[name as SemanticComponentName]
        : layer === "security" ? securityComponentDefinitions[name as SecurityComponentName]
          : softwareComponentDefinitions[name as SoftwareComponentName];

  if (!definition || definition.capability !== kind) {
    throw new Error(`Unknown GikComponent kind: ${kind}`);
  }
  return definition;
}

export function GikComponent({
  kind,
  id,
  spec,
  data,
  variant,
  componentProps,
  children,
  onEvent,
}: GikComponentProps): React.ReactElement {
  const generatedId = React.useId();
  const definition = resolveDefinition(kind);
  const props: Record<string, Json> = { ...componentProps };

  if (spec !== undefined) props.spec = spec;
  if (data !== undefined) {
    if (!definition.dataProp) {
      throw new Error(`${kind} does not declare a data prop`);
    }
    props[definition.dataProp] = data;
  }
  if (variant !== undefined) props.variant = variant;

  const validation = definition.validate(props);
  if (!validation.ok) {
    throw new Error(`Invalid ${kind} props: ${validation.errors.map((issue) => issue.detail).join("; ")}`);
  }

  const node: ResolvedNode = {
    capability: kind,
    id: id ?? `gik-component-${generatedId}`,
    props,
    visible: true,
    fallback: false,
    children: [],
  };
  const View = definition.component;
  const emit = (name: string, payload: Record<string, unknown> = {}, actorId?: string) =>
    onEvent?.({ kind, name, payload, actorId });

  return <View node={node} emit={emit}>{children}</View>;
}