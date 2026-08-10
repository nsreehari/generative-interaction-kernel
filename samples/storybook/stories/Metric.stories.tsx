import type { Meta, StoryObj } from "@storybook/react-vite";
import { metricDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/Metric", component: ComponentStory, tags: ["autodocs"], args: { definition: metricDefinition }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};