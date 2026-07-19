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
  MessageBarBody,
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type ProjectionView } from "@gik/react";
import * as React from "react";

import { discoverFoundryAgents } from "../services";
import {
  FOUNDRY_ACCESS_CHANGE_EVENT,
  clearFoundryAccessKey,
  getFoundryAccessKey,
  setFoundryAccessKey,
} from "../access-storage";

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  actions: { paddingTop: tokens.spacingVerticalM },
  askPage: {
    width: "min(calc(100% - 32px), 760px)",
    marginInline: "auto",
    paddingBlock: tokens.spacingVerticalXXL,
    display: "grid",
    gap: tokens.spacingVerticalL,
    alignContent: "start",
    minWidth: 0,
  },
  askPageTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    textTransform: "uppercase",
    color: tokens.colorNeutralForeground3,
  },
});

const discoveries = new Map<string, Promise<string[]>>();

function discoverAgents(proxyBaseUrl: string, key: string): Promise<string[]> {
  const discoveryKey = `${proxyBaseUrl}\n${key}`;
  const existing = discoveries.get(discoveryKey);
  if (existing) return existing;
  const request = discoverFoundryAgents(proxyBaseUrl, key)
    .finally(() => discoveries.delete(discoveryKey));
  discoveries.set(discoveryKey, request);
  return request;
}

function accessError(error: unknown): string {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  if (status === 401 || status === 403) {
    return "That access key was rejected.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Couldn't load the available agents. Please try again.";
}

const FoundryAccessModal: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const required = Boolean(node.props.required);
  const proxyBaseUrl = String(node.props.proxyBaseUrl ?? "").replace(/\/$/, "");
  const [enteredKey, setEnteredKey] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "checking" | "required">("idle");
  const [error, setError] = React.useState("");
  const [accessRevision, setAccessRevision] = React.useState(0);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;

  React.useEffect(() => {
    const accessChanged = (event: Event) => {
      const available = Boolean((event as CustomEvent<{ available?: boolean }>).detail?.available);
      if (!available) setAccessRevision((revision) => revision + 1);
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === "gik.foundry-agent.access-key") setAccessRevision((revision) => revision + 1);
    };
    globalThis.addEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
    globalThis.addEventListener?.("storage", storageChanged);
    return () => {
      globalThis.removeEventListener?.(FOUNDRY_ACCESS_CHANGE_EVENT, accessChanged);
      globalThis.removeEventListener?.("storage", storageChanged);
    };
  }, []);

  React.useEffect(() => {
    if (!required) {
      setStatus("idle");
      setError("");
      return;
    }
    const storedKey = getFoundryAccessKey().trim();
    if (!storedKey) {
      setStatus("required");
      emitRef.current("accessCleared", {});
      return;
    }

    let cancelled = false;
    setStatus("checking");
    setError("");
    void discoverAgents(proxyBaseUrl, storedKey).then(
      (agentNames) => {
        if (cancelled) return;
        setEnteredKey("");
        setStatus("idle");
        emitRef.current("accessResolved", { key: storedKey, agentNames });
      },
      (reason) => {
        if (cancelled) return;
        clearFoundryAccessKey();
        emitRef.current("accessCleared", {});
        setError(accessError(reason));
        setStatus("required");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [required, proxyBaseUrl, accessRevision]);

  const continueWithKey = async () => {
    const key = enteredKey.trim();
    if (!key) return;
    setStatus("checking");
    setError("");
    try {
      const agentNames = await discoverAgents(proxyBaseUrl, key);
      setFoundryAccessKey(key);
      setEnteredKey("");
      setStatus("idle");
      emit("accessResolved", { key, agentNames });
    } catch (reason) {
      clearFoundryAccessKey();
      emit("accessCleared", {});
      setError(accessError(reason));
      setStatus("required");
    }
  };

  return (
    <Dialog open={required && status !== "idle"} modalType="alert">
      <DialogSurface aria-label="Foundry access required">
        <DialogBody>
          <DialogTitle>Connect to Foundry</DialogTitle>
          <DialogContent className={styles.stack}>
            {status === "checking" ? (
              <Spinner labelPosition="after" label="Checking access and loading agents..." />
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
                      if (event.key === "Enter") void continueWithKey();
                    }}
                  />
                </Field>
                {error !== "" ? (
                  <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                  </MessageBar>
                ) : null}
              </>
            )}
          </DialogContent>
          {status !== "checking" ? (
            <DialogActions className={styles.actions}>
              <Button appearance="primary" disabled={enteredKey.trim() === ""} onClick={() => void continueWithKey()}>
                Continue
              </Button>
            </DialogActions>
          ) : null}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

const FoundryAgentSelector: ProjectionView = ({ node, emit }) => {
  const agentName = String(node.props.agentName ?? "");
  const agentOptions = Array.isArray(node.props.agentOptions)
    ? node.props.agentOptions.map((value) => String(value))
    : [];

  return (
    <Field label="Agent">
      <Select
        value={agentName}
        disabled={agentOptions.length === 0}
        onChange={(_event, data) => emit("select", { value: data.value })}
      >
        {agentOptions.length === 0 ? <option value="">No agents available</option> : null}
        {agentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
    </Field>
  );
};

const FoundryAskPage: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const title = String(node.props.title ?? "Ask the agent");
  return (
    <main className={styles.askPage}>
      <h2 className={styles.askPageTitle}>{title}</h2>
      {children}
    </main>
  );
};

export default {
  "access-modal": FoundryAccessModal,
  "agent-selector": FoundryAgentSelector,
  "ask-page": FoundryAskPage,
};