// Right panel — the inspector: read-only views of each layer's artifact. This is where the
// Presentation DSL (priority / disclosure / rationale) becomes visible.

import { useState } from "react";
import type { ResolvedNode, Patch, TraceEvent } from "../../../../kernel/src/index";
import type { Session } from "../session";

type Tab = "presentation" | "document" | "tree" | "traces";

const TABS: { id: Tab; label: string }[] = [
  { id: "presentation", label: "Presentation DSL" },
  { id: "document", label: "UI DSL" },
  { id: "tree", label: "Resolved tree" },
  { id: "traces", label: "Traces" },
];

export function ArtifactTabs({
  session,
  tree,
  patch,
}: {
  session: Session;
  tree: ResolvedNode | null;
  patch: Patch | null;
}) {
  const [tab, setTab] = useState<Tab>("presentation");

  return (
    <section className="artifacts">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "presentation" && <PresentationView session={session} />}
      {tab === "document" && <Json value={session.document} />}
      {tab === "tree" && <Json value={tree} />}
      {tab === "traces" && <Traces traces={session.traces} patch={patch} />}
    </section>
  );
}

function PresentationView({ session }: { session: Session }) {
  const p = session.presentation;
  return (
    <div className="scroll">
      <p className="muted">
        <b>{p.layout}</b> · {p.arrangement}
      </p>
      <table className="regions">
        <thead>
          <tr>
            <th>region</th>
            <th>role</th>
            <th>priority</th>
            <th>disclosure</th>
            <th>presentation</th>
            <th>rationale</th>
          </tr>
        </thead>
        <tbody>
          {p.regions.map((r) => (
            <tr key={r.name}>
              <td><code>{r.name}</code></td>
              <td>{r.role}</td>
              <td className={`pri-${r.priority}`}>{r.priority}</td>
              <td>{r.disclosure}</td>
              <td>{r.presentation ?? "—"}</td>
              <td className="muted">{r.rationale ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Traces({ traces, patch }: { traces: TraceEvent[]; patch: Patch | null }) {
  return (
    <div className="scroll">
      <p className="muted">last patch: rev {patch?.rev ?? "—"} · {patch?.ops.length ?? 0} op(s)</p>
      <ul className="traces">
        {traces.length === 0 && <li className="muted">no traces yet — fire an event</li>}
        {traces.map((t, i) => (
          <li key={i}>
            <span className={`tag trace-${t.event}`}>{t.event}</span>
            {t.node && <code>{t.node}</code>}
            {t.detail && Object.keys(t.detail).length > 0 && (
              <span className="muted"> {JSON.stringify(t.detail)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <div className="scroll">
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
