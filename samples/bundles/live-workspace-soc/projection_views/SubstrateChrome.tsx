import { mergeClasses } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";
import { GrowingContainer } from "../../../../adapters/react/src/primitives/registry";
import { SOC_BLUEPRINT_CONTEXTS } from "../../../profiles/live-workspace-soc/compile";
import type { SocPlane } from "../navigation";
import { useStyles } from "./styles";
import type { Incident, Presentation } from "./types";

export const SubstrateChrome: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const incident = node.props.incident as unknown as Incident;
  const presentation = node.props.presentation as unknown as Presentation;
  const consolePlane = String(node.props.consolePlane ?? "runtime") as SocPlane;
  const selectedContext = presentation.contexts.find((item) => item.id === presentation.selectedContext) ?? presentation.contexts[0];
  const blueprintContext = SOC_BLUEPRINT_CONTEXTS.find((item) => item.id === presentation.selectedContext) ?? SOC_BLUEPRINT_CONTEXTS[0];

  return (
    <section className={styles.shared} aria-label="Shared incident substrate">
      <header className={styles.consoleChrome}>
        <div className={styles.consolePath}>
          <span className={styles.consoleLights} aria-hidden="true">
            <i className={styles.consoleLight} />
            <i className={styles.consoleLight} />
            <i className={mergeClasses(styles.consoleLight, styles.consoleLightLive)} />
          </span>
          <span className={styles.consoleUri}>{consolePlane === "runtime" ? "shared" : "blueprint"}://soc/{consolePlane === "runtime" ? incident.id.toLowerCase() : "live-workspace-soc/profile.json"}</span>
        </div>
        <div className={styles.contextMeta}>
          {consolePlane === "runtime" ? `projection r${presentation.revision} · ${selectedContext.audience}` : "4 tiers · 3 lowering recipes"}
          <span className={styles.contextFocus}>{consolePlane === "runtime" ? selectedContext.focus : `${blueprintContext.role} · ${blueprintContext.device} · ${blueprintContext.task}`}</span>
        </div>
      </header>
      <GrowingContainer className={styles.sharedViewport} ariaLabel="Shared substrate content">
        <div className={styles.sharedViewportContent}>{children}</div>
      </GrowingContainer>
    </section>
  );
};
