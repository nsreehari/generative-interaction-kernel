import type { Meta, StoryObj } from "@storybook/react-vite";
import { infiniteCanvasDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Primitive Components/Infinite Canvas",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: infiniteCanvasDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
export const Minimal: Story = { args: { variant: "minimal" } };