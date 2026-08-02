import type { Meta, StoryObj } from "@storybook/react-vite";
import { annotatedSourceExcerptDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Annotated Source Excerpt", component: ComponentStory, tags: ["autodocs"], args: { definition: annotatedSourceExcerptDefinition, variant: "annotated" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Annotated: Story = {};
export const Compact: Story = { args: { variant: "compact" } };