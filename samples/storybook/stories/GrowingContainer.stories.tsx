import React from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  GrowingContainer,
  growingContainerDefinition,
  type GrowingContainerFollowEnd,
} from "@gik/components/primitives";

import { ComponentStory } from "./ComponentStory";

const useStyles = makeStyles({
  examples: {
    display: "grid",
    gap: tokens.spacingVerticalXXL,
  },
  example: {
    display: "grid",
    gap: tokens.spacingVerticalM,
  },
  exampleHeader: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  viewport: {
    height: "22rem",
    minHeight: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  entries: {
    display: "grid",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
  },
  entry: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

function GrowingContainerExample({ title, description, followEnd }: { title: string; description: string; followEnd: GrowingContainerFollowEnd }) {
  const styles = useStyles();
  const [entries, setEntries] = React.useState(() => Array.from({ length: 8 }, (_, index) => index + 1));
  return (
    <section className={styles.example}>
      <header className={styles.exampleHeader}>
        <Text as="h2" size={500} weight="semibold">{title}</Text>
        <Text>{description}</Text>
      </header>
      <div className={styles.controls}>
        <Button appearance="primary" onClick={() => setEntries((current) => [...current, current.length + 1])}>
          Append entry
        </Button>
        <Text>Follow end: {followEnd}</Text>
      </div>
      <div className={styles.viewport}>
        <GrowingContainer followEnd={followEnd} ariaLabel="Streaming activity">
          <div className={styles.entries}>
            {entries.map((entry) => (
              <div className={styles.entry} key={entry}>
                <Text weight="semibold">Activity {entry}</Text>
                <Text>Incremental output appended to the bounded viewport.</Text>
              </div>
            ))}
          </div>
        </GrowingContainer>
      </div>
    </section>
  );
}

function GrowingContainerStory() {
  const styles = useStyles();
  const preview = (
    <div className={styles.examples}>
      <GrowingContainerExample
        title="Preserve user position"
        description="Follows appended content only while the viewport remains near its end."
        followEnd="when-at-end"
      />
      <GrowingContainerExample
        title="Always follow"
        description="Keeps the latest appended content in view."
        followEnd="always"
      />
      <GrowingContainerExample
        title="Manual scroll"
        description="Never changes the viewport position when content is appended."
        followEnd="off"
      />
    </div>
  );
  return <ComponentStory definition={growingContainerDefinition} preview={preview} />;
}

const meta = {
  title: "Primitive Components/Growing Container",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: growingContainerDefinition },
  render: () => <GrowingContainerStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};