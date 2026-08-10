import React from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, eventContract, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const useStyles = makeStyles({
  message: { margin: `0 0 ${tokens.spacingVerticalL}`, color: tokens.colorNeutralForeground2 },
  label: { display: "grid", gap: tokens.spacingVerticalS, fontWeight: tokens.fontWeightSemibold },
  error: { minHeight: tokens.lineHeightBase300, marginTop: tokens.spacingVerticalXS, color: tokens.colorPaletteRedForeground1 },
});

export const MathChallenge: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const props = readProps(node);
  const operandA = Number(node.props.operandA ?? 3);
  const operandB = Number(node.props.operandB ?? 7);
  const [answer, setAnswer] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const titleId = `${node.id}-title`;
  const messageId = `${node.id}-message`;
  const answered = answer.trim().length > 0;
  const correct = answered && Number(answer) === operandA + operandB;
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <Dialog open modalType="alert" onOpenChange={(_event, data) => { if (!data.open) void emit("cancel", { reason: "escape" }); }}>
      <DialogSurface {...componentRootProps(node)} aria-labelledby={titleId} aria-describedby={messageId}>
        <form onSubmit={(event) => { event.preventDefault(); if (correct) void emit("confirm", {}); }}>
          <DialogBody>
            <DialogTitle id={titleId}>{props.str("title", "Confirm destructive action")}</DialogTitle>
            <DialogContent>
              <p className={styles.message} id={messageId}>{props.str("message", "This action cannot be undone.")}</p>
          <label className={styles.label} htmlFor={`${node.id}-answer`}>Solve to continue: <strong>{operandA} + {operandB} = ?</strong></label>
          <Input ref={inputRef} id={`${node.id}-answer`} type="number" inputMode="numeric" value={answer} aria-invalid={answered && !correct} autoComplete="off" onChange={(_, data) => setAnswer(data.value)} />
          <div className={styles.error} aria-live="polite">{answered && !correct ? "Incorrect answer. Try again." : ""}</div>
            </DialogContent>
            <DialogActions>
            <Button type="button" onClick={() => void emit("cancel", { reason: "button" })}>{props.str("cancelLabel", "Cancel")}</Button>
            <Button appearance="primary" type="submit" disabled={!correct}>{props.str("confirmLabel", "Delete")}</Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { ...componentStylePropsSchema, operandA: { type: "number" }, operandB: { type: "number" }, title: { type: "string" }, message: { type: "string" }, cancelLabel: { type: "string" }, confirmLabel: { type: "string" } },
} as const;
const description: ComponentDescription = {
  capability: "primitive:math-challenge",
  summary: "Gates a destructive confirmation behind a small arithmetic challenge.",
  dataProp: "message",
  events: ["confirm", "cancel"],
  eventContracts: {
    confirm: eventContract("The user solves the challenge and confirms the action."),
    cancel: eventContract("The user cancels the challenge.", { reason: { enum: ["escape", "button"] } }),
  },
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A destructive action requires deliberate confirmation"],
    avoidWhen: ["A normal confirmation button is sufficient", "The operation is reversible"],
    rules: ["Handle both confirm and cancel", "Explain the destructive consequence in message", "Do not use as authentication"],
  },
};
export function validateMathChallenge(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:math-challenge props", code: "primitive-math-challenge-schema" }], props as Json);
}
export const mathChallengeDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: MathChallenge,
  getSchema: () => schema,
  validate: validateMathChallenge,
  materializeTrial: () => trialNode("primitive:math-challenge", { title: "Delete Blueprint", message: "This action cannot be undone.", operandA: 3, operandB: 7 }),
});