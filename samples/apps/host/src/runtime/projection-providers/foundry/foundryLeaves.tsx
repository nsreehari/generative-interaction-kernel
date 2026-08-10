import React from "react";
import { AccessGate } from "@gik/components/primitives";
import type { Json, ResolvedNode } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  FUNCTION_ACCESS,
  getFunctionAccessKey,
  setFunctionAccessKey,
  type FunctionAccessScope,
} from "../../../../../../services/host/function-access";

function accessGateNode(id: string, access: Record<string, Json>): ResolvedNode {
  return {
    id,
    capability: "primitive:access-gate",
    props: { access },
    visible: true,
    fallback: false,
    children: [],
  };
}

function jsonRecord(value: Json | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
}

export const FunctionAccessGate: ProjectionView = ({ node, emit, children }) => {
  const scope: FunctionAccessScope = node.capability.startsWith("http-proxy:") ? "http-proxy" : "foundry";
  const service = FUNCTION_ACCESS[scope];
  const authoredAccess = jsonRecord(node.props.access);
  const status = String(authoredAccess.status ?? "checking");
  const storedCredential = getFunctionAccessKey(scope).trim();
  const requiresCredential = status === "required";
  const emitRef = React.useRef(emit);
  emitRef.current = emit;

  React.useEffect(() => {
    const requestAccess = () => {
      const event = getFunctionAccessKey(scope).trim() ? "accessRequested" : "accessCleared";
      void emitRef.current(event, {});
    };
    queueMicrotask(requestAccess);
    const accessChanged = () => requestAccess();
    const storageChanged = (event: StorageEvent) => {
      if (event.key === service.storageKey) requestAccess();
    };
    globalThis.addEventListener?.(service.changeEvent, accessChanged);
    globalThis.addEventListener?.("storage", storageChanged);
    return () => {
      globalThis.removeEventListener?.(service.changeEvent, accessChanged);
      globalThis.removeEventListener?.("storage", storageChanged);
    };
  }, [scope, service.changeEvent, service.storageKey]);
  const sourceAccess: Record<string, Json> = {
    title: `Connect to ${service.label}`,
    message: requiresCredential
      ? "Enter your access key to continue."
      : status === "checking"
        ? `Checking ${service.label} access...`
        : `Couldn't verify ${service.label} access.`,
    inputFormSpec: requiresCredential ? {
      fields: {
        properties: {
          credential: {
            type: "string",
            title: "Access key",
            format: "password",
            placeholder: "Paste your access key",
          },
        },
        required: ["credential"],
      },
      value: { credential: "" },
      saveLabel: "Continue",
      discardLabel: "Cancel",
    } : {},
    actions: { retry: status === "error", retryLabel: "Retry" },
    ...authoredAccess,
  };
  const access: Record<string, Json> = {
    ...sourceAccess,
    actions: {
      ...jsonRecord(sourceAccess.actions),
      reset: storedCredential !== "",
      resetLabel: "Reset Key",
    },
  };
  return (
    <AccessGate
      node={accessGateNode(`${node.id}-primitive`, access)}
      emit={async (event, payload) => {
        if (event === "submit") {
          const values = payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, Json>).values
            : undefined;
          const credential = values && typeof values === "object" && !Array.isArray(values)
            ? String((values as Record<string, Json>).credential ?? "").trim()
            : "";
          if (!credential) return;
          setFunctionAccessKey(scope, credential);
          await emit("accessRequested", {});
        } else if (event === "retry") {
          await emit("accessRequested", {});
        } else if (event === "reset") {
          setFunctionAccessKey(scope, "");
          await emit("accessCleared", {});
        }
      }}
      children={children}
    />
  );
};

const views: Record<string, ProjectionView> = {
  "access-gate": FunctionAccessGate,
};

export default views;