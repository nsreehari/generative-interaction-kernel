import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentPanelDefinition } from "@gik/components/fluent";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Fluent Components/Panel", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentPanelDefinition, variant: "default" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Subtle: Story = { args: { variant: "subtle" } };