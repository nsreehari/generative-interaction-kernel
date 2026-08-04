import type { Meta, StoryObj } from "@storybook/react-vite";
import { sourceViewerDefinition } from "@gik/components/primitives";
import { ComponentStory, type ComponentStoryExample } from "./ComponentStory";

const examples: ComponentStoryExample[] = [
  {
    title: "Source",
    description: "Exact source rows with stable line references.",
    configureTrial: (trial) => {
      trial.props.lines = [{ id: "41", line: 41, text: "if (riskScore >= threshold) {", note: "Containment threshold" }, { id: "42", line: 42, text: "  await disableIdentity(subjectId);", note: "External effect" }];
      trial.props.spec = { kind: "source", title: "Containment policy", language: "TypeScript", sourceLabel: "policies/containment.ts", fields: { id: "id", number: "line", text: "text", annotation: "note" } };
    },
  },
  {
    title: "Unified diff",
    description: "Aligned before and after rows represented in one source stream.",
    configureTrial: (trial) => { (trial.props.spec as Record<string, unknown>).kind = "unified-diff"; },
  },
  {
    title: "Split diff",
    description: "Aligned revisions presented side by side.",
  },
];

const meta = {
  title: "Primitive Components/Source Viewer",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: sourceViewerDefinition, variant: "standard", examples },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Representations: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
