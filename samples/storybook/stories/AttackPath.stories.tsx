import type { Meta, StoryObj } from "@storybook/react-vite";
import { attackPathDefinition } from "@gik/components/security";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Security Components/Attack Path", component: ComponentStory, tags: ["autodocs"], args: { definition: attackPathDefinition, variant: "canvas" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
export const Diagram: Story = { args: { variant: "diagram" } };
export const Relations: Story = { args: { variant: "relations" } };
export const Gantt: Story = { args: { variant: "gantt" } };
export const Text: Story = { args: { variant: "text" } };