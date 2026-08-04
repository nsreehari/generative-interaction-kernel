import type { Meta, StoryObj } from "@storybook/react-vite";
import { evidenceCaseDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Evidence Case", component: ComponentStory, tags: ["autodocs"], args: { definition: evidenceCaseDefinition, variant: "case" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Case: Story = {};
export const Sources: Story = { args: { variant: "sources" } };
export const Chain: Story = { args: { variant: "chain" } };
export const Text: Story = { args: { variant: "text" } };