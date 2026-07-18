import { mergeClasses } from "@fluentui/react-components";
import { CheckmarkCircle20Regular } from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import type { BlueprintInspection } from "../../../../shared/control-inspection";
import { useStyles } from "../../../live-workspace-soc/projection_views/styles";

export const BlueprintInspector: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const blueprint = node.props.blueprint as unknown as BlueprintInspection | null | undefined;
  if (!blueprint) return null;

  return (
    <>
      <header className={styles.blueprintIntro}>
        <div>
          <div className={styles.eyebrow}>Executable semantic blueprint</div>
          <h2 className={styles.sharedTitle}>{blueprint.title}</h2>
          <p className={styles.sharedSubhead}>{blueprint.description}</p>
        </div>
        <span className={styles.pill}><CheckmarkCircle20Regular />{blueprint.status}</span>
      </header>

      <div className={styles.contextMatrix} aria-label="Authored presentation contexts">
        {blueprint.contextIds.map((id) => <span key={id} className={mergeClasses(styles.contextChip, id === blueprint.selectedContext ? styles.contextChipActive : undefined)}>{id}</span>)}
      </div>

      <section className={styles.blueprintContextContract} aria-label="Selected projection contract">
        <div className={styles.blueprintContextIdentity}>
          <span className={styles.blueprintKind}>Selected projection contract</span>
          <strong>{blueprint.selectedContext}</strong>
        </div>
        <div className={styles.blueprintContextBody}>
          {blueprint.fields.map((field) => <div key={field.label} className={mergeClasses(styles.blueprintContextField, field.value.length > 80 ? styles.blueprintContextRegions : undefined)}>{field.label}<span className={styles.blueprintContextValue}>{field.value}</span></div>)}
        </div>
      </section>

      <section className={styles.blueprintPipeline} aria-label="Blueprint lowering trace">
        {blueprint.stages.map((stage) => <article className={styles.blueprintStage} key={stage.tier}>
          <div className={styles.blueprintStageIdentity}>
            <span className={styles.blueprintKind}>{stage.kind}</span>
            <span className={styles.blueprintLayer}>{stage.tier}</span>
          </div>
          <div className={styles.blueprintStageBody}>
            <span className={styles.blueprintRecipe}>{stage.recipe}</span>
            <pre className={styles.blueprintOutput}>{stage.summary}</pre>
          </div>
        </article>)}
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Blueprint-owned resources</h3>
        <div className={styles.blueprintResources}>
          {blueprint.resources.map((resource) => <div key={resource.label} className={styles.blueprintResource}>{resource.label}<span className={styles.blueprintResourceValue}>{resource.value}</span></div>)}
        </div>
      </section>
    </>
  );
};
