import React from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Divider,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { DeclarativeComponentDefinition } from "@gik/components";
import type { ResolvedNode } from "@gik/kernel";

const useStyles = makeStyles({
  page: {
    width: "min(1180px, 100%)",
    minWidth: 0,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.65fr)",
    gap: tokens.spacingHorizontalXXL,
    alignItems: "start",
    "@media (max-width: 820px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  stage: {
    minWidth: 0,
    display: "grid",
    gap: tokens.spacingVerticalL,
  },
  intro: {
    display: "grid",
    gap: tokens.spacingVerticalXS,
  },
  examples: {
    display: "grid",
    gap: tokens.spacingVerticalXXL,
  },
  example: {
    minWidth: 0,
    display: "grid",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ":first-child": {
      paddingTop: 0,
      borderTop: "none",
    },
  },
  exampleHeader: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
  },
  contract: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    display: "grid",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tokenList: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "wrap",
  },
  contractMessage: { minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" },
  section: {
    display: "grid",
    gap: tokens.spacingVerticalS,
  },
  list: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
    display: "grid",
    gap: tokens.spacingVerticalXS,
  },
  code: {
    maxHeight: "22rem",
    margin: 0,
    overflow: "auto",
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
  },
});

function GuidanceList({ items, className }: { items: readonly string[]; className: string }) {
  return <ul className={className}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export interface ComponentStoryExample {
  title: string;
  description?: string;
  configureTrial?: (trial: ResolvedNode) => void;
}

export function ComponentStory({ definition, variant, configureTrial, preview, examples }: { definition: DeclarativeComponentDefinition; variant?: string; configureTrial?: (trial: ResolvedNode) => void; preview?: React.ReactNode; examples?: readonly ComponentStoryExample[] }) {
  const styles = useStyles();
  const trial = definition.materializeTrial();
  if (variant) trial.props.variant = variant;
  configureTrial?.(trial);
  const report = definition.validate(trial.props);
  const exampleTrials = examples?.map((example) => {
    const exampleTrial = definition.materializeTrial();
    if (variant) exampleTrial.props.variant = variant;
    example.configureTrial?.(exampleTrial);
    return { example, trial: exampleTrial, report: definition.validate(exampleTrial.props) };
  });
  const allValid = report.ok && (exampleTrials?.every((entry) => entry.report.ok) ?? true);
  const description = definition.describe();
  const Component = definition.component;

  return (
    <div className={styles.page}>
      <section className={styles.stage}>
        <header className={styles.intro}>
          <Text as="h1" size={700} weight="semibold">{description.capability}</Text>
          <Text size={300}>{description.summary}</Text>
        </header>
        {preview ?? (exampleTrials ? (
          <div className={styles.examples}>
            {exampleTrials.map(({ example, trial: exampleTrial }) => (
              <section className={styles.example} key={example.title}>
                <header className={styles.exampleHeader}>
                  <Text as="h2" size={500} weight="semibold">{example.title}</Text>
                  {example.description ? <Text>{example.description}</Text> : null}
                </header>
                <Component node={exampleTrial} emit={() => undefined} children={undefined} />
              </section>
            ))}
          </div>
        ) : <Component node={trial} emit={() => undefined} children={undefined} />)}
      </section>

      <aside className={styles.contract} aria-label="Declarative component contract">
        <Text as="h2" size={500} weight="semibold">Authoring contract</Text>
        <MessageBar className={styles.contractMessage} intent={allValid ? "success" : "error"}>
          <MessageBarBody className={styles.contractMessage}>
            {allValid
              ? "All displayed examples pass the exported validator."
              : "At least one displayed example violates the exported contract."}
          </MessageBarBody>
        </MessageBar>

        <div className={styles.section}>
          <Text weight="semibold">Data and events</Text>
          <Text>Data prop: {description.dataProp ?? "None"}</Text>
          <Text>Slots: {description.slots?.join(", ") || "None"}</Text>
          <Text>Events: {description.events.join(", ") || "None"}</Text>
          <Text>Default variant: {description.defaultVariant ?? "None"}</Text>
        </div>
        <Divider />
        <div className={styles.section}>
          <Text weight="semibold">Recognized semantic tokens</Text>
          <div className={styles.tokenList}>
            {description.semanticTokens.map((token) => (
              <Badge key={token} appearance="outline">{token}</Badge>
            ))}
          </div>
        </div>

        <Accordion collapsible multiple>
          <AccordionItem value="variants">
            <AccordionHeader>Variants</AccordionHeader>
            <AccordionPanel>
              {description.variants.map((entry) => (
                <div className={styles.section} key={entry.value}>
                  <Text weight="semibold">{entry.value}</Text>
                  <Text>{entry.summary}</Text>
                  <GuidanceList items={entry.useWhen} className={styles.list} />
                </div>
              ))}
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem value="use">
            <AccordionHeader>Use when</AccordionHeader>
            <AccordionPanel><GuidanceList items={description.authoring.useWhen} className={styles.list} /></AccordionPanel>
          </AccordionItem>
          <AccordionItem value="avoid">
            <AccordionHeader>Avoid when</AccordionHeader>
            <AccordionPanel><GuidanceList items={description.authoring.avoidWhen} className={styles.list} /></AccordionPanel>
          </AccordionItem>
          <AccordionItem value="rules">
            <AccordionHeader>Rules</AccordionHeader>
            <AccordionPanel><GuidanceList items={description.authoring.rules} className={styles.list} /></AccordionPanel>
          </AccordionItem>
          <AccordionItem value="trial">
            <AccordionHeader>Trial props</AccordionHeader>
            <AccordionPanel><pre className={styles.code}>{JSON.stringify(trial.props, null, 2)}</pre></AccordionPanel>
          </AccordionItem>
          <AccordionItem value="schema">
            <AccordionHeader>Validator schema</AccordionHeader>
            <AccordionPanel><pre className={styles.code}>{JSON.stringify(definition.getSchema(), null, 2)}</pre></AccordionPanel>
          </AccordionItem>
        </Accordion>
      </aside>
    </div>
  );
}