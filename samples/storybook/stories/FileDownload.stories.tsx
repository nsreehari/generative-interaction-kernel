import type { Meta, StoryObj } from "@storybook/react-vite";
import { fileDownloadDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/File Download", component: ComponentStory, tags: ["autodocs"], args: { definition: fileDownloadDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
