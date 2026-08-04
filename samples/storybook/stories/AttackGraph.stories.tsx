import type { Meta, StoryObj } from "@storybook/react-vite";
import { attackGraphDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Attack Graph",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: attackGraphDefinition, variant: "canvas" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
export const Diagram: Story = { args: { variant: "diagram" } };
export const Relations: Story = { args: { variant: "relations" } };
export const Gantt: Story = {
  args: {
    variant: "gantt",
    examples: [
      {
        title: "Timestamp scale",
        description: "The Gantt variant using human-readable event timestamps and a shared time axis.",
        configureTrial: (trial) => {
          const spec = trial.props.spec as Record<string, unknown>;
          spec.ganttScale = { kind: "datetime", tickStep: 2000, showSeconds: true };
        },
      },
      {
        title: "Linear T-index scale",
        description: "The same Gantt variant using numeric coordinates with presentation-only T labels.",
        configureTrial: (trial) => {
          const graph = trial.props.graph as Record<string, unknown>;
          const relationships = graph.relationships as Array<Record<string, unknown>>;
          relationships[0].start = 1;
          relationships[0].end = 1.5;
          relationships[1].start = 2;
          relationships[1].end = 5;
          const spec = trial.props.spec as Record<string, unknown>;
          spec.ganttScale = { kind: "linear", displayPrefix: "T", minimum: 0, maximum: 5, tickStep: 1 };
        },
      },
    ],
  },
};
export const Text: Story = { args: { variant: "text" } };