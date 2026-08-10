import type { Meta, StoryObj } from "@storybook/react-vite";
import { mathChallengeDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = { title: "Primitive Components/Math Challenge", component: ComponentStory, tags: ["autodocs"], args: { definition: mathChallengeDefinition }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};