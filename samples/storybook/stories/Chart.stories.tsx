import type { Meta, StoryObj } from "@storybook/react-vite";
import { chartDefinition } from "@gik/components/primitives";
import type { ResolvedNode } from "@gik/kernel";
import { ComponentStory, type ComponentStoryExample } from "./ComponentStory";

const setKind = (kind: "bar" | "line" | "pie") => (trial: ResolvedNode) => {
	(trial.props.spec as Record<string, unknown>).kind = kind;
};

const examples: ComponentStoryExample[] = [
	{ title: "Bar", description: "Compares values across categories.", configureTrial: setKind("bar") },
	{ title: "Line", description: "Shows an ordered trend.", configureTrial: setKind("line") },
	{ title: "Pie", description: "Shows part-to-whole composition.", configureTrial: setKind("pie") },
];

const meta = { title: "Primitive Components/Chart", component: ComponentStory, tags: ["autodocs"], args: { definition: chartDefinition, variant: "standard", examples }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };