import type { Meta, StoryObj } from "@storybook/react-vite";
import { collectionBoardDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Primitive Components/Collection Board",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: collectionBoardDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
