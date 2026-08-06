import type { Meta, StoryObj } from "@storybook/react-vite";
import { fileInputDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/File Input", component: ComponentStory, tags: ["autodocs"], args: { definition: fileInputDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
