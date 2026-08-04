import type { Meta, StoryObj } from "@storybook/react-vite";
import { dateTimeDefinition } from "@gik/components/primitives";
import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Primitive Components/Date Time",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: dateTimeDefinition, variant: "timestamp" },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Timestamp: Story = {
  args: {
    examples: [
      { title: "24-hour minute precision" },
      { title: "12-hour AM/PM", configureTrial: (trial) => { trial.props.hourFormat = "12"; } },
      { title: "With seconds", configureTrial: (trial) => { trial.props.showSeconds = true; } },
      { title: "With timezone", configureTrial: (trial) => { trial.props.showTimeZone = true; } },
    ],
  },
};
export const Date: Story = { args: { variant: "date" } };
export const Time: Story = { args: { variant: "time" } };
