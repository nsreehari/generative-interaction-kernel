import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Markdown, markdownDefinition } from "@gik/components/primitives";

import { ComponentStory } from "./ComponentStory";

function MarkdownStory() {
  const node = markdownDefinition.materializeTrial();
  node.props.value = "# Incident report\n\n**Verdict:** True positive\n\n| Alert | Evidence |\n| --- | --- |\n| Password spray | 14 failed sign-ins |\n\n- Source-faithful rendering\n- Safe external links";
  return <ComponentStory definition={markdownDefinition} preview={<Markdown node={node} emit={() => undefined} children={undefined} />} />;
}

const meta = {
  title: "Primitive Components/Markdown",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: markdownDefinition },
  render: () => <MarkdownStory />,
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};