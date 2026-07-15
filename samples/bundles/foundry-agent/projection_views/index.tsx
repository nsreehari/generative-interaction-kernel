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
import { useAsyncEmit, type ProjectionView } from "@gik/react";

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
});

// The whole sign-in front door: the agent list is fetched by the `listAgents` invoke effect and
// rendered from the store (agent.agentOptions / listed / listError), and the in-flight spinner rides
// on the shared useAsyncEmit hook — the same pending path as the floor ui:button. Only durable intent
// (the key, the chosen agent name, and "verify") crosses back to the store via `emit`.
const FoundryLogin: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const key = String(node.props.key ?? "");
  const agentName = String(node.props.agentName ?? "");
  const authError = String(node.props.authError ?? "");
  const listError = String(node.props.listError ?? "");
  const listed = Boolean(node.props.listed);
  const agentOptions = Array.isArray(node.props.agentOptions)
    ? node.props.agentOptions.map((value) => String(value))
    : [];

  // The agent list + loading come from the store (via the listAgents invoke) instead of local
  // state, so this button shares the same useAsyncEmit pending path as the floor ui:button.
  const { pending, run } = useAsyncEmit(emit);

  const hasKey = key.trim().length > 0;
  const hasAgent = agentName.trim().length > 0;
  const showSelect = !pending && agentOptions.length > 0;
  const showNoAgents = !pending && listed && agentOptions.length === 0 && listError === "";

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
        <Button onClick={() => void run("listAgents")} disabled={pending}>
          List agents
        </Button>
      )}

      {pending && <Spinner size="tiny" labelPosition="after" label="Loading agents…" />}

      {showSelect && (
        <Field label="Agent">
          <Select value={agentName} onChange={(_event, data) => emit("setAgent", { value: data.value })}>
            {agentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
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

export default { login: FoundryLogin };