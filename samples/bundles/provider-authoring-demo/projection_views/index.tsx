import React from "react";
import { makeStyles, shorthands, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { loadProfile, type LoweringRecipeArtifact, type ProfileArtifact } from "@gik/profile";
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
import liveCardsProfileJson from "../../../profiles/live-cards/profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "../../../profiles/live-cards/interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "../../../profiles/live-cards/presentation-to-runtime.recipe.json" with { type: "json" };

const liveCardsProfileArtifact = liveCardsProfileJson as ProfileArtifact;
const liveCardsRecipeArtifacts = [
  liveCardsInteractionRecipeJson as LoweringRecipeArtifact,
  liveCardsRuntimeRecipeJson as LoweringRecipeArtifact,
] as const;

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalL, color: "var(--text)" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  card: {
    ...shorthands.border(tokens.strokeWidthThin, "solid", "var(--line)"),
    borderRadius: tokens.borderRadiusLarge,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    backgroundColor: "var(--panel)",
    boxShadow: tokens.shadow4,
  },
  insetCard: {
    backgroundColor: "var(--panel-2)",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
  },
  gridTight: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  sectionGap: { marginTop: tokens.spacingVerticalM },
  pre: { margin: 0, whiteSpace: "pre-wrap", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100 },
  preTop: { marginTop: tokens.spacingVerticalM },
});

const orchestratorRegistry: FlowRegistry = createProfileAuthoringRegistry();
const orchestrator = new StepOrchestrator(orchestratorRegistry);

function toJsonRecord(value: unknown): Record<string, Json> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, Json>;
}

export interface ProviderAuthoringPlanInput {
  mode: string;
  objective: string;
  surface: string;
  changedSource: string;
  stream: string;
  profileSeedName: string;
}

export interface ProviderAuthoringPlanResult {
  consequenceInspection: ReturnType<typeof inspectConsequenceGraph>;
  consequenceActivation: ReturnType<typeof activateConsequenceGraph>;
  exploratoryInspection: ReturnType<typeof inspectExploratoryGraph>;
  exploratoryFrontier: ReturnType<typeof evaluateExploratoryFrontier>;
  profileSeed: {
    profileArtifact: typeof liveCardsProfileArtifact;
    recipeArtifacts: typeof liveCardsRecipeArtifacts extends readonly (infer T)[] ? T[] : never;
    summary: ReturnType<typeof summarizeProfileArtifacts>;
  } | null;
  args: Record<string, Json>;
}

export function buildProviderAuthoringPlan(input: ProviderAuthoringPlanInput): ProviderAuthoringPlanResult {
  const consequenceInspection = inspectConsequenceGraph(portfolioConsequenceSample);
  const consequenceActivation = activateConsequenceGraph(portfolioConsequenceSample, [input.changedSource]);
  const exploratoryInspection = inspectExploratoryGraph(educationExploratorySample);
  const exploratoryFrontier = evaluateExploratoryFrontier(
    educationExploratorySample,
    ["tenthComplete"],
    input.stream ? { choose12th: input.stream } : {}
  );
  const profileSeed =
    input.mode === "profile-artifact" && input.profileSeedName === "live-cards"
      ? {
          profileArtifact: liveCardsProfileArtifact,
          recipeArtifacts: [...liveCardsRecipeArtifacts],
          summary: summarizeProfileArtifacts(liveCardsProfileArtifact, liveCardsRecipeArtifacts),
        }
      : null;

  const args: Record<string, Json> = {
    objective: input.objective,
    surface: input.surface,
    changedSource: input.changedSource,
    consequence: toJsonRecord(consequenceActivation),
    exploratory: toJsonRecord(exploratoryFrontier),
  };
  if (profileSeed?.profileArtifact) {
    args.profileArtifact = toJsonRecord(profileSeed.profileArtifact);
    args.recipeArtifacts = JSON.parse(JSON.stringify(profileSeed.recipeArtifacts)) as Json;
  }

  return {
    consequenceInspection,
    consequenceActivation,
    exploratoryInspection,
    exploratoryFrontier,
    profileSeed,
    args,
  };
}

const ProviderAuthoringSampleView: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const props = readProps(node);
  const mode = props.str("mode") || "graph-driven";
  const objective = props.str("objective") || "Portfolio review authoring";
  const surface = props.str("surface") || "copilot";
  const changedSource = props.str("changedSource") || "portfolio";
  const stream = props.str("stream") || "";
  const profileSeedName = props.str("profileSeed") || "live-cards";

  const planInput = React.useMemo(
    () => ({ mode, objective, surface, changedSource, stream, profileSeedName }),
    [changedSource, mode, objective, profileSeedName, stream, surface]
  );
  const planModel = React.useMemo(() => buildProviderAuthoringPlan(planInput), [planInput]);
  const consequenceInspection = planModel.consequenceInspection;
  const consequenceActivation = planModel.consequenceActivation;
  const exploratoryInspection = planModel.exploratoryInspection;
  const exploratoryFrontier = planModel.exploratoryFrontier;
  const profileSeed = planModel.profileSeed;

  const [plan, setPlan] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    let disposed = false;
    void orchestrator
      .invoke({
        kind: "invoke",
        node: "provider-authoring-sample",
        tool: "authorProfilePlan",
        args: planModel.args,
      })
      .then((result) => {
        if (disposed) return;
        setPlan((result?.events?.[0]?.payload as Record<string, unknown> | undefined) ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [planModel]);

  return (
    <div className={styles.stack}>
      <p className="gx-note gx-note-muted">
        {mode === "profile-artifact"
          ? "This mode starts from a declared profile artifact, then uses the consequence and exploratory graphs to explain how the existing recipe chain should be applied."
          : "This mode is graph-driven: the consequence graph explains downstream activation, the exploratory graph explains unlocked choice frontiers, and the StepOrchestrator composes a draft authoring profile and lowering recipes."}
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className="gx-muted">Consequence graph</div>
          <strong>triggered = {consequenceActivation.triggered.join(", ")}</strong>
          <div>reachable = {consequenceActivation.reachable.join(", ") || "<none>"}</div>
          <div>edges = {consequenceInspection.edges.length}</div>
          <div className={styles.gridTight}>
            {consequenceActivation.parallelStages.length > 0 ? (
              consequenceActivation.parallelStages.map((stage, index) => (
                <div key={`stage-${index}`} className={`${styles.card} ${styles.insetCard}`}>
                  <div className="gx-muted">Stage {index + 1}</div>
                  <div>{stage.join(", ")}</div>
                </div>
              ))
            ) : (
              <div className={`${styles.card} ${styles.insetCard}`}>No ready downstream stage.</div>
            )}
          </div>
          <div className={styles.sectionGap}>
            <div className="gx-muted">Blocked</div>
            <pre className={styles.pre}>{prettyJson(consequenceActivation.blocked)}</pre>
          </div>
        </div>

        <div className={styles.card}>
          <div className="gx-muted">Exploratory frontier</div>
          <strong>stream = {stream || "(none yet)"}</strong>
          <div>unlocked = {exploratoryFrontier.unlocked.join(", ")}</div>
          <div>choice edges = {exploratoryInspection.edges.filter((edge) => edge.kind === "option").length}</div>
          <div className={styles.sectionGap}>
            <div className="gx-muted">Available choices</div>
            <pre className={styles.pre}>{prettyJson(exploratoryFrontier.availableChoices)}</pre>
          </div>
        </div>
      </div>

      {profileSeed ? (
        <div className={styles.card}>
          <div className="gx-muted">Declared profile artifact</div>
          <strong>{profileSeed.summary?.id}</strong>
          <div>version = {profileSeed.summary?.version}</div>
          <div>layers = {profileSeed.summary?.layers.map((layer) => layer.id).join(", ")}</div>
          <pre className={`${styles.pre} ${styles.preTop}`}>{prettyJson(profileSeed.summary)}</pre>
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className="gx-muted">StepOrchestrator authoring plan</div>
          <strong>{objective}</strong>
          <div>surface = {surface}</div>
          <div>tool = authorProfilePlan</div>
          <div>mode = {mode}</div>
          <pre className={`${styles.pre} ${styles.preTop}`}>{prettyJson(plan)}</pre>
        </div>
        <div className={styles.card}>
          <div className="gx-muted">What the plan is composing</div>
          <pre className={styles.pre}>
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