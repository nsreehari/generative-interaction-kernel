import type { Meta, StoryObj } from "@storybook/react-vite";
import { actionBoardDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Action Board",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: actionBoardDefinition, variant: "board" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Board: Story = {};
export const List: Story = { args: { variant: "list" } };