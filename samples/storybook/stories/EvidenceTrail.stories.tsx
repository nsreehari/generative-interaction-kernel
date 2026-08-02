import type { Meta, StoryObj } from "@storybook/react-vite";
import { evidenceTrailDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Evidence Trail", component: ComponentStory, tags: ["autodocs"], args: { definition: evidenceTrailDefinition, variant: "detailed" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Detailed: Story = {};
export const Compact: Story = { args: { variant: "compact" } };