import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentRowDefinition } from "@gik/components/fluent";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Fluent Components/Row", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentRowDefinition, variant: "default" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Wrap: Story = { args: { variant: "wrap" } };
export const Between: Story = { args: { variant: "between" } };