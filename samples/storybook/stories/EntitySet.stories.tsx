import type { Meta, StoryObj } from "@storybook/react-vite";
import { entitySetDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Entity Set", component: ComponentStory, tags: ["autodocs"], args: { definition: entitySetDefinition, variant: "clusters" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Clusters: Story = {};
export const Matrix: Story = { args: { variant: "matrix" } };
export const List: Story = { args: { variant: "list" } };
export const Text: Story = { args: { variant: "text" } };