import type { Meta, StoryObj } from "@storybook/react-vite";
import { timerButtonDefinition } from "@gik/components/primitives";
import type { ResolvedNode } from "@gik/kernel";

import { ComponentStory, type ComponentStoryExample } from "./ComponentStory";

const configure = (props: Record<string, unknown>) => (trial: ResolvedNode) => {
  Object.assign(trial.props, props);
};

const standardExamples: ComponentStoryExample[] = [
  {
    title: "Manual or auto",
    description: "Lets the user choose whether the countdown triggers the action.",
    configureTrial: configure({ durationMs: 10000 }),
  },
  {
    title: "Repeating countdown",
    description: "Triggers repeatedly while automatic countdown behavior remains active.",
    configureTrial: configure({
      label: "Refresh activity",
      durationMs: 10000,
      showPaceSwitch: false,
      repeat: true,
      appearance: "primary",
    }),
  },
  {
    title: "Manual only",
    description: "Provides an ordinary action without automatic countdown behavior.",
    configureTrial: configure({
      label: "Continue",
      defaultPace: "manual",
      showPaceSwitch: false,
      appearance: "primary",
    }),
  },
];

const autoOnlyExamples: ComponentStoryExample[] = [
  {
    title: "Automatic countdown",
    description: "Triggers after the countdown without exposing a pace control.",
    configureTrial: configure({
      label: "Continue automatically",
      durationMs: 10000,
      showPaceSwitch: true,
      appearance: "primary",
    }),
  },
  {
    title: "Repeating countdown",
    description: "Triggers after every elapsed interval while automatic behavior remains active.",
    configureTrial: configure({
      label: "Refresh activity",
      durationMs: 10000,
      repeat: true,
    }),
  },
];

const meta = {
  title: "Primitive Components/Timer Button",
  component: ComponentStory,
  tags: ["autodocs"],
  args: {
    definition: timerButtonDefinition,
    variant: "standard",
    examples: standardExamples,
  },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const AutoOnly: Story = {
  args: {
    variant: "auto-only",
    examples: autoOnlyExamples,
  },
};