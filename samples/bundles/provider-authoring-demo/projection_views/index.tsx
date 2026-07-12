import React from "react";
import type { Json } from "@gik/kernel";
import { readProps, type ProjectionView } from "@gik/react";

import {
  activateConsequenceGraph,
  inspectConsequenceGraph,
  portfolioConsequenceSample,
} from "@gik/provider-consequence-graph";
import {
  educationExploratorySample,
  evaluateExploratoryFrontier,
  inspectExploratoryGraph,
} from "@gik/provider-exploratory-graph";
import {
  createProfileAuthoringRegistry,
  summarizeProfileArtifacts,
} from "@gik/provider-profile-authoring";
import { StepOrchestrator, type FlowRegistry } from "@gik/provider-step-orchestrator";
import { liveCardsProfileArtifact, liveCardsRecipeArtifacts } from "../../../profiles/live-cards/index";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e0ddd8",
  borderRadius: 10,
  padding: "0.8rem 0.9rem",
  background: "#faf8f4",
};

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "0.8rem",
};

const stageGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.6rem",
  marginTop: "0.75rem",
};

const orchestratorRegistry: FlowRegistry = createProfileAuthoringRegistry();
const orchestrator = new StepOrchestrator(orchestratorRegistry);

function toJsonRecord(value: unknown): Record<string, Json> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, Json>;
}

const ProviderAuthoringSampleView: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const mode = props.str("mode") || "graph-driven";
  const objective = props.str("objective") || "Portfolio review authoring";
  const surface = props.str("surface") || "copilot";
  const changedSource = props.str("changedSource") || "portfolio";
  const stream = props.str("stream") || "";
  const profileSeedName = props.str("profileSeed") || "live-cards";

  const consequenceInspection = React.useMemo(() => inspectConsequenceGraph(portfolioConsequenceSample), []);
  const consequenceActivation = React.useMemo(
    () => activateConsequenceGraph(portfolioConsequenceSample, [changedSource]),
    [changedSource]
  );
  const exploratoryInspection = React.useMemo(() => inspectExploratoryGraph(educationExploratorySample), []);
  const exploratoryFrontier = React.useMemo(
    () => evaluateExploratoryFrontier(educationExploratorySample, ["tenthComplete"], stream ? { choose12th: stream } : {}),
    [stream]
  );
  const profileSeed = React.useMemo(() => {
    if (mode !== "profile-artifact" || profileSeedName !== "live-cards") return null;
    return {
      profileArtifact: liveCardsProfileArtifact,
      recipeArtifacts: [...liveCardsRecipeArtifacts],
      summary: summarizeProfileArtifacts(liveCardsProfileArtifact, liveCardsRecipeArtifacts),
    };
  }, [mode, profileSeedName]);

  const [plan, setPlan] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    let disposed = false;
    const args: Record<string, Json> = {
      objective,
      surface,
      changedSource,
      consequence: toJsonRecord(consequenceActivation),
      exploratory: toJsonRecord(exploratoryFrontier),
    };
    if (profileSeed?.profileArtifact) {
      args.profileArtifact = toJsonRecord(profileSeed.profileArtifact);
      args.recipeArtifacts = JSON.parse(JSON.stringify(profileSeed.recipeArtifacts)) as Json;
    }
    void orchestrator
      .invoke({
        kind: "invoke",
        node: "provider-authoring-sample",
        tool: "authorProfilePlan",
        args,
      })
      .then((result) => {
        if (disposed) return;
        setPlan((result?.events?.[0]?.payload as Record<string, unknown> | undefined) ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [changedSource, consequenceActivation, exploratoryFrontier, objective, profileSeed, surface]);

  return (
    <div style={stackStyle}>
      <p className="gx-note gx-note-muted">
        {mode === "profile-artifact"
          ? "This mode starts from a declared profile artifact, then uses the consequence and exploratory graphs to explain how the existing recipe chain should be applied."
          : "This mode is graph-driven: the consequence graph explains downstream activation, the exploratory graph explains unlocked choice frontiers, and the StepOrchestrator composes a draft authoring profile and lowering recipes."}
      </p>

      <div style={gridStyle}>
        <div style={cardStyle}>
          <div className="gx-muted">Consequence graph</div>
          <strong>triggered = {consequenceActivation.triggered.join(", ")}</strong>
          <div>reachable = {consequenceActivation.reachable.join(", ") || "<none>"}</div>
          <div>edges = {consequenceInspection.edges.length}</div>
          <div style={stageGridStyle}>
            {consequenceActivation.parallelStages.length > 0 ? (
              consequenceActivation.parallelStages.map((stage, index) => (
                <div key={`stage-${index}`} style={{ ...cardStyle, background: "#f4efe6", padding: "0.6rem" }}>
                  <div className="gx-muted">Stage {index + 1}</div>
                  <div>{stage.join(", ")}</div>
                </div>
              ))
            ) : (
              <div style={{ ...cardStyle, background: "#f4efe6", padding: "0.6rem" }}>No ready downstream stage.</div>
            )}
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <div className="gx-muted">Blocked</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{prettyJson(consequenceActivation.blocked)}</pre>
          </div>
        </div>

        <div style={cardStyle}>
          <div className="gx-muted">Exploratory frontier</div>
          <strong>stream = {stream || "(none yet)"}</strong>
          <div>unlocked = {exploratoryFrontier.unlocked.join(", ")}</div>
          <div>choice edges = {exploratoryInspection.edges.filter((edge) => edge.kind === "option").length}</div>
          <div style={{ marginTop: "0.75rem" }}>
            <div className="gx-muted">Available choices</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{prettyJson(exploratoryFrontier.availableChoices)}</pre>
          </div>
        </div>
      </div>

      {profileSeed ? (
        <div style={cardStyle}>
          <div className="gx-muted">Declared profile artifact</div>
          <strong>{profileSeed.summary?.id}</strong>
          <div>version = {profileSeed.summary?.version}</div>
          <div>layers = {profileSeed.summary?.layers.map((layer) => layer.id).join(", ")}</div>
          <pre style={{ margin: "0.75rem 0 0", whiteSpace: "pre-wrap" }}>{prettyJson(profileSeed.summary)}</pre>
        </div>
      ) : null}

      <div style={gridStyle}>
        <div style={cardStyle}>
          <div className="gx-muted">StepOrchestrator authoring plan</div>
          <strong>{objective}</strong>
          <div>surface = {surface}</div>
          <div>tool = authorProfilePlan</div>
          <div>mode = {mode}</div>
          <pre style={{ margin: "0.75rem 0 0", whiteSpace: "pre-wrap" }}>{prettyJson(plan)}</pre>
        </div>
        <div style={cardStyle}>
          <div className="gx-muted">What the plan is composing</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {prettyJson({
              mode,
              consequence: consequenceActivation,
              exploratory: exploratoryFrontier,
              profileSeed: plan?.profileSeed,
              profile: plan?.profile,
              recipes: plan?.recipes,
            })}
          </pre>
        </div>
      </div>
    </div>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  providerAuthoringSample: ProviderAuthoringSampleView,
};

export default projectionViews;