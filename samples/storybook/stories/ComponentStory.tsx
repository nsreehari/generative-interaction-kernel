import React from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Divider,
  MessageBar,
  MessageBarBody,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";
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
    overflow: "hidden",
  },
  tokenList: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "wrap",
  },
  contractMessage: { width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflow: "hidden", overflowWrap: "anywhere" },
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
  codeBlock: {
    position: "relative",
    minWidth: 0,
  },
  copyButton: {
    position: "absolute",
    top: tokens.spacingVerticalXS,
    right: tokens.spacingHorizontalXS,
    zIndex: 1,
  },
  eventContracts: {
    display: "grid",
    gap: tokens.spacingVerticalL,
  },
  eventHeading: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  signature: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

function GuidanceList({ items, className }: { items: readonly string[]; className: string }) {
  return <ul className={className}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function CopyableCode({ value, label, className, codeClassName, buttonClassName }: { value: string; label: string; className: string; codeClassName: string; buttonClassName: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  };
  return <div className={className}>
    <Tooltip content={copied ? "Copied" : `Copy ${label}`} relationship="label">
      <Button
        className={buttonClassName}
        appearance="subtle"
        size="small"
        icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
        aria-label={copied ? "Copied" : `Copy ${label}`}
        onClick={() => void copy()}
      />
    </Tooltip>
    <pre className={codeClassName}>{value}</pre>
  </div>;
}

export function createAuthoredBlueprint(trial: ResolvedNode): Record<string, unknown> {
  const viewId = `${trial.capability.replace(/[^A-Za-z0-9_-]/g, "-")}-example`;
  return {
    views: {
      [viewId]: {
        capability: trial.capability,
        props: trial.props,
      },
    },
  };
}

function schemaType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as Record<string, unknown>;
  if (Array.isArray(value.enum)) return value.enum.map((entry) => JSON.stringify(entry)).join(" | ");
  if (value.type === "array") return `${schemaType(value.items)}[]`;
  if (value.type === "object") return "object";
  if (value.type === "integer") return "number";
  return typeof value.type === "string" ? value.type : "unknown";
}

export function createEventSignature(payloadSchema: Record<string, unknown>): string {
  const properties = payloadSchema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return "{}";
  const required = new Set(Array.isArray(payloadSchema.required) ? payloadSchema.required : []);
  const fields = Object.entries(properties).map(([name, schema]) => `${name}${required.has(name) ? "" : "?"}: ${schemaType(schema)}`);
  return `{ ${fields.join(", ")} }`;
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
  const authoredBlueprint = JSON.stringify(createAuthoredBlueprint(trial), null, 2);

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
          <AccordionItem value="blueprint">
            <AccordionHeader>Authored blueprint</AccordionHeader>
            <AccordionPanel>
              <CopyableCode value={authoredBlueprint} label="authored blueprint" className={styles.codeBlock} codeClassName={styles.code} buttonClassName={styles.copyButton} />
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem value="events">
            <AccordionHeader>Emit contracts</AccordionHeader>
            <AccordionPanel>
              {description.events.length === 0 ? <Text>This component emits no events.</Text> : (
                <div className={styles.eventContracts}>
                  {description.events.map((event) => {
                    const contract = definition.eventContracts[event];
                    const schema = JSON.stringify(contract.payloadSchema, null, 2);
                    return <section className={styles.section} key={event}>
                      <div className={styles.eventHeading}>
                        <Text weight="semibold">{event}</Text>
                        <Text className={styles.signature}>{createEventSignature(contract.payloadSchema)}</Text>
                      </div>
                      <Text>{contract.summary}</Text>
                      <Accordion collapsible>
                        <AccordionItem value={`${event}-schema`}>
                          <AccordionHeader size="small">Payload schema</AccordionHeader>
                          <AccordionPanel>
                            <CopyableCode value={schema} label={`${event} payload schema`} className={styles.codeBlock} codeClassName={styles.code} buttonClassName={styles.copyButton} />
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>
                    </section>;
                  })}
                </div>
              )}
            </AccordionPanel>
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