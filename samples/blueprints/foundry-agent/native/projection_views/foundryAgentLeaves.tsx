import {
  Button,
  Field,
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type ProjectionView } from "@gik/react";
import * as React from "react";

import { SAMPLE_CREDENTIAL_REFERENCES } from "../../../../apps/service-kinds/host/credential-references";
import { clearFunctionAccessKey } from "../../../../apps/service-kinds/host/function-access";

const FOUNDRY_CREDENTIAL_REFERENCE = SAMPLE_CREDENTIAL_REFERENCES.foundry;

const useStyles = makeStyles({
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

const FoundryAgentSelector: ProjectionView = ({ node, emit }) => {
  const agentName = String(node.props.agentName ?? "");
  const agentsStatus = String(node.props.agentsStatus ?? "idle");
  const agentsError = String(node.props.agentsError ?? "");
  const agentOptions = Array.isArray(node.props.agentOptions)
    ? node.props.agentOptions.map((value) => String(value))
    : [];
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (agentsStatus === "idle" && !requested.current) {
      requested.current = true;
      void emit("agentsRequested", {});
    } else if (agentsStatus !== "idle") {
      requested.current = false;
    }
  }, [agentsStatus, emit]);

  if (agentsStatus === "loading" || agentsStatus === "idle") {
    return <Spinner labelPosition="after" label="Loading agents..." />;
  }

  if (agentsStatus === "error") {
    return (
      <Field label="Agent" validationMessage={agentsError || "Couldn't load the available agents."} validationState="error">
        <Button onClick={() => emit("agentsRequested", {})}>Retry loading agents</Button>
      </Field>
    );
  }

  if (agentsStatus === "empty") {
    return <Text>No Foundry agents are available.</Text>;
  }

  return (
    <Field label="Agent">
      <Select value={agentName} onChange={(_event, data) => emit("select", { value: data.value })}>
        {agentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
    </Field>
  );
};

const FoundrySignOutButton: ProjectionView = ({ node, emit }) => (
  <Button onClick={() => {
    clearFunctionAccessKey(FOUNDRY_CREDENTIAL_REFERENCE);
    void emit("press", {});
  }}>
    {String(node.props.label ?? "Sign out")}
  </Button>
);

const FoundryAskPage: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  return (
    <main className={styles.askPage}>
      <h2 className={styles.askPageTitle}>{String(node.props.title ?? "Ask the agent")}</h2>
      {children}
    </main>
  );
};

export default {
  "agent-selector": FoundryAgentSelector,
  "ask-page": FoundryAskPage,
  "sign-out-button": FoundrySignOutButton,
};