import type { Meta, StoryObj } from "@storybook/react-vite";
import { editableTableDefinition } from "@gik/components/primitives";
import type { ResolvedNode } from "@gik/kernel";

import { ComponentStory, type ComponentStoryExample } from "./ComponentStory";

const configure = (props: Record<string, unknown>) => (trial: ResolvedNode) => {
  Object.assign(trial.props, props);
};

const examples: ComponentStoryExample[] = [
  {
    title: "Inferred columns",
    description: "Derives a stable union of columns from small, ragged row collections.",
    configureTrial: configure({
      spec: {},
      rows: [
        { owner: "Mina", status: "Ready" },
        { owner: "Jon", status: "Review", estimate: 5 },
      ],
    }),
  },
  {
    title: "Schema-defined empty table",
    description: "Keeps an empty collection immediately editable by declaring its columns in advance.",
    configureTrial: configure({
      spec: {
        schema: {
          properties: {
            ticker: { type: "string", title: "Ticker" },
            quantity: { type: "number", title: "Quantity" },
            costBasis: { type: "number", title: "Cost basis" },
          },
        },
      },
      rows: [],
    }),
  },
  {
    title: "Restricted numeric editor",
    description: "Uses schema-driven numeric inputs while disabling row creation and removal.",
    configureTrial: configure({
      spec: {
        addRow: false,
        deleteRow: false,
        schema: {
          properties: {
            category: { type: "string", title: "Category" },
            budget: { type: "number", title: "Budget" },
          },
        },
      },
      rows: [
        { category: "Research", budget: 18000 },
        { category: "Delivery", budget: 32000 },
      ],
    }),
  },
];

const meta = {
  title: "Primitive Components/Editable Table",
  component: ComponentStory,
  tags: ["autodocs"],
  args: { definition: editableTableDefinition, examples },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof ComponentStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
