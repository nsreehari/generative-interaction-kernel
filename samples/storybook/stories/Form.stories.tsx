import type { Meta, StoryObj } from "@storybook/react-vite";
import { formDefinition } from "@gik/components/primitives";
import type { ResolvedNode } from "@gik/kernel";

import { ComponentStory, type ComponentStoryExample } from "./ComponentStory";

const configure = (props: Record<string, unknown>) => (trial: ResolvedNode) => {
  Object.assign(trial.props, props);
};

const examples: ComponentStoryExample[] = [
  {
    title: "Profile fields",
    description: "Combines constrained text, numbers, booleans, and single- or multi-select controls.",
    configureTrial: configure({
      fields: {
        properties: {
          name: { type: "string", title: "Display name", description: "Shown to collaborators", minLength: 2, colSpan: 8 },
          seats: { type: "integer", title: "Seats", minimum: 1, maximum: 100, colSpan: 4 },
          tier: { type: "string", title: "Tier", enum: ["starter", "team", "enterprise"], enumNames: ["Starter", "Team", "Enterprise"] },
          regions: { type: "array", title: "Regions", items: { enum: ["americas", "emea", "apac"] } },
          active: { type: "boolean", title: "Workspace active" },
        },
        required: ["name", "tier"],
      },
      value: { name: "Northstar", seats: 12, tier: "team", regions: ["americas", "emea"], active: true },
    }),
  },
  {
    title: "Notes and structured data",
    description: "Uses multiline, temporal, JSON, and read-only fields in one committed form.",
    configureTrial: configure({
      fields: {
        properties: {
          reviewDate: { type: "string", title: "Review date", format: "date" },
          notes: { type: "string", title: "Review notes", multiline: true, rows: 5 },
          policy: { type: "json", title: "Policy JSON" },
          owner: { type: "string", title: "Owner", readOnly: true },
        },
      },
      value: { reviewDate: "2026-09-15", notes: "Confirm the rollout criteria.", policy: { approvals: 2 }, owner: "Platform operations" },
    }),
  },
  {
    title: "Schema and data aliases",
    description: "Accepts the compatibility schema/data names without changing the public commit behavior.",
    configureTrial: configure({
      fields: undefined,
      value: undefined,
      schema: { properties: { code: { type: "string", title: "Reference code", pattern: "[A-Z]+" } }, required: ["code"] },
      data: { code: "GIK" },
    }),
  },
];

const meta = {
  title: "Primitive Components/Form",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: formDefinition, examples },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
