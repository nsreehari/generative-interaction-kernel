import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentListDefinition } from "@gik/components/fluent";
import { ComponentStory } from "./ComponentStory";
const meta = { title: "Fluent Components/List", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentListDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Selectable: Story = { args: { variant: "selectable" } };