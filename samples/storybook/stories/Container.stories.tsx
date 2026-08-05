import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, CONTAINER_VARIANTS, containerDefinition, type ContainerVariant } from "@gik/components/primitives";

import { ComponentStory } from "./ComponentStory";

const useStyles = makeStyles({
  variants: { display: "grid", gap: tokens.spacingVerticalXL },
  example: { display: "grid", gap: tokens.spacingVerticalS },
  stage: { minHeight: "7rem", padding: tokens.spacingHorizontalM, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  item: { minWidth: "7rem", padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground3, borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}` },
});

function VariantExample({ variant }: { variant: ContainerVariant }) {
  const styles = useStyles();
  return <section className={styles.example}>
    <strong>{variant}</strong>
    <Container className={styles.stage} variant={variant} gap="m" wrap={variant === "flex"} direction={variant === "flex" ? "row" : undefined}>
      {["Source", "Analysis", "Evidence", "Actions"].map((label) => <div className={styles.item} key={label}>{label}</div>)}
    </Container>
  </section>;
}

function ContainerStory() {
  const styles = useStyles();
  return <ComponentStory
    definition={containerDefinition}
    preview={<div className={styles.variants}>{CONTAINER_VARIANTS.map((variant) => <VariantExample variant={variant} key={variant} />)}</div>}
  />;
}

const meta = {
  title: "Primitive Components/Container",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: containerDefinition },
  render: () => <ContainerStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};