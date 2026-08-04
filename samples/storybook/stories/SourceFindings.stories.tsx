import type { Meta, StoryObj } from "@storybook/react-vite";
import { sourceFindingsDefinition } from "@gik/components/software";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Software Components/Source Findings", component: ComponentStory, tags: ["autodocs"], args: { definition: sourceFindingsDefinition, variant: "findings" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Findings: Story = {};
export const Text: Story = { args: { variant: "text" } };