import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FluentText, fluentTextDefinition } from "@gik/components/fluent";

import { ComponentStory } from "./ComponentStory";

const useStyles = makeStyles({
  examples: { display: "grid", gap: tokens.spacingVerticalL },
});

function FluentTextStory() {
  const styles = useStyles();
  const examples = [
    { value: "Incident response", as: "h1", variant: "display" },
    { value: "Source report", as: "h2", variant: "title" },
    { value: "Correlated alerts", as: "h3", variant: "subtitle" },
    { value: "The report remains source-faithful.", as: "p", variant: "body" },
    { value: "Updated moments ago", as: "span", variant: "caption" },
  ].map((props, index) => {
    const node = fluentTextDefinition.materializeTrial();
    node.id = `text-example-${index}`;
    node.props = props;
    return node;
  });
  const preview = <div className={styles.examples}>{examples.map((node) => <FluentText key={node.id} node={node} emit={() => undefined} children={undefined} />)}</div>;
  return <ComponentStory definition={fluentTextDefinition} preview={preview} />;
}

const meta = {
  title: "Fluent Components/Text",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: fluentTextDefinition },
  render: () => <FluentTextStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};