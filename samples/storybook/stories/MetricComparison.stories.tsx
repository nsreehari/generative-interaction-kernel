import type { Meta, StoryObj } from "@storybook/react-vite";
import { metricComparisonDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Metric Comparison",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: metricComparisonDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
export const Ranked: Story = { args: { variant: "ranked" } };