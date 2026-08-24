// The host's own application root: what `/` is, when no `?b=<id>` names a Blueprint to open.
//
// Everything you can see that is NOT a Blueprint region -- the hero band, the guidance copy, the
// panel chrome, the two-column arrangement, the footnote -- is plain React/Fluent owned by this
// page. The only Blueprint content on the page is two named regions, `blueprint-catalog` and
// `blueprint-preview`, placed exactly where this layout wants them.
//
// Both regions come from ONE `BlueprintProvider`, so they are two placements of a single running
// Blueprint Studio: one controller, one state, one journal, one lifecycle. Selecting an entry in the
// catalog region is therefore immediately reflected by the preview region without this page routing
// anything between them. The provider -- never an individual region -- owns the external context,
// and it passes `{ mode: "embedded" }`, which is the projection-axis input Blueprint Studio uses to
// select its embedded manifestation (the one that exports these two regions and drops the tab-gated
// normal editor surfaces). This page never reaches into Studio's internal state to simulate that.

import React from "react";
import {
  Badge,
  Body1,
  Caption1,
  Divider,
  Subtitle1,
  Subtitle2,
  Title1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { ExternalContext } from "@gik/blueprint";
import { BlueprintProvider, BlueprintRegion } from "@gik/react";
import { resolveCapabilityDescriptors, resolveProjectionViews } from "./runtime/provider-registry";
import { HostServiceDependencyAccess } from "./runtime/service-dependency-access";
import { ApplicationSwitcher } from "./ApplicationSwitcher";
import { useBlueprintHostSetup } from "./blueprint-host-setup";

/** The Blueprint whose regions this page composes. */
export const APP_ROOT_BLUEPRINT_ID = "blueprint-studio";

/** Provider-owned external context. Region mounts never carry one: every region of one apparent
 * instance must represent the same materialization the provider selected. */
export const APP_ROOT_EXTERNAL_CONTEXT: ExternalContext = Object.freeze({ mode: "embedded" });

const HIGHLIGHTS: readonly { title: string; detail: string }[] = [
  {
    title: "Declared, not drawn",
    detail: "Cells carry potential views; a presentation decides which of them ever manifest.",
  },
  {
    title: "Two independent axes",
    detail: "Service lowering picks implementations; projection lowering picks representations.",
  },
  {
    title: "Host-placed regions",
    detail: "A Blueprint exports named regions; the shell decides where each one lives.",
  },
];

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    gap: tokens.spacingVerticalXXL,
    padding: `${tokens.spacingVerticalXXL} clamp(16px, 5vw, 64px) ${tokens.spacingVerticalXXXL}`,
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    maxWidth: "72ch",
  },
  heroBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
  highlights: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: tokens.spacingHorizontalL,
  },
  highlight: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    paddingLeft: tokens.spacingHorizontalM,
  },
  workbench: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 22rem) minmax(0, 1fr)",
    gap: tokens.spacingHorizontalXXL,
    alignItems: "start",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusXLarge,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    padding: tokens.spacingHorizontalL,
  },
  panelHead: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  regionSurface: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    minHeight: "18rem",
  },
  previewSurface: {
    minHeight: "clamp(360px, 52vh, 640px)",
  },
  footNote: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    maxWidth: "80ch",
  },
});

function Highlights(): React.ReactElement {
  const styles = useStyles();
  return (
    <section className={styles.highlights} aria-label="What this host demonstrates">
      {HIGHLIGHTS.map((highlight) => (
        <article key={highlight.title} className={styles.highlight}>
          <Subtitle2 as="h3">{highlight.title}</Subtitle2>
          <Caption1>{highlight.detail}</Caption1>
        </article>
      ))}
    </section>
  );
}

export function AppRootPage(): React.ReactElement {
  const styles = useStyles();
  const { blueprint, native, context, blueprintRegistry } = useBlueprintHostSetup({
    id: APP_ROOT_BLUEPRINT_ID,
    durableEnabled: false,
    externalContext: APP_ROOT_EXTERNAL_CONTEXT,
  });

  return (
    <>
      <div className={styles.page}>
        <header className={styles.hero}>
          <Title1 as="h1">Generative Interaction Kernel</Title1>
          <Body1>
            Governed Blueprints describe an application&apos;s meaning; the kernel decides what it
            becomes. Browse the catalog below and watch any Blueprint run live, right here on this
            page.
          </Body1>
          <div className={styles.heroBadges}>
            <Badge appearance="tint" color="brand">Blueprint catalog</Badge>
            <Badge appearance="tint" color="brand">Live projection</Badge>
            <Badge appearance="tint" color="informative">Named presentation regions</Badge>
          </div>
        </header>

        <Highlights />

        <Divider />

        <BlueprintProvider
          blueprint={blueprint}
          native={native}
          context={context}
          externalContext={APP_ROOT_EXTERNAL_CONTEXT}
          blueprintRegistry={blueprintRegistry}
          resolveLeavesProvider={resolveProjectionViews}
          resolveCapabilityDescriptors={resolveCapabilityDescriptors}
        >
          <main className={styles.workbench}>
            <section className={styles.panel} aria-label="Blueprint catalog">
              <div className={styles.panelHead}>
                <Subtitle1 as="h2">Catalog</Subtitle1>
                <Caption1>
                  Every governed Blueprint this host admits. Pick one to project it beside the list.
                </Caption1>
              </div>
              <div className={styles.regionSurface}>
                <BlueprintRegion name="blueprint-catalog" />
              </div>
            </section>

            <section className={styles.panel} aria-label="Live Blueprint preview">
              <div className={styles.panelHead}>
                <Subtitle1 as="h2">Live preview</Subtitle1>
                <Caption1>
                  The selected Blueprint, materialized and running. Nothing here is a screenshot.
                </Caption1>
              </div>
              <div className={`${styles.regionSurface} ${styles.previewSurface}`}>
                <BlueprintRegion name="blueprint-preview" />
              </div>
            </section>
          </main>
        </BlueprintProvider>

        <footer className={styles.footNote}>
          <Caption1>
            The catalog and the preview are two named regions exported by one running Blueprint, not
            two applications: one controller, one state, one lifecycle, placed in two spots by this
            page&apos;s own layout.
          </Caption1>
          <Caption1>
            Open a Blueprint on its own with <code>?b=&lt;id&gt;</code> — the switcher does exactly that.
          </Caption1>
        </footer>
      </div>
      <HostServiceDependencyAccess />
      <ApplicationSwitcher />
    </>
  );
}
