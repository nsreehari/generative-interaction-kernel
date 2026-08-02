import type { Meta, StoryObj } from "@storybook/react-vite";
import { fluentButtonDefinition } from "@gik/components/fluent";
import type { ResolvedNode } from "@gik/kernel";
import { ComponentStory } from "./ComponentStory";

const iconTrial = (trial: ResolvedNode) => {
  delete trial.props.label;
  trial.props.icon = "edit";
  trial.props.ariaLabel = "Edit";
};

const meta = { title: "Fluent Components/Button", component: ComponentStory, tags: ["autodocs"], args: { definition: fluentButtonDefinition, variant: "action" }, parameters: { controls: { disable: true } } } satisfies Meta<typeof ComponentStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Action: Story = {};
export const Primary: Story = { args: { variant: "primary" } };
export const Subtle: Story = { args: { variant: "subtle" } };
export const Icon: Story = { args: { variant: "icon", configureTrial: iconTrial } };
export const Circular: Story = { args: { variant: "circular", configureTrial: iconTrial } };
export const Floating: Story = { args: { variant: "floating", configureTrial: iconTrial } };
export const Inline: Story = { args: { variant: "inline" } };