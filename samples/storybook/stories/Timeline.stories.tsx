import type { Meta, StoryObj } from "@storybook/react-vite";
import { timelineDefinition } from "@gik/components/semantic";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Semantic Components/Timeline",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: timelineDefinition, variant: "standard" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

function configureTimestampAxis(trial: Parameters<NonNullable<React.ComponentProps<typeof ComponentStory>["configureTrial"]>>[0]) {
  trial.props.items = [
    { eventKey: "evt-1", at: "2026-08-04T09:10:00Z", title: "Signal detected" },
    { eventKey: "evt-2", at: "2026-08-04T09:24:00Z", title: "Investigation opened" },
    { eventKey: "evt-3", at: "2026-08-04T09:38:00Z", title: "Account contained" },
  ];
  const spec = trial.props.spec as Record<string, unknown>;
  spec.scale = { kind: "datetime", tickStep: 420000 };
}

export const Standard: Story = {};
export const Compact: Story = { args: { variant: "compact" } };
export const Minimal: Story = { args: { variant: "minimal" } };
export const Axis: Story = {
  args: {
    variant: "axis",
    configureTrial: configureTimestampAxis,
    examples: [
      {
        title: "Timestamp scale",
        description: "Point events positioned by timestamp on a shared horizontal axis.",
        configureTrial: configureTimestampAxis,
      },
      {
        title: "Linear T-index scale",
        description: "The same Axis variant using fractional numeric coordinates with presentation-only T labels.",
        configureTrial: (trial) => {
          trial.props.items = [
            { eventKey: "evt-1", at: 1, title: "Signal detected" },
            { eventKey: "evt-2", at: 1.5, title: "Investigation opened" },
            { eventKey: "evt-3", at: 4, title: "Account contained" },
          ];
          const spec = trial.props.spec as Record<string, unknown>;
          spec.scale = { kind: "linear", displayPrefix: "T", minimum: 0, maximum: 5, tickStep: 1 };
        },
      },
    ],
  },
};