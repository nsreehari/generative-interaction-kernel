import type { Meta, StoryObj } from "@storybook/react-vite";
import { semanticGraphDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Semantic Graph", component: ComponentStory, tags: ["autodocs"], args: { definition: semanticGraphDefinition, variant: "network" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Network: Story = {};
export const Relations: Story = { args: { variant: "relations" } };