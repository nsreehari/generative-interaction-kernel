import React from "react";
import { AccessGate } from "@gik/components/primitives";
import {
  UnsatisfiedServiceDependencyError,
  type ServiceDependency,
} from "@gik/controlface/services";
import type { Json, ResolvedNode } from "@gik/kernel";

import { writeBrowserCredential } from "./browser-credentials";

interface PendingDependency {
  dependency: ServiceDependency;
  message: string;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

let pendingDependency: PendingDependency | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function dependencySnapshot(): PendingDependency | undefined {
  return pendingDependency;
}

export const browserServiceDependencyAccessTesting = {
  current: dependencySnapshot,
  reset(): void {
    pendingDependency?.reject(new Error("Credential request reset"));
    pendingDependency = undefined;
    notify();
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function requestDependency(error: UnsatisfiedServiceDependencyError): Promise<void> {
  const reference = String(error.dependency.ref ?? "").trim();
  if (error.dependency.kind !== "credential" || !reference) throw error;
  if (pendingDependency?.dependency.kind === "credential" && pendingDependency.dependency.ref === reference) {
    return pendingDependency.promise;
  }
  if (pendingDependency) {
    return pendingDependency.promise
      .catch(() => undefined)
      .then(() => requestDependency(error));
  }

  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  }).finally(() => {
    pendingDependency = undefined;
    notify();
  });
  pendingDependency = {
    dependency: error.dependency,
    message: error.message,
    promise,
    resolve,
    reject,
  };
  notify();
  return promise;
}

export async function runWithBrowserServiceDependencies<T>(operation: () => Promise<T>): Promise<T> {
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof UnsatisfiedServiceDependencyError)) throw error;
      await requestDependency(error);
    }
  }
}

function accessGateNode(requirement: PendingDependency): ResolvedNode {
  return {
    id: "host-service-dependency-access",
    capability: "primitive:access-gate",
    props: {
      access: {
        triggered: true,
        status: "required",
        title: "Credential required",
        message: requirement.message || "Enter the required credential to continue.",
        inputFormSpec: {
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
        },
      },
    },
    visible: true,
    fallback: false,
    children: [],
  };
}

export function HostServiceDependencyAccess(): React.ReactElement | null {
  const requirement = React.useSyncExternalStore(subscribe, dependencySnapshot, () => undefined);
  if (!requirement) return null;

  return (
    <AccessGate
      node={accessGateNode(requirement)}
      emit={async (event, payload) => {
        if (event === "dismiss") {
          requirement.reject(new Error("Credential request was cancelled"));
          return;
        }
        if (event !== "submit") return;
        const values = payload?.values;
        const credential = values && typeof values === "object" && !Array.isArray(values)
          ? String((values as Record<string, Json>).credential ?? "").trim()
          : "";
        const reference = String(requirement.dependency.ref ?? "").trim();
        if (!credential || !reference) return;
        writeBrowserCredential(reference, credential);
        requirement.resolve();
      }}
      children={undefined}
    />
  );
}
