import React from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PaneWithTrigger,
  paneWithTriggerDefinition,
} from "@gik/components/primitives";
import type { ResolvedNode } from "@gik/kernel";

import { ComponentStory } from "./ComponentStory";

const useStyles = makeStyles({
  viewport: {
    position: "relative",
    height: "38rem",
    minHeight: 0,
    overflow: "hidden",
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  panelContent: {
    display: "grid",
    gap: tokens.spacingVerticalM,
  },
});

function paneNode(open: boolean): ResolvedNode {
  return {
    id: "drawer-story",
    capability: "primitive:pane-with-trigger",
    visible: true,
    fallback: false,
    props: {
      variant: "drawer",
      open,
      fabPosition: "top-left",
      title: "Source reports",
      openLabel: "Open source reports",
      closeLabel: "Close source reports",
      panelWidthPercent: 80,
    },
    children: [],
  };
}

function PaneWithTriggerStory() {
  const styles = useStyles();
  const [open, setOpen] = React.useState(false);
  const preview = (
    <div className={styles.viewport}>
      <PaneWithTrigger
        node={paneNode(open)}
        emit={(_event, payload) => {
          setOpen(payload?.open === true);
        }}
      >
        <div className={styles.panelContent}>
          <Text weight="semibold">Source report</Text>
          <Text>Select and inspect a report before running analysis.</Text>
        </div>
      </PaneWithTrigger>
    </div>
  );
  return <ComponentStory definition={paneWithTriggerDefinition} preview={preview} />;
}

const meta = {
  title: "Primitive Components/Pane With Trigger",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: paneWithTriggerDefinition },
  render: () => <PaneWithTriggerStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};