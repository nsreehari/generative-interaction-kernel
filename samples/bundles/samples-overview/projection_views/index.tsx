import React from "react";
import type { ProjectionView } from "@gik/react";

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: "1.2rem",
  color: "#23180f",
};

const heroStyle: React.CSSProperties = {
  padding: "1.35rem 1.4rem",
  borderRadius: 18,
  background: "radial-gradient(circle at top left, #fbf3dd 0%, #f0e3c7 48%, #ead5b3 100%)",
  border: "1px solid #d8c19a",
  boxShadow: "0 18px 40px rgba(98, 67, 24, 0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "1rem",
};

const cardStyle: React.CSSProperties = {
  padding: "1rem 1.05rem",
  borderRadius: 16,
  border: "1px solid #e4d8c7",
  background: "linear-gradient(180deg, #fffdfa 0%, #f8f4ee 100%)",
  boxShadow: "0 8px 24px rgba(72, 50, 18, 0.05)",
};

const sectionStyle: React.CSSProperties = {
  ...cardStyle,
  padding: "1.1rem 1.15rem",
};

const eyebrowStyle: React.CSSProperties = {
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontSize: "0.77rem",
  fontWeight: 700,
  color: "#7d5c2b",
  marginBottom: "0.65rem",
};

const heroGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(260px, 1fr)",
  gap: "1rem",
  alignItems: "start",
};

const ctaRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.65rem",
  marginTop: "1rem",
};

const buttonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #c9ab76",
  background: "#fff9ef",
  color: "#5c4218",
  borderRadius: 999,
  padding: "0.58rem 0.88rem",
  fontWeight: 700,
  fontSize: "0.92rem",
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(87, 60, 19, 0.08)",
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#6e4d1d",
  borderColor: "#6e4d1d",
  color: "#fff7ea",
};

const statCardStyle: React.CSSProperties = {
  padding: "0.85rem 0.95rem",
  borderRadius: 14,
  border: "1px solid rgba(117, 84, 31, 0.14)",
  background: "rgba(255, 248, 236, 0.7)",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 700,
  lineHeight: 1.15,
};

const codeStyle: React.CSSProperties = {
  margin: 0,
  padding: "1rem 1.05rem",
  borderRadius: 14,
  background: "#201911",
  color: "#f7efe2",
  whiteSpace: "pre-wrap",
  fontSize: "0.92rem",
  lineHeight: 1.45,
  border: "1px solid #3b2c1a",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.95rem",
};

const cellStyle: React.CSSProperties = {
  borderTop: "1px solid #e3dbcf",
  padding: "0.72rem 0.55rem",
  textAlign: "left",
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.24rem 0.56rem",
  borderRadius: 999,
  background: "#efe3cb",
  color: "#724e17",
  fontSize: "0.82rem",
  fontWeight: 600,
  marginBottom: "0.55rem",
};

const leadStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.65,
  fontSize: "1.02rem",
  maxWidth: 760,
};

const subleadStyle: React.CSSProperties = {
  margin: "0.7rem 0 0",
  lineHeight: 1.62,
  color: "#5b4632",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "0.7rem",
  fontSize: "1.05rem",
};

const laneGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.85rem",
};

const laneStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px minmax(0, 1fr)",
  gap: "0.9rem",
  alignItems: "start",
};

const laneLabelStyle: React.CSSProperties = {
  padding: "0.9rem 0.95rem",
  borderRadius: 14,
  background: "#f0e3cc",
  border: "1px solid #d8c19a",
  color: "#5e4314",
  fontWeight: 700,
};

const laneCardsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem",
};

const flowCardStyle: React.CSSProperties = {
  ...cardStyle,
  minHeight: 116,
};

const customerScript = `GenUI is a declarative interaction platform, and this sample set is the quickest way to understand its product surface.
Start in the browser host: it mounts authored bundles and lets you move between focused experiences without changing infrastructure.

Console is the operational view for profile governance: inspect profiles, validate them, preview them, and manage editable local copies beside read-only repo examples.

Reactive Demo is the narrow proof that declarative state stays inspectable: you can see both the computed results and the dependency graph that produced them.

Provider Authoring Demo shows the planning layer: consequence graphs, exploratory graphs, and step orchestration combined into a higher-level authoring workflow.

Workbench is the studio view: shape an interaction, build a live session, inspect the lowered output, and iterate across the same runtime.

Outside the browser, the other sample hosts show the remaining adoption boundaries: authoring tools only, one live runtime exposed to external clients, or direct kernel embedding inside backend services.`;

const bundleLinks = [
  { id: "samples-overview", label: "Stay On Overview" },
  { id: "console", label: "Open Console" },
  { id: "reactive-demo", label: "Open Reactive Demo" },
  { id: "provider-authoring-demo", label: "Open Provider Authoring Demo" },
  { id: "workbench", label: "Open Workbench" },
];

const browserBundles = [
  {
    name: "Console",
    promise: "Profile governance and lifecycle",
    summary: "Operational surface for inspecting profiles, validating them, previewing them, and managing browser-stored editable copies.",
  },
  {
    name: "Reactive Demo",
    promise: "Reactive state and graph explanation",
    summary: "Explains how declarative computed state behaves by showing both derived values and the graph behind them.",
  },
  {
    name: "Provider Authoring Demo",
    promise: "Assisted profile authoring",
    summary: "Shows how planning signals can be composed into a guided profile-and-recipe authoring experience.",
  },
  {
    name: "Workbench",
    promise: "Integrated studio",
    summary: "The richest end-to-end sample: shape the interaction, run the session, and inspect the generated output in one place.",
  },
];

const browserLane = [
  {
    name: "Samples Overview",
    emphasis: "Orientation",
    summary: "Start here for the product brief, adoption map, and recommended entry points.",
  },
  {
    name: "Console",
    emphasis: "Operate",
    summary: "Manage the profile lifecycle: inspect, validate, preview, and store local copies.",
  },
  {
    name: "Reactive Demo",
    emphasis: "Explain",
    summary: "See how declarative state derives results and how its dependency graph stays inspectable.",
  },
  {
    name: "Provider Authoring Demo",
    emphasis: "Plan",
    summary: "Use graph-driven signals to assemble an authoring workflow around profiles and recipes.",
  },
  {
    name: "Workbench",
    emphasis: "Build",
    summary: "Work inside the studio-style flow: shape the interaction, run it, and inspect the output.",
  },
];

const outwardLane = [
  {
    name: "agent-host",
    emphasis: "Tools only",
    summary: "Expose authoring and validation tools over MCP without a live runtime in the middle.",
  },
  {
    name: "control-host",
    emphasis: "Live runtime",
    summary: "Expose one running system outward through SSE render stream and MCP projections.",
  },
  {
    name: "backend-host",
    emphasis: "Embed",
    summary: "Drop the kernel directly into service code when UI hosting is not the concern.",
  },
];

const hostShapes = [
  {
    name: "apps/host",
    when: "You need a browser renderer/container for bundles.",
    value: "One generic host that can run many browser sample bundles by id.",
  },
  {
    name: "agent-host",
    when: "You want authoring and validation tools only.",
    value: "Stateless MCP surface with no live kernel runtime.",
  },
  {
    name: "control-host",
    when: "You want one authoritative runtime exposed outward.",
    value: "One live runtime surfaced as SSE render stream plus agent/control MCP projections.",
  },
  {
    name: "backend-host",
    when: "You want kernel infrastructure inside service code.",
    value: "Direct kernel embedding with backend orchestration and no browser shell.",
  },
];

const personas = [
  {
    who: "Frontend / product engineer",
    start: "Start with Samples Overview, then Console, then Workbench.",
    reason: "This gives you the orientation first, then the operational view, then the richer studio-style experience.",
  },
  {
    who: "Profile / recipe author",
    start: "Start with Console, then Provider Authoring Demo.",
    reason: "You see both the profile lifecycle and the higher-level planning seams around authoring decisions.",
  },
  {
    who: "Platform / runtime engineer",
    start: "Start with control-host, then backend-host.",
    reason: "Those samples show live runtime hosting versus direct kernel embedding.",
  },
  {
    who: "Copilot / agent integrator",
    start: "Start with agent-host, then Provider Authoring Demo.",
    reason: "You can separate authoring-tool exposure from any live runtime concerns.",
  },
];

function openBundle(bundleId: string) {
  const current = new URL(window.location.href);
  current.searchParams.set("bundle", bundleId);
  window.location.assign(current.toString());
}

const SamplesOverviewView: ProjectionView = () => {
  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroGridStyle}>
          <div>
            <div style={eyebrowStyle}>GenUI Sample Portfolio</div>
            <h2 style={{ margin: "0 0 0.55rem", fontSize: "1.82rem", lineHeight: 1.08, maxWidth: 720 }}>
              Declarative interaction, shown as a product surface instead of a code dump.
            </h2>
            <p style={leadStyle}>
              GenUI is easiest to understand when you see the same platform at a few deliberate boundaries:
              browser rendering, profile operations, authoring guidance, live runtime hosting, and direct backend embedding.
            </p>
            <p style={subleadStyle}>
              Use this page when the right question is not “how is the repo wired?” but “what would I show an
              external product engineer in the first five minutes?”
            </p>
            <div style={ctaRowStyle}>
              <button type="button" style={primaryButtonStyle} onClick={() => openBundle("samples-overview")}>
                Start Here: Product Overview
              </button>
              <button type="button" style={buttonStyle} onClick={() => openBundle("console")}>
                First Hands-On Stop: Console
              </button>
              <button type="button" style={buttonStyle} onClick={() => openBundle("workbench")}>
                Deep Dive: Workbench
              </button>
              <button type="button" style={buttonStyle} onClick={() => openBundle("provider-authoring-demo")}>
                Authoring Story
              </button>
              <button type="button" style={buttonStyle} onClick={() => openBundle("reactive-demo")}>
                Reactive State Story
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={statCardStyle}>
              <div style={eyebrowStyle}>Browser samples</div>
              <div style={statValueStyle}>5</div>
              <div>Overview, Console, Reactive Demo, Provider Authoring Demo, Workbench</div>
            </div>
            <div style={statCardStyle}>
              <div style={eyebrowStyle}>Other host shapes</div>
              <div style={statValueStyle}>3</div>
              <div>Agent-only, live runtime host, and backend embedding</div>
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>1. 60-second customer script</h3>
        <pre style={codeStyle}>{customerScript}</pre>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Suggested walkthrough</h3>
        <div style={gridStyle}>
          <article style={cardStyle}>
            <div style={pillStyle}>Step 1</div>
            <h4 style={{ margin: "0 0 0.35rem" }}>Frame the product</h4>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Stay on this overview page to explain the platform boundary story before jumping into any specific sample.
            </p>
          </article>
          <article style={cardStyle}>
            <div style={pillStyle}>Step 2</div>
            <h4 style={{ margin: "0 0 0.35rem" }}>Show the operational surface</h4>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Open Console to show profile governance, validation, preview, and local editable copies.
            </p>
          </article>
          <article style={cardStyle}>
            <div style={pillStyle}>Step 3</div>
            <h4 style={{ margin: "0 0 0.35rem" }}>Choose the deeper proof</h4>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Use Workbench for the studio story, Provider Authoring Demo for planning, or Reactive Demo for inspectable derived state.
            </p>
          </article>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>2. How the samples fit together</h3>
        <div style={laneGridStyle}>
          <div style={laneStyle}>
            <div style={laneLabelStyle}>Browser host lane</div>
            <div style={laneCardsStyle}>
              {browserLane.map((item) => (
                <article key={item.name} style={flowCardStyle}>
                  <div style={pillStyle}>{item.emphasis}</div>
                  <h4 style={{ margin: "0 0 0.35rem" }}>{item.name}</h4>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
          <div style={laneStyle}>
            <div style={laneLabelStyle}>Outward host lane</div>
            <div style={laneCardsStyle}>
              {outwardLane.map((item) => (
                <article key={item.name} style={flowCardStyle}>
                  <div style={pillStyle}>{item.emphasis}</div>
                  <h4 style={{ margin: "0 0 0.35rem" }}>{item.name}</h4>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Browser bundles</h3>
        <div style={gridStyle}>
          {browserBundles.map((bundle) => (
            <article key={bundle.name} style={cardStyle}>
              <div style={pillStyle}>{bundle.promise}</div>
              <h4 style={{ margin: "0 0 0.4rem" }}>{bundle.name}</h4>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{bundle.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Sample host shapes</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Host</th>
              <th style={cellStyle}>Choose it when</th>
              <th style={cellStyle}>What it demonstrates</th>
            </tr>
          </thead>
          <tbody>
            {hostShapes.map((row) => (
              <tr key={row.name}>
                <td style={cellStyle}><strong>{row.name}</strong></td>
                <td style={cellStyle}>{row.when}</td>
                <td style={cellStyle}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>3. Where a developer should start</h3>
        <div style={gridStyle}>
          {personas.map((persona) => (
            <article key={persona.who} style={cardStyle}>
              <h4 style={{ margin: "0 0 0.45rem" }}>{persona.who}</h4>
              <p style={{ margin: "0 0 0.35rem", lineHeight: 1.5 }}><strong>Start with:</strong> {persona.start}</p>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{persona.reason}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  samplesOverview: SamplesOverviewView,
};

export default projectionViews;