import React from "react";
import { JsonataExpressionProvider } from "@gik/kernel";
import { readProps, type ProjectionView } from "@gik/react";

import { computedGraphToMermaid, ReactiveStateModel, profileFormSample, reactiveComputedSamples } from "@gik/reactive-state-model";

const provider = new JsonataExpressionProvider();
const evaluate = (expr: string, scope: Record<string, unknown>) => provider.eval(expr, scope);

type SampleName = (typeof reactiveComputedSamples)[number]["name"];

function resolveSample(name: string | undefined) {
  return reactiveComputedSamples.find((sample) => sample.name === name) ?? profileFormSample;
}

function coerceBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function coerceNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e0ddd8",
  borderRadius: 10,
  padding: "0.8rem 0.9rem",
  background: "#faf8f4",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.8rem",
};

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const ReactiveSampleView: ProjectionView = ({ node }) => {
  const sampleName = readProps(node).str("sample") as SampleName | "";
  const props = readProps(node);
  const formFirst = props.str("formFirst");
  const formLast = props.str("formLast");
  const consent = props.str("consent");
  const metricsApproved = props.str("metricsApproved");
  const metricsPending = props.str("metricsPending");
  const metricsLimit = props.str("metricsLimit");
  const sample = React.useMemo(() => resolveSample(sampleName), [sampleName]);
  const [tick, setTick] = React.useState(0);
  const storeRef = React.useRef<ReactiveStateModel | null>(null);

  React.useEffect(() => {
    const store = ReactiveStateModel.fromComputed(sample.computed, {
      evaluate,
      initial: sample.initial,
      onChange: () => setTick((value) => value + 1),
    });
    storeRef.current = store;
    void store.settle().then(() => setTick((value) => value + 1));
    return () => {
      void store.dispose();
      storeRef.current = null;
    };
  }, [sample]);

  const snapshot = React.useMemo(() => storeRef.current?.snapshot() ?? sample.initial, [sample.initial, tick]);
  const mermaid = React.useMemo(
    () => computedGraphToMermaid(sample.computed, { title: sample.name, direction: "LR" }),
    [sample]
  );

  const apply = React.useCallback(async (ops: Array<{ op: "set"; path: string; value: unknown }>) => {
    const store = storeRef.current;
    if (!store) return;
    store.apply(ops as never);
    await store.settle();
    setTick((value) => value + 1);
  }, []);

  React.useEffect(() => {
    if (sample.name === "profile-form") {
      void apply([
        { op: "set", path: "form.first", value: formFirst },
        { op: "set", path: "form.last", value: formLast },
        { op: "set", path: "consent", value: coerceBoolean(consent) },
      ]);
      return;
    }

    void apply([
      { op: "set", path: "metrics.approved", value: coerceNumber(metricsApproved, 0) },
      { op: "set", path: "metrics.pending", value: coerceNumber(metricsPending, 0) },
      { op: "set", path: "metrics.limit", value: coerceNumber(metricsLimit, 0) },
    ]);
  }, [apply, consent, formFirst, formLast, metricsApproved, metricsLimit, metricsPending, sample.name]);

  return (
    <div style={stackStyle}>
      <p className="gx-note gx-note-muted">{sample.description}</p>

      <div style={gridStyle}>
        <div style={cardStyle}>
          <div className="gx-muted">Base cells</div>
          {sample.name === "profile-form" ? (
            <>
              <strong>{String((snapshot as Record<string, any>).form?.first ?? "") || "<empty>"}</strong>
              <div>{String((snapshot as Record<string, any>).form?.last ?? "") || "<empty>"}</div>
              <div>consent = {String((snapshot as Record<string, any>).consent ?? false)}</div>
            </>
          ) : (
            <>
              <strong>approved = {String((snapshot as Record<string, any>).metrics?.approved ?? 0)}</strong>
              <div>pending = {String((snapshot as Record<string, any>).metrics?.pending ?? 0)}</div>
              <div>limit = {String((snapshot as Record<string, any>).metrics?.limit ?? 0)}</div>
            </>
          )}
        </div>
        <div style={cardStyle}>
          <div className="gx-muted">Derived cells</div>
          {sample.name === "profile-form" ? (
            <>
              <strong>full = {String((snapshot as Record<string, any>).form?.full ?? "") || "<empty>"}</strong>
              <div>ready = {String((snapshot as Record<string, any>).form?.ready ?? false)}</div>
              <div>submitLabel = {String((snapshot as Record<string, any>).ui?.submitLabel ?? "")}</div>
            </>
          ) : (
            <>
              <strong>total = {String((snapshot as Record<string, any>).metrics?.total ?? 0)}</strong>
              <div>remaining = {String((snapshot as Record<string, any>).metrics?.remaining ?? 0)}</div>
              <div>banner = {String((snapshot as Record<string, any>).ui?.banner ?? "")}</div>
            </>
          )}
        </div>
      </div>

      <div style={gridStyle}>
        <div style={cardStyle}>
          <div className="gx-muted">Snapshot</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{prettyJson(snapshot)}</pre>
        </div>
        <div style={cardStyle}>
          <div className="gx-muted">Inferred dependency graph</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{mermaid}</pre>
        </div>
      </div>
    </div>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  reactiveSample: ReactiveSampleView,
};

export default projectionViews;