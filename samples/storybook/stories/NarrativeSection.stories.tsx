import type { Meta, StoryObj } from "@storybook/react-vite";
import { narrativeSectionDefinition } from "@gik/components";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Semantic Components/Narrative Section", component: ComponentStory, tags: ["autodocs"], args: { definition: narrativeSectionDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };