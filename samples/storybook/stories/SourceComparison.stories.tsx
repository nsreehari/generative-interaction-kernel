import type { Meta, StoryObj } from "@storybook/react-vite";
import { sourceComparisonDefinition } from "@gik/components/software";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Software Components/Source Comparison", component: ComponentStory, tags: ["autodocs"], args: { definition: sourceComparisonDefinition, variant: "unified-diff" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnifiedDiff: Story = {};
export const SplitDiff: Story = { args: { variant: "split-diff" } };
export const Text: Story = { args: { variant: "text" } };