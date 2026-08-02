import type { Meta, StoryObj } from "@storybook/react-vite";
import { sequenceDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Sequence",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: sequenceDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };