import type { Meta, StoryObj } from "@storybook/react-vite";
import { workSetDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Work Set", component: ComponentStory, tags: ["autodocs"], args: { definition: workSetDefinition, variant: "board" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Board: Story = {};
export const Queue: Story = { args: { variant: "queue" } };
export const List: Story = { args: { variant: "list" } };
export const Text: Story = { args: { variant: "text" } };