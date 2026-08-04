import type { Meta, StoryObj } from "@storybook/react-vite";
import { eventSeriesDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Event Series", component: ComponentStory, tags: ["autodocs"], args: { definition: eventSeriesDefinition, variant: "chronology" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Chronology: Story = {};
export const Axis: Story = { args: { variant: "axis" } };
export const Text: Story = { args: { variant: "text" } };