import type { Meta, StoryObj } from "@storybook/react-vite";
import { argumentDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Argument", component: ComponentStory, tags: ["autodocs"], args: { definition: argumentDefinition, variant: "map" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Map: Story = {};
export const Outline: Story = { args: { variant: "outline" } };
export const Text: Story = { args: { variant: "text" } };