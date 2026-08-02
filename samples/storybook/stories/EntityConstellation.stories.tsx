import type { Meta, StoryObj } from "@storybook/react-vite";
import { entityConstellationDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Entity Constellation",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: entityConstellationDefinition, variant: "grouped" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Grouped: Story = {};
export const Compact: Story = { args: { variant: "compact" } };