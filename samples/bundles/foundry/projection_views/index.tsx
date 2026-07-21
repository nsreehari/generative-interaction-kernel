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
  FOUNDRY_ACCESS_CHANGE_EVENT,
  getFoundryAccessKey,
  setFoundryAccessKey,
} from "../../../shared/foundry-access";

function accessErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim() !== "") return reason.message;
  return "Couldn't verify Foundry access.";
}

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  actions: { paddingTop: tokens.spacingVerticalM },
});

const FoundryAccessGate: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const status = String(node.props.status ?? "checking");
  const error = String(node.props.error ?? "");
  const [enteredKey, setEnteredKey] = React.useState("");
  const [hasStoredKey, setHasStoredKey] = React.useState(() => getFoundryAccessKey().trim() !== "");
  const [fallbackStatus, setFallbackStatus] = React.useState<"idle" | "checking" | "error">("idle");
  const [fallbackError, setFallbackError] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(true);
  const previousStatus = React.useRef(status);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const { pending, run } = useAsyncEmit(emit);

  React.useEffect(() => {
    const storedKey = getFoundryAccessKey().trim();
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
      if (event.key === "gik.foundry-agent.access-key") {
        const available = Boolean(event.newValue?.trim());
        setHasStoredKey(available);
        if (!available) {
          void emitRef.current("accessCleared", {});
        }
      }
    };
    globalThis.addEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
    globalThis.addEventListener?.("storage", storageChanged);
    return () => {
      disposed = true;
      globalThis.removeEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
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
    setFoundryAccessKey(key);
    setHasStoredKey(true);
    setEnteredKey("");
    void run("accessRequested", {}).catch((reason) => {
      setFallbackStatus("error");
      setFallbackError(accessErrorMessage(reason));
    });
  };

  const retry = () => {
    if (pending) return;
    if (!getFoundryAccessKey().trim()) {
      setFallbackStatus("idle");
      setFallbackError("");
      void run("accessCleared", {});
      return;
    }
    setFallbackStatus("checking");
    setFallbackError("");
    void run("accessRequested", {}).catch((reason) => {
      setFallbackStatus("error");
      setFallbackError(accessErrorMessage(reason));
    });
  };

  const useDifferentKey = () => {
    if (pending) return;
    setFoundryAccessKey("");
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
  const title = effectiveStatus === "unconfigured" ? "Foundry is unavailable" : "Connect to Foundry";
  const message = requiresKey
    ? effectiveError || "Foundry access is required to continue."
    : effectiveError || (effectiveStatus === "checking" ? "Checking Foundry access..." : "Couldn't verify Foundry access.");

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
        <DialogSurface aria-label="Foundry access required">
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent className={styles.stack}>
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
  "access-gate": FoundryAccessGate,
};