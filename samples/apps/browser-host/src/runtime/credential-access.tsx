import React from "react";
import { Button } from "@fluentui/react-components";
import { AccessGate } from "@gik/components/primitives";
import type { Json, ResolvedNode } from "@gik/kernel";
import type { ProjectionView, ProjectionViewProps } from "@gik/react";

import {
  clearBrowserCredential,
  readBrowserCredential,
  subscribeToBrowserCredential,
  writeBrowserCredential,
} from "./browser-credentials";

function record(value: Json | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

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

export const CredentialAccessProjection: ProjectionView = ({ node, emit, children }) => {
  const dependency = record(node.props.dependency);
  const credentialRef = String(dependency.ref ?? "").trim();
  if (dependency.kind !== "credential" || !credentialRef) {
    throw new Error("host:credential-access requires a credential dependency reference");
  }

  const authoredAccess = record(node.props.access);
  const status = String(authoredAccess.status ?? "checking");
  const storedCredential = readBrowserCredential(credentialRef).trim();
  const requiresCredential = status === "required";
  const emitRef = React.useRef(emit);
  emitRef.current = emit;

  React.useEffect(() => {
    const requestAccess = () => {
      const event = readBrowserCredential(credentialRef).trim() ? "accessRequested" : "accessCleared";
      void emitRef.current(event, {});
    };
    queueMicrotask(requestAccess);
    return subscribeToBrowserCredential(credentialRef, requestAccess);
  }, [credentialRef]);

  const sourceAccess: Record<string, Json> = {
    title: "Credential required",
    requiredMessage: "Enter the required credential to continue.",
    checkingMessage: "Checking access...",
    errorMessage: "Couldn't verify access.",
    ...authoredAccess,
  };
  const message = requiresCredential
    ? sourceAccess.requiredMessage
    : status === "checking"
      ? sourceAccess.checkingMessage
      : sourceAccess.errorMessage;
  const access: Record<string, Json> = {
    ...sourceAccess,
    message,
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
    actions: {
      ...record(sourceAccess.actions),
      retry: status === "error",
      retryLabel: "Retry",
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
          writeBrowserCredential(credentialRef, credential);
          await emit("accessRequested", {});
        } else if (event === "retry") {
          await emit("accessRequested", {});
        } else if (event === "reset") {
          clearBrowserCredential(credentialRef);
          await emit("accessCleared", {});
        }
      }}
      children={children}
    />
  );
};

export function CredentialClearButtonProjection({ node, emit }: ProjectionViewProps): React.ReactElement {
  const dependency = record(node.props.dependency);
  const credentialRef = String(dependency.ref ?? "").trim();
  if (dependency.kind !== "credential" || !credentialRef) {
    throw new Error("host:credential-clear-button requires a credential dependency reference");
  }

  return (
    <Button onClick={() => {
      clearBrowserCredential(credentialRef);
      void emit("press", {});
    }}>
      {String(node.props.label ?? "Clear credential")}
    </Button>
  );
}

export const credentialAccessViews: Record<string, ProjectionView> = {
  "credential-access": CredentialAccessProjection,
  "credential-clear-button": CredentialClearButtonProjection,
};
