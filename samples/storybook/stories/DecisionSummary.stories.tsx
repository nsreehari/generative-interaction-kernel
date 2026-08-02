import type { Meta, StoryObj } from "@storybook/react-vite";
import { decisionSummaryDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Decision Summary",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: decisionSummaryDefinition, variant: "detailed" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Detailed: Story = {};
export const Concise: Story = { args: { variant: "concise" } };