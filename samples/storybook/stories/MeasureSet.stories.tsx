import type { Meta, StoryObj } from "@storybook/react-vite";
import { measureSetDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Measure Set", component: ComponentStory, tags: ["autodocs"], args: { definition: measureSetDefinition, variant: "tiles" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Tiles: Story = {};
export const Table: Story = { args: { variant: "table" } };
export const Ranking: Story = { args: { variant: "ranking" } };
export const Text: Story = { args: { variant: "text" } };