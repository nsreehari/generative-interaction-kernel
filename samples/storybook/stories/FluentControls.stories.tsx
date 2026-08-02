import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  fluentButtonDefinition,
  fluentDropdownDefinition,
  fluentIconButtonDefinition,
  fluentSwitchDefinition,
  fluentToggleDefinition,
} from "@gik/components/fluent";

import { ComponentStory } from "./ComponentStory";

const meta = {
  title: "Fluent Components/Controls",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: fluentButtonDefinition },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Button: Story = {};
export const IconButton: Story = { args: { definition: fluentIconButtonDefinition } };
export const Dropdown: Story = { args: { definition: fluentDropdownDefinition } };
export const Switch: Story = { args: { definition: fluentSwitchDefinition } };
export const Toggle: Story = { args: { definition: fluentToggleDefinition } };
