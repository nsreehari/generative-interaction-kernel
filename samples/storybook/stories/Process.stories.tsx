import type { Meta, StoryObj } from "@storybook/react-vite";
import { processDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Process", component: ComponentStory, tags: ["autodocs"], args: { definition: processDefinition, variant: "flow" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Flow: Story = {};
export const Stages: Story = { args: { variant: "stages" } };
export const Text: Story = { args: { variant: "text" } };