import type { Meta, StoryObj } from "@storybook/react-vite";
import { narrativeDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Narrative", component: ComponentStory, tags: ["autodocs"], args: { definition: narrativeDefinition, variant: "article" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Article: Story = {};
export const Outline: Story = { args: { variant: "outline" } };
export const Briefing: Story = { args: { variant: "briefing" } };
export const Text: Story = { args: { variant: "text" } };