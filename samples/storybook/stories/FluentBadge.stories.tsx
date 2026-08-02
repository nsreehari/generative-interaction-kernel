import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentBadgeDefinition } from "@gik/components/fluent";
import { ComponentStory } from "./ComponentStory";
const meta = { title: "Fluent Components/Badge", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentBadgeDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };