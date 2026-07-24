import React from "react";
import { makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalL, color: "var(--text)" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  card: {
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusLarge,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    backgroundColor: "var(--panel)",
    boxShadow: tokens.shadow4,
  },
  pre: { margin: 0, whiteSpace: "pre-wrap", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
});

const ReactiveSampleView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const props = readProps(node);
  const sampleName = props.str("sample") || "profile-form";
  const formFirst = props.str("formFirst");
  const formLast = props.str("formLast");
  const consent = props.str("consent");
  const metricsApproved = props.str("metricsApproved");
  const metricsPending = props.str("metricsPending");
  const metricsLimit = props.str("metricsLimit");
  const snapshot = sampleName === "profile-form"
    ? {
        form: { first: formFirst, last: formLast, full: props.str("formFull"), ready: props.bool("formReady") },
        consent,
        ui: { submitLabel: props.str("submitLabel") },
      }
    : {
        metrics: {
          approved: metricsApproved,
          pending: metricsPending,
          limit: metricsLimit,
          total: props.str("metricsTotal"),
          remaining: props.str("metricsRemaining"),
          overLimit: props.bool("metricsOverLimit"),
        },
        ui: { banner: props.str("metricsBanner") },
      };
  const graph = sampleName === "profile-form"
    ? "formFirst + formLast -> profile-full -> formFull\nformFirst + formLast + consent -> profile-ready -> formReady -> profile-label -> submitLabel"
    : "metricsApproved + metricsPending -> metrics-total -> metricsTotal\nmetricsTotal + metricsLimit -> metrics-remaining / metrics-over-limit -> metrics-banner";

  return (
    <div className={styles.stack}>
      <p className="gx-note gx-note-muted">Explicit port tokens drive continuous Kernel computation.</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className="gx-muted">Base cells</div>
          {sampleName === "profile-form" ? (
            <>
              <strong>{formFirst || "<empty>"}</strong>
              <div>{formLast || "<empty>"}</div>
              <div>consent = {consent || "false"}</div>
            </>
          ) : (
            <>
              <strong>approved = {metricsApproved || "0"}</strong>
              <div>pending = {metricsPending || "0"}</div>
              <div>limit = {metricsLimit || "0"}</div>
            </>
          )}
        </div>
        <div className={styles.card}>
          <div className="gx-muted">Derived cells</div>
          {sampleName === "profile-form" ? (
            <>
              <strong>full = {props.str("formFull") || "<empty>"}</strong>
              <div>ready = {String(props.bool("formReady"))}</div>
              <div>submitLabel = {props.str("submitLabel")}</div>
            </>
          ) : (
            <>
              <strong>total = {props.str("metricsTotal") || "0"}</strong>
              <div>remaining = {props.str("metricsRemaining") || "0"}</div>
              <div>banner = {props.str("metricsBanner")}</div>
            </>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className="gx-muted">Snapshot</div>
          <pre className={styles.pre}>{prettyJson(snapshot)}</pre>
        </div>
        <div className={styles.card}>
          <div className="gx-muted">Explicit port graph</div>
          <pre className={styles.pre}>{graph}</pre>
        </div>
      </div>
    </div>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  reactiveSample: ReactiveSampleView,
};

export default projectionViews;