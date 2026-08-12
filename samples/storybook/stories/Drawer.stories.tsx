import React from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Drawer,
  drawerDefinition,
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

function drawerNode(open: boolean): ResolvedNode {
  return {
    id: "drawer-story",
    capability: "primitive:drawer",
    visible: true,
    fallback: false,
    props: {
      variant: "panel-vertical",
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

function DrawerStory() {
  const styles = useStyles();
  const [open, setOpen] = React.useState(false);
  const preview = (
    <div className={styles.viewport}>
      <Drawer
        node={drawerNode(open)}
        emit={(_event, payload) => {
          setOpen(payload?.open === true);
        }}
      >
        <div className={styles.panelContent}>
          <Text weight="semibold">Source report</Text>
          <Text>Select and inspect a report before running analysis.</Text>
        </div>
      </Drawer>
    </div>
  );
  return <ComponentStory definition={drawerDefinition} preview={preview} />;
}

const meta = {
  title: "Primitive Components/Drawer",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: drawerDefinition },
  render: () => <DrawerStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};