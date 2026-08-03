import React from "react";
import {
  Button,
  ToggleButton,
  makeStyles,
  tokens,
  type ButtonProps,
} from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, useCountdownTimer, type ProjectionView } from "@gik/react";

import {
  defineComponent,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema } from "../../shared/component";

export const TIMER_BUTTON_PACES = ["manual", "auto"] as const;
export const TIMER_BUTTON_VARIANTS = ["standard", "auto-only"] as const;
export const TIMER_BUTTON_APPEARANCES = ["primary", "secondary", "outline", "subtle", "transparent"] as const;
export const TIMER_BUTTON_SIZES = ["small", "medium", "large"] as const;
export type TimerButtonPace = typeof TIMER_BUTTON_PACES[number];

const useStyles = makeStyles({
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

export function formatTimerButtonCountdown(remainingSeconds: number): string {
  const seconds = Math.max(0, Math.floor(remainingSeconds));
  if (seconds <= 59) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function duration(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export const TimerButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const styles = useStyles();
  const [pace, setPace] = React.useState<TimerButtonPace>(
    () => node.props.defaultPace === "manual" ? "manual" : "auto",
  );
  const autoOnly = node.props.variant === "auto-only";
  const effectivePace: TimerButtonPace = autoOnly ? "auto" : pace;
  const defaultDurationMs = duration(node.props.durationMs, 3000);
  const durationMs = effectivePace === "auto"
    ? duration(node.props.autoDurationMs, defaultDurationMs)
    : duration(node.props.manualDurationMs, defaultDurationMs);
  const disabled = props.bool("disabled");
  const showCountdown = node.props.showCountdown !== false;
  const showPaceSwitch = !autoOnly && node.props.showPaceSwitch === true;
  const running = effectivePace === "auto" && node.props.autoStart !== false && !disabled;
  const externalResetKey = node.props.resetKey ?? "";
  const previousResetKey = React.useRef(externalResetKey);
  React.useEffect(() => {
    const previous = Number(previousResetKey.current);
    const current = Number(externalResetKey);
    previousResetKey.current = externalResetKey;
    if (Number.isFinite(previous) && Number.isFinite(current) && current < previous) {
      setPace(autoOnly || node.props.defaultPace !== "manual" ? "auto" : "manual");
    }
  }, [autoOnly, externalResetKey, node.props.defaultPace]);
  const timer = useCountdownTimer({
    durationMs,
    running,
    resetKey: `${JSON.stringify(externalResetKey)}:${effectivePace}`,
    onElapsed: () => {
      void emit("press", { reason: "timeout" });
      if (node.props.repeat === true) timer.restart();
    },
  });
  const label = props.str("label");
  const countdown = formatTimerButtonCountdown(timer.remainingSeconds);
  const ariaLabel = props.str("ariaLabel") || label;

  return (
    <div {...componentRootProps(node, styles.root)}>
      {showPaceSwitch ? (
        <ToggleButton
          checked={effectivePace === "auto"}
          size="small"
          aria-label={props.str("paceAriaLabel", "Automatically trigger when the countdown ends")}
          onClick={() => setPace((current) => current === "auto" ? "manual" : "auto")}
        >
          {effectivePace === "auto" ? props.str("autoLabel", "Auto") : props.str("manualLabel", "Manual")}
        </ToggleButton>
      ) : null}
      <Button
        appearance={props.str("appearance", "secondary") as ButtonProps["appearance"]}
        size={props.str("size", "medium") as ButtonProps["size"]}
        disabled={disabled}
        aria-label={running && showCountdown ? `${ariaLabel}, ${timer.remainingSeconds} seconds remaining` : ariaLabel}
        onClick={() => {
          void emit("press", { reason: "manual" });
          timer.restart();
        }}
      >
        {label}
        {running && showCountdown ? ` · ${countdown}` : null}
      </Button>
    </div>
  );
};

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    ...componentStylePropsSchema,
    label: { type: "string", minLength: 1 },
    variant: { enum: TIMER_BUTTON_VARIANTS },
    ariaLabel: { type: "string", minLength: 1 },
    durationMs: { type: "number", minimum: 0 },
    autoDurationMs: { type: "number", minimum: 0 },
    manualDurationMs: { type: "number", minimum: 0 },
    defaultPace: { enum: TIMER_BUTTON_PACES },
    autoStart: { type: "boolean" },
    repeat: { type: "boolean" },
    showCountdown: { type: "boolean" },
    showPaceSwitch: { type: "boolean" },
    disabled: { type: "boolean" },
    resetKey: { type: ["string", "number", "boolean", "null"] },
    appearance: { enum: TIMER_BUTTON_APPEARANCES },
    size: { enum: TIMER_BUTTON_SIZES },
    paceAriaLabel: { type: "string", minLength: 1 },
    autoLabel: { type: "string", minLength: 1 },
    manualLabel: { type: "string", minLength: 1 },
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:timer-button",
  summary: "Renders a button that can emit manually or when an optional countdown elapses.",
  events: ["press"],
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    {
      value: "standard",
      summary: "Supports manual or automatic pace, with an optional user-facing pace switch.",
      useWhen: ["The authored flow may use manual pace or let the user choose between manual and automatic pace"],
    },
    {
      value: "auto-only",
      summary: "Always runs in automatic pace and never displays the manual/auto switch.",
      useWhen: ["The action must trigger automatically without exposing manual versus automatic pace controls"],
    },
  ],
  authoring: {
    useWhen: [
      "An action may be triggered manually or after a visible delay",
      "A user-selectable manual/auto pace supports repeated demonstrations or guided flows",
    ],
    avoidWhen: [
      "Elapsed time is informational and must not trigger an action",
      "The workflow needs scheduling that must survive an unmounted UI",
    ],
    rules: [
      "Handle press payload reason as manual or timeout",
      "Set showPaceSwitch only when the user should control manual versus auto behavior",
      "Use auto-only when the action must always run in automatic pace without exposing pace controls",
      "Set repeat only when every elapsed interval should trigger another press",
      "Use resetKey to restart the countdown when external progress changes",
      "Keep durable scheduling and domain workflow state outside the projection component",
    ],
  },
};

export function describeTimerButton(): ComponentDescription {
  return description;
}

export function getTimerButtonSchema(): Record<string, unknown> {
  return schema as unknown as Record<string, unknown>;
}

export function validateTimerButton(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: getTimerButtonSchema(),
    message: "Invalid primitive:timer-button props",
    code: "primitive-timer-button-schema",
  }], props as Json);
}

export function materializeTimerButtonTrial() {
  return trialNode("primitive:timer-button", {
    label: "Continue",
    variant: "standard",
    durationMs: 5000,
    defaultPace: "auto",
    showCountdown: true,
    showPaceSwitch: true,
  });
}

export const timerButtonDefinition = defineComponent({
  description,
  version: "1.1.0",
  component: TimerButton,
  getSchema: getTimerButtonSchema,
  validate: validateTimerButton,
  materializeTrial: materializeTimerButtonTrial,
});