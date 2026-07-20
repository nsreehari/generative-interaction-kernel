import {
  Button,
  Field,
  Select,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type ProjectionView } from "@gik/react";
import * as React from "react";

import { clearFoundryAccessKey } from "../../../shared/foundry-access";

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
  const agentOptions = Array.isArray(node.props.agentOptions)
    ? node.props.agentOptions.map((value) => String(value))
    : [];
  return (
    <Field label="Agent">
      <Select value={agentName} disabled={agentOptions.length === 0} onChange={(_event, data) => emit("select", { value: data.value })}>
        {agentOptions.length === 0 ? <option value="">No agents available</option> : null}
        {agentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
    </Field>
  );
};

const FoundrySignOutButton: ProjectionView = ({ node, emit }) => (
  <Button onClick={() => {
    clearFoundryAccessKey();
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