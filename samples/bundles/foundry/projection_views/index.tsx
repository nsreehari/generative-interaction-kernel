import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type ProjectionView, useAsyncEmit } from "@gik/react";
import * as React from "react";

import {
  FUNCTION_ACCESS,
  getFunctionAccessKey,
  setFunctionAccessKey,
  type FunctionAccessScope,
} from "../../../shared/function-access";

function accessErrorMessage(reason: unknown, serviceName: string): string {
  if (reason instanceof Error && reason.message.trim() !== "") return reason.message;
  return `Couldn't verify ${serviceName} access.`;
}

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  endpoint: { overflowWrap: "anywhere", userSelect: "text" },
  actions: { paddingTop: tokens.spacingVerticalM },
});

export const FunctionAccessGate: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const scope: FunctionAccessScope = node.capability.startsWith("http-proxy:") ? "http-proxy" : "foundry";
  const access = FUNCTION_ACCESS[scope];
  const getAccessKey = () => getFunctionAccessKey(scope);
  const setAccessKey = (value: string) => setFunctionAccessKey(scope, value);
  const serviceName = access.label;
  const status = String(node.props.status ?? "checking");
  const error = String(node.props.error ?? "");
  const [enteredKey, setEnteredKey] = React.useState("");
  const [hasStoredKey, setHasStoredKey] = React.useState(() => getAccessKey().trim() !== "");
  const [fallbackStatus, setFallbackStatus] = React.useState<"idle" | "checking" | "error">("idle");
  const [fallbackError, setFallbackError] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(true);
  const previousStatus = React.useRef(status);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const { pending, run } = useAsyncEmit(emit);

  React.useEffect(() => {
    const storedKey = getAccessKey().trim();
    setHasStoredKey(storedKey !== "");
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) {
        void emitRef.current(storedKey ? "accessRequested" : "accessCleared", {});
      }
    });

    const accessChanged = (event: Event) => {
      const available = Boolean((event as CustomEvent<{ available?: boolean }>).detail?.available);
      setHasStoredKey(available);
      if (!available) void emitRef.current("accessCleared", {});
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === access.storageKey) {
        const available = Boolean(event.newValue?.trim());
        setHasStoredKey(available);
        if (!available) {
          void emitRef.current("accessCleared", {});
        }
      }
    };
    globalThis.addEventListener?.(access.changeEvent, accessChanged);
    globalThis.addEventListener?.("storage", storageChanged);
    return () => {
      disposed = true;
      globalThis.removeEventListener?.(access.changeEvent, accessChanged);
      globalThis.removeEventListener?.("storage", storageChanged);
    };
  }, []);

  React.useEffect(() => {
    if (status !== "required") {
      setFallbackStatus("idle");
      setFallbackError("");
    }
  }, [status]);

  React.useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    if ((previous === "ready" || previous === "empty") && status !== "ready" && status !== "empty") {
      setDialogOpen(true);
    }
  }, [status]);

  const continueWithKey = () => {
    const key = enteredKey.trim();
    if (!key || pending) return;
    setFallbackStatus("checking");
    setFallbackError("");
    setAccessKey(key);
    setHasStoredKey(true);
    setEnteredKey("");
    void run("accessRequested", {}).catch((reason) => {
      setFallbackStatus("error");
      setFallbackError(accessErrorMessage(reason, serviceName));
    });
  };

  const retry = () => {
    if (pending) return;
    if (!getAccessKey().trim()) {
      setFallbackStatus("idle");
      setFallbackError("");
      void run("accessCleared", {});
      return;
    }
    setFallbackStatus("checking");
    setFallbackError("");
    void run("accessRequested", {}).catch((reason) => {
      setFallbackStatus("error");
      setFallbackError(accessErrorMessage(reason, serviceName));
    });
  };

  const useDifferentKey = () => {
    if (pending) return;
    setAccessKey("");
    setHasStoredKey(false);
    setFallbackStatus("idle");
    setFallbackError("");
    setEnteredKey("");
    void run("accessCleared", {});
  };

  const effectiveStatus = status === "required" && fallbackStatus !== "idle"
    ? fallbackStatus
    : status;
  const effectiveError = status === "required" && fallbackStatus === "error" && fallbackError
    ? fallbackError
    : error;

  if (effectiveStatus === "ready" || effectiveStatus === "empty") return <>{children}</>;

  const requiresKey = effectiveStatus === "required";
  const title = effectiveStatus === "unconfigured" ? `${serviceName} is unavailable` : `Connect to ${serviceName}`;
  const message = requiresKey
    ? effectiveError || `${serviceName} access is required to continue.`
    : effectiveError || (effectiveStatus === "checking" ? `Checking ${serviceName} access...` : `Couldn't verify ${serviceName} access.`);

  return (
    <>
      {!dialogOpen ? (
        <MessageBar intent={effectiveStatus === "checking" ? "info" : "warning"}>
          <MessageBarBody>{message}</MessageBarBody>
          <MessageBarActions
            containerAction={(
              <Button appearance="transparent" onClick={() => setDialogOpen(true)}>
                {requiresKey ? "Enter Access Key" : "Open"}
              </Button>
            )}
          />
        </MessageBar>
      ) : null}
      <Dialog open={dialogOpen} modalType="modal" onOpenChange={(_event, data) => setDialogOpen(data.open)}>
        <DialogSurface aria-label={`${serviceName} access required`}>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent className={styles.stack}>
              <Field label="Base URL">
                <Text className={styles.endpoint}>{access.baseUrl}</Text>
              </Field>
              {effectiveStatus === "checking" ? (
                <Spinner labelPosition="after" label="Checking access..." />
              ) : effectiveStatus === "unconfigured" || effectiveStatus === "error" ? (
                <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar>
              ) : (
                <>
                  <Text>Enter your access key to continue.</Text>
                  <Field label="Access key">
                    <Input
                      type="password"
                      autoFocus
                      value={enteredKey}
                      placeholder="Paste your access key"
                      onChange={(_event, data) => setEnteredKey(data.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") continueWithKey();
                      }}
                    />
                  </Field>
                  {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
                </>
              )}
            </DialogContent>
            <DialogActions className={styles.actions}>
              {hasStoredKey ? <Button onClick={useDifferentKey} disabled={pending}>Reset Key</Button> : null}
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              {requiresKey ? (
                <Button
                  appearance="primary"
                  aria-busy={pending || undefined}
                  disabled={enteredKey.trim() === "" || pending}
                  icon={pending ? <Spinner size="tiny" /> : undefined}
                  onClick={continueWithKey}
                >
                  {pending ? "Connecting..." : "Continue"}
                </Button>
              ) : effectiveStatus === "error" ? (
                <Button
                  appearance="primary"
                  aria-busy={pending || undefined}
                  disabled={pending}
                  icon={pending ? <Spinner size="tiny" /> : undefined}
                  onClick={retry}
                >
                  {pending ? "Retrying..." : "Retry"}
                </Button>
              ) : null}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
};

export default {
  "access-gate": FunctionAccessGate,
};