import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentToolbarDefinition } from "@gik/components/fluent";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Fluent Components/Toolbar", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentToolbarDefinition, variant: "standard" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
