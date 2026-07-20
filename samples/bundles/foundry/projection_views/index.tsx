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

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  actions: { paddingTop: tokens.spacingVerticalM },
});

const FoundryAccessGate: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const status = String(node.props.status ?? "checking");
  const error = String(node.props.error ?? "");
  const [enteredKey, setEnteredKey] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(true);
  const previousStatus = React.useRef(status);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const { pending, run } = useAsyncEmit(emit, { delayMs: 120 });

  React.useEffect(() => {
    const storedKey = getFoundryAccessKey().trim();
    void emitRef.current(storedKey ? "accessRequested" : "accessCleared", {});

    const accessChanged = (event: Event) => {
      const available = Boolean((event as CustomEvent<{ available?: boolean }>).detail?.available);
      if (!available) void emitRef.current("accessCleared", {});
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === "gik.foundry-agent.access-key" && !event.newValue) {
        void emitRef.current("accessCleared", {});
      }
    };
    globalThis.addEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
    globalThis.addEventListener?.("storage", storageChanged);
    return () => {
      globalThis.removeEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
      globalThis.removeEventListener?.("storage", storageChanged);
    };
  }, []);

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
    setFoundryAccessKey(key);
    setEnteredKey("");
    void run("accessRequested", {});
  };

  const retry = () => {
    if (pending) return;
    void run(getFoundryAccessKey().trim() ? "accessRequested" : "accessCleared", {});
  };

  if (status === "ready" || status === "empty") return <>{children}</>;

  const requiresKey = status === "required";
  const title = status === "unconfigured" ? "Foundry is unavailable" : "Connect to Foundry";
  const message = requiresKey
    ? error || "Foundry access is required to continue."
    : error || (status === "checking" ? "Checking Foundry access..." : "Couldn't load the available agents.");

  return (
    <>
      {!dialogOpen ? (
        <MessageBar intent={status === "checking" ? "info" : "warning"}>
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
              {status === "checking" ? (
                <Spinner labelPosition="after" label="Checking access and loading agents..." />
              ) : status === "unconfigured" || status === "error" ? (
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
              ) : status === "error" ? (
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