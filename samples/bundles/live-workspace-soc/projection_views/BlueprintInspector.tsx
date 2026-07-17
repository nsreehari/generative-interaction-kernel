import { mergeClasses } from "@fluentui/react-components";
import { CheckmarkCircle20Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import {
  SOC_BLUEPRINT_CONTEXTS,
  socBlueprint,
  traceSocBlueprint,
} from "../../../profiles/live-workspace-soc/compile";
import { useStyles } from "./styles";
import type { Presentation } from "./types";

export const BlueprintInspector: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const presentation = node.props.presentation as unknown as Presentation;
  const blueprintTrace = traceSocBlueprint(presentation.selectedContext);
  const blueprintContext = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === presentation.selectedContext) ?? SOC_BLUEPRINT_CONTEXTS[0];
  const blueprintPresentation = blueprintTrace[1].output as { layout: string; arrangement: string; regions: Array<{ name: string; group?: string; priority: string; disclosure: string; presentation?: string; materialize?: boolean }> };
  const blueprintRegions = blueprintPresentation.regions.filter((region) => region.disclosure !== "omitted" && region.presentation !== "presenter-control");
  const blueprintResources = socBlueprint.resources;
  const blueprintStageSummaries = blueprintTrace.map((item) => {
    const output = item.output as Record<string, unknown>;
    if (item.toKind === "interaction") {
      return `interaction=${String(output.interaction)}\ncapabilities=${JSON.stringify(output.capabilities ?? [])}`;
    }
    if (item.toKind === "presentation") {
      const regions = Array.isArray(output.regions) ? output.regions : [];
      const visible = regions.filter((region) => (region as { disclosure?: string }).disclosure !== "omitted" && (region as { presentation?: string }).presentation !== "presenter-control");
      return `layout=${String(output.layout)} · arrangement=${String(output.arrangement)}\nprojection-frame=${blueprintContext.frame}\nreading-order=${visible.map((region) => String((region as { name?: string }).name)).join(" → ")}\ngroups=${[...new Set(visible.map((region) => String((region as { group?: string }).group ?? "ungrouped")))].join(" → ")}\nfacet-policy=${visible.map((region) => { const facet = region as { name?: string; group?: string; priority?: string; disclosure?: string }; return `${facet.name}[${facet.group ?? "ungrouped"}/${facet.priority}/${facet.disclosure}]`; }).join(", ")}`;
    }
    const root = output.root as { capability?: string; edges?: { children?: unknown[] } } | undefined;
    return `root=${root?.capability ?? "unknown"}\nchildren=${root?.edges?.children?.length ?? 0} · terminal document matches bundle`;
  });

  return (
    <>
      <header className={styles.blueprintIntro}>
        <div>
          <div className={styles.eyebrow}>Executable semantic blueprint</div>
          <h2 className={styles.sharedTitle}>Intent to runnable bundle</h2>
          <p className={styles.sharedSubhead}>The selected context runs through the same authored tiers and terminal document contract.</p>
        </div>
        <span className={styles.pill}><CheckmarkCircle20Regular />Blueprint and lowering recipes validated</span>
      </header>

      <div className={styles.contextMatrix} aria-label="Authored presentation contexts">
        {SOC_BLUEPRINT_CONTEXTS.map((item) => <span key={item.id} className={mergeClasses(styles.contextChip, item.id === blueprintContext.id ? styles.contextChipActive : undefined)}>{item.id}</span>)}
      </div>

      <section className={styles.blueprintContextContract} aria-label="Selected projection contract">
        <div className={styles.blueprintContextIdentity}>
          <span className={styles.blueprintKind}>Selected projection contract</span>
          <strong>{blueprintContext.id}</strong>
          <span>{blueprintContext.actor}</span>
        </div>
        <div className={styles.blueprintContextBody}>
          <div className={styles.blueprintContextField}>Role<span className={styles.blueprintContextValue}>{blueprintContext.role}</span></div>
          <div className={styles.blueprintContextField}>Device / frame<span className={styles.blueprintContextValue}>{blueprintContext.device} / {blueprintContext.frame}</span></div>
          <div className={styles.blueprintContextField}>Task<span className={styles.blueprintContextValue}>{blueprintContext.task}</span></div>
          <div className={styles.blueprintContextField}>Disclosure<span className={styles.blueprintContextValue}>{blueprintContext.disclosure}</span></div>
          <div className={styles.blueprintContextField}>Layout<span className={styles.blueprintContextValue}>{blueprintContext.layout}</span></div>
          <div className={styles.blueprintContextField}>Arrangement<span className={styles.blueprintContextValue}>{blueprintPresentation.arrangement}</span></div>
          <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Lowered reading order<span className={styles.blueprintContextValue}>{blueprintRegions.map((region) => region.name).join(" → ")}</span></div>
          <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Envelope sequence<span className={styles.blueprintContextValue}>{[...new Set(blueprintRegions.map((region) => region.group ?? "substrate"))].join(" → ")}</span></div>
          <div className={mergeClasses(styles.blueprintContextField, styles.blueprintContextRegions)}>Group / priority / disclosure<span className={styles.blueprintContextValue}>{blueprintRegions.map((region) => `${region.name}: ${region.group ?? "substrate"} / ${region.priority} / ${region.disclosure}`).join(" · ")}</span></div>
        </div>
      </section>

      <section className={styles.blueprintPipeline} aria-label="Blueprint lowering trace">
        {blueprintTrace.map((item, index) => <article className={styles.blueprintStage} key={`${item.fromLayerId}-${item.toLayerId}`}>
          <div className={styles.blueprintStageIdentity}>
            <span className={styles.blueprintKind}>{item.fromKind} → {item.toKind}</span>
            <span className={styles.blueprintLayer}>{item.fromLayerId} → {item.toLayerId}</span>
          </div>
          <div className={styles.blueprintStageBody}>
            <span className={styles.blueprintRecipe}>{socBlueprint.stages[index].recipe.id} · {String(socBlueprint.stages[index].recipe.metadata?.executor)}</span>
            <pre className={styles.blueprintOutput}>{blueprintStageSummaries[index]}</pre>
          </div>
        </article>)}
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Blueprint-owned resources</h3>
        <div className={styles.blueprintResources}>
          <div className={styles.blueprintResource}>Actors<span className={styles.blueprintResourceValue}>{(blueprintResources.actors as unknown[]).length}</span></div>
          <div className={styles.blueprintResource}>Projection contexts<span className={styles.blueprintResourceValue}>{SOC_BLUEPRINT_CONTEXTS.length}</span></div>
          <div className={styles.blueprintResource}>Authority rule<span className={styles.blueprintResourceValue}>{String((blueprintResources.authorityPolicy as { requiredRole: string }).requiredRole)}</span></div>
        </div>
      </section>
    </>
  );
};
