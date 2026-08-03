import type { Meta, StoryObj } from "@storybook/react-vite";
import { accessGateDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Primitive Components/Access Gate",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: accessGateDefinition },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Required: Story = {};