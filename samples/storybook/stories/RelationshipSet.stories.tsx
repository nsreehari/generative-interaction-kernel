import type { Meta, StoryObj } from "@storybook/react-vite";
import { relationshipSetDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Relationship Set", component: ComponentStory, tags: ["autodocs"], args: { definition: relationshipSetDefinition, variant: "network" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Network: Story = {};
export const Matrix: Story = { args: { variant: "matrix" } };
export const Relations: Story = { args: { variant: "relations" } };
export const Text: Story = { args: { variant: "text" } };