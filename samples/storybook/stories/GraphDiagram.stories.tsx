import type { Meta, StoryObj } from "@storybook/react-vite";
import { graphDiagramDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/Graph Diagram", component: ComponentStory, tags: ["autodocs"], args: { definition: graphDiagramDefinition, variant: "diagram" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Diagram: Story = {};
export const Canvas: Story = { args: { variant: "canvas" } };