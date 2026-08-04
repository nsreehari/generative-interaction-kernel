import type { Meta, StoryObj } from "@storybook/react-vite";
import { ganttDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Primitive Components/Gantt",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: ganttDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };