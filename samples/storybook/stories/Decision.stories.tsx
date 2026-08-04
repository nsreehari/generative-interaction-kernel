import type { Meta, StoryObj } from "@storybook/react-vite";
import { decisionDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Decision", component: ComponentStory, tags: ["autodocs"], args: { definition: decisionDefinition, variant: "summary" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {};
export const RationaleChain: Story = { args: { variant: "rationale-chain" } };
export const Text: Story = { args: { variant: "text" } };