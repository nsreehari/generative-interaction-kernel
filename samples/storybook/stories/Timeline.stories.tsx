import type { Meta, StoryObj } from "@storybook/react-vite";
import { timelineDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Timeline",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: timelineDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
export const Minimal: Story = { args: { variant: "minimal" } };