import type { Meta, StoryObj } from "@storybook/react-vite";
import { propertyDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/Property", component: ComponentStory, tags: ["autodocs"], args: { definition: propertyDefinition }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};