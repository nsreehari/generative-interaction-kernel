import React from "react";
import {
  Button,
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
import type { ProjectionView } from "@gik/react";
import manifest from "../manifest.json";

// Same single source of truth the effect handlers use: the proxy base is declared once in the
// bundle manifest (payload.config.proxyBase).
const PROXY_BASE = String(manifest.payload.config.proxyBase).replace(/\/$/, "");

interface AgentOption {
  value: string;
  label: string;
}

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
});

// The whole sign-in front door: fetches the agent list for the entered key (locally, with a spinner),
// then lets the user pick an agent and continue. Only the durable bits — the key, the chosen agent
// name, and the "verify" intent — are pushed to the store via `emit`; the transient list/loading state
// lives in local React state.
const FoundryLogin: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const key = String(node.props.key ?? "");
  const agentName = String(node.props.agentName ?? "");
  const authError = String(node.props.authError ?? "");

  const [loading, setLoading] = React.useState(false);
  const [listed, setListed] = React.useState(false);
  const [listError, setListError] = React.useState("");
  const [options, setOptions] = React.useState<AgentOption[]>([]);

  // Drop any fetched list when the key changes so a stale list can't linger under a new key.
  React.useEffect(() => {
    setListed(false);
    setListError("");
    setOptions([]);
  }, [key]);

  const hasKey = key.trim().length > 0;
  const hasAgent = agentName.trim().length > 0;
  const showSelect = !loading && options.length > 0;
  const showNoAgents = !loading && listed && options.length === 0 && listError === "";

  async function listAgents(): Promise<void> {
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setListError("");
    try {
      // New Foundry Agent Service: agents are listed by NAME under /agents (api-version=v1),
      // not the classic /assistants endpoint.
      const res = await fetch(`${PROXY_BASE}/api/foundry/agents?api-version=v1`, {
        method: "GET",
        headers: { "x-functions-key": trimmed },
      });
      if (res.status === 401 || res.status === 403) {
        setOptions([]);
        setListError("That access key was rejected.");
        setListed(true);
        return;
      }
      if (!res.ok) {
        setOptions([]);
        setListError("Couldn't load the agent list.");
        setListed(true);
        return;
      }
      const data = (await res.json()) as {
        data?: Array<{ name?: unknown; state?: unknown }>;
      };
      const opts: AgentOption[] = (Array.isArray(data?.data) ? data.data : [])
        .filter((a) => a && typeof a.name === "string" && a.name.trim() !== "" && a.state !== "disabled")
        .map((a) => {
          const name = String(a.name);
          return { value: name, label: name };
        });
      setOptions(opts);
      setListed(true);
      // Default to the first agent so the visible selection matches state and Continue can appear.
      if (opts.length > 0 && agentName.trim() === "") emit("setAgent", { value: opts[0].value });
    } catch {
      setOptions([]);
      setListError("Couldn't reach the service. Please try again.");
      setListed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.stack}>
      <Text>Enter your access key, then choose an agent to continue.</Text>

      <Field label="Access key">
        <Input
          type="password"
          value={key}
          placeholder="Paste your access key"
          onChange={(_event, data) => emit("setKey", { value: data.value })}
        />
      </Field>

      {hasKey && (
        <Button onClick={() => void listAgents()} disabled={loading}>
          List agents
        </Button>
      )}

      {loading && <Spinner size="tiny" labelPosition="after" label="Loading agents…" />}

      {showSelect && (
        <Field label="Agent">
          <Select value={agentName} onChange={(_event, data) => emit("setAgent", { value: data.value })}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {showNoAgents && (
        <MessageBar intent="warning">
          <MessageBarBody>No agents are available for this key.</MessageBarBody>
        </MessageBar>
      )}

      {listError !== "" && (
        <MessageBar intent="error">
          <MessageBarBody>{listError}</MessageBarBody>
        </MessageBar>
      )}

      {authError !== "" && (
        <MessageBar intent="error">
          <MessageBarBody>{authError}</MessageBarBody>
        </MessageBar>
      )}

      {hasAgent && (
        <Button appearance="primary" onClick={() => emit("verify")}>
          Continue
        </Button>
      )}
    </div>
  );
};

// The Ask button, with an in-flight spinner. The kernel dispatch is atomic (reducer ops + the
// askAgent effect settle before a single re-render), so a store flag can't paint a "thinking"
// state. Instead we hold `loading` in LOCAL React state: clicking flips it true (renders
// immediately), and we clear it when the effect completes — signaled by a bumped `agent.replyRev`.
const FoundryAsk: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const label = String(node.props.label ?? "Ask");
  const replyRev = Number(node.props.replyRev ?? 0);
  const [loading, setLoading] = React.useState(false);

  // Each completed ask bumps replyRev; that's our cue to drop the spinner.
  React.useEffect(() => {
    setLoading(false);
  }, [replyRev]);

  return (
    <div className={styles.stack}>
      <Button
        appearance="primary"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          emit("ask");
        }}
      >
        {label}
      </Button>
      {loading && <Spinner size="tiny" labelPosition="after" label="Thinking…" />}
    </div>
  );
};

export default { login: FoundryLogin, ask: FoundryAsk };