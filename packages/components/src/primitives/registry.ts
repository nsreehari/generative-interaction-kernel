import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { AccessGate, accessGateDefinition } from "./access-gate";
import { Chart, chartDefinition } from "./chart";
import { CollectionBoard, collectionBoardDefinition } from "./collection-board";
import { DateTime, dateTimeDefinition } from "./datetime";
import { EditableTable, editableTableDefinition } from "./editable-table";
import { Form, formDefinition } from "./form";
import { Gantt, ganttDefinition } from "./gantt";
import { GrowingContainerPrimitive, growingContainerDefinition } from "./growing-container";
import { InfiniteCanvasPrimitive, infiniteCanvasDefinition } from "./infinite-canvas";
import { SourceViewer, sourceViewerDefinition } from "./source-viewer";
import { TimerButton, timerButtonDefinition } from "./timer-button";
import { TodoList, todoListDefinition } from "./todo-list";

export const primitiveComponentViews: Record<string, ProjectionView> = {
  "access-gate": AccessGate,
  chart: Chart,
  "collection-board": CollectionBoard,
  datetime: DateTime,
  "editable-table": EditableTable,
  form: Form,
  gantt: Gantt,
  "growing-container": GrowingContainerPrimitive,
  "infinite-canvas": InfiniteCanvasPrimitive,
  "source-viewer": SourceViewer,
  "timer-button": TimerButton,
  "todo-list": TodoList,
};

export const primitiveComponentDefinitions = {
  "access-gate": accessGateDefinition,
  chart: chartDefinition,
  "collection-board": collectionBoardDefinition,
  datetime: dateTimeDefinition,
  "editable-table": editableTableDefinition,
  form: formDefinition,
  gantt: ganttDefinition,
  "growing-container": growingContainerDefinition,
  "infinite-canvas": infiniteCanvasDefinition,
  "source-viewer": sourceViewerDefinition,
  "timer-button": timerButtonDefinition,
  "todo-list": todoListDefinition,
} as const;

export const primitiveComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(primitiveComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    ...(definition.dataProp ? { dataProp: definition.dataProp } : {}),
    ...(definition.slots ? { slots: [...definition.slots] } : {}),
    emits: [...definition.events],
  }])
);