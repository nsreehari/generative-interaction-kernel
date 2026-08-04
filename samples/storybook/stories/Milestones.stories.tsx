import type { Meta, StoryObj } from "@storybook/react-vite";
import { milestonesDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Milestones", component: ComponentStory, tags: ["autodocs"], args: { definition: milestonesDefinition, variant: "rail" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rail: Story = {};
export const Timeline: Story = { args: { variant: "timeline" } };
export const List: Story = { args: { variant: "list" } };
export const Axis: Story = { args: { variant: "axis" } };
export const Text: Story = { args: { variant: "text" } };