import type { AgentFacingCapabilityCatalog } from "../shared/agent-facing";

export const agentFacingComponentCatalog: AgentFacingCapabilityCatalog = {
  "catalog": {
    "fluent:badge": {
      "for": [
        "A compact label communicates status, category, or count"
      ],
      "notFor": [
        "The value needs explanatory prose or interaction"
      ]
    },
    "fluent:button": {
      "for": [
        "A user invokes a command through a label or familiar icon"
      ],
      "notFor": [
        "The interaction is a persistent binary state; use switch or toggle"
      ]
    },
    "fluent:chips": {
      "for": [
        "Users need to review and remove a compact set of discrete values"
      ],
      "notFor": [
        "Values are read-only",
        "Users must add values within the same control"
      ]
    },
    "fluent:data-grid": {
      "for": [
        "Tabular data needs row selection or sortable columns"
      ],
      "notFor": [
        "The table is display-only; use table",
        "Users need spreadsheet editing"
      ]
    },
    "fluent:dialog": {
      "for": [
        "A temporary surface must interrupt or supplement the current workflow"
      ],
      "notFor": [
        "The content belongs in the page flow",
        "A domain-specific composite already owns the workflow"
      ]
    },
    "fluent:dropdown": {
      "for": [
        "A user selects one value from a small option set"
      ],
      "notFor": [
        "A domain-specific component owns the interaction contract"
      ]
    },
    "fluent:list": {
      "for": [
        "A compact sequence of labeled values should be displayed or selected"
      ],
      "notFor": [
        "Values require columns; use table or data-grid"
      ]
    },
    "fluent:panel": {
      "for": [
        "Related controls or content need a bounded group"
      ],
      "notFor": [
        "The group does not need a visual boundary"
      ]
    },
    "fluent:persona": {
      "for": [
        "A person or identity needs a recognizable summary"
      ],
      "notFor": [
        "The content does not represent a person or identity"
      ]
    },
    "fluent:searchbox": {
      "for": [
        "A search or filtering value should be committed explicitly"
      ],
      "notFor": [
        "Every keystroke must update the result set; use text-field"
      ]
    },
    "fluent:row": {
      "for": [
        "Peer controls belong on one horizontal line"
      ],
      "notFor": [
        "Children form a vertical document flow"
      ]
    },
    "fluent:spinner": {
      "for": [
        "An operation is in progress and its completion percentage is unknown"
      ],
      "notFor": [
        "Progress is determinate or no operation is active"
      ]
    },
    "fluent:switch": {
      "for": [
        "A binary setting benefits from a track-and-thumb control"
      ],
      "notFor": [
        "A domain-specific component owns the interaction contract"
      ]
    },
    "fluent:table": {
      "for": [
        "Structured data needs a read-only tabular presentation"
      ],
      "notFor": [
        "Rows need selection or columns need sorting; use data-grid"
      ]
    },
    "fluent:text": {
      "for": [
        "A scalar string needs basic Fluent typography",
        "A heading, label, caption, or prose value needs explicit HTML semantics"
      ],
      "notFor": [
        "Content contains Markdown or rich document structure",
        "Text is an interactive input or command"
      ]
    },
    "fluent:tab-bar": {
      "for": [
        "Peer views share one region and exactly one is active"
      ],
      "notFor": [
        "The choices set a form value rather than switching views"
      ]
    },
    "fluent:text-field": {
      "for": [
        "A short text value must update as the user types"
      ],
      "notFor": [
        "The value requires multiple lines",
        "The value should commit only on form submission"
      ]
    },
    "fluent:textarea": {
      "for": [
        "A multiline text value must update as the user types"
      ],
      "notFor": [
        "The value is short enough for a text field",
        "The value should commit only on form submission"
      ]
    },
    "fluent:toolbar": {
      "for": [
        "Related commands and controls act on the same work surface"
      ],
      "notFor": [
        "Children are general page content rather than commands or controls"
      ]
    },
    "fluent:toggle": {
      "for": [
        "A binary mode needs a compact button presentation"
      ],
      "notFor": [
        "A domain-specific component owns the interaction contract"
      ]
    },
    "primitive:access-gate": {
      "for": [
        "Content availability depends on an externally managed access workflow"
      ],
      "notFor": [
        "The workflow is a general confirmation without access input"
      ]
    },
    "primitive:alert": {
      "for": [
        "A status or failure needs prominent non-interactive feedback"
      ],
      "notFor": [
        "The message is ordinary supporting copy; use primitive:note"
      ]
    },
    "primitive:chart": {
      "for": [
        "Numeric values need visual comparison, trend reading, or part-to-whole analysis",
        "A small single series is sufficient"
      ],
      "notFor": [
        "Values are primarily read as exact measures; use measure-set",
        "The data needs multi-series interaction or zooming; use a specialized chart capability"
      ]
    },
    "primitive:collection-board": {
      "for": [
        "Records occupy one of several declared columns",
        "Users may select, reorder, or move records between columns"
      ],
      "notFor": [
        "Columns encode tabular fields rather than item groups",
        "Workflow transition rules must be inferred by the component"
      ]
    },
    "primitive:container": {
      "for": [
        "Child views need declarative spatial composition",
        "One projection root must contain several sibling regions"
      ],
      "notFor": [
        "The surface has domain semantics better expressed by a semantic component",
        "The region needs bounded scrolling; use primitive:growing-container"
      ]
    },
    "primitive:datetime": {
      "for": [
        "A scalar temporal value needs consistent human-readable presentation",
        "Semantic HTML time metadata should preserve the source instant"
      ],
      "notFor": [
        "Users must edit the value; use primitive:form",
        "Multiple temporal records form a chronology; use semantic:event-series"
      ]
    },
    "primitive:drawer": {
      "for": [
        "A workspace needs an independently controlled floating side panel"
      ],
      "notFor": [
        "Content should permanently share horizontal space",
        "A modal decision interrupts the workflow"
      ]
    },
    "primitive:editable-table": {
      "for": [
        "Users edit a small tabular collection and explicitly commit or discard the draft"
      ],
      "notFor": [
        "Rows are read-only",
        "The dataset requires virtualization or spreadsheet formulas"
      ]
    },
    "primitive:file-download": {
      "for": [
        "A workflow exposes generated or persisted content as a local download"
      ],
      "notFor": [
        "A remote URL should be navigated directly"
      ]
    },
    "primitive:file-input": {
      "for": [
        "A declarative workflow needs local files or attachments"
      ],
      "notFor": [
        "The host must acquire files without user interaction"
      ]
    },
    "primitive:file-list": {
      "for": [
        "A workflow presents uploaded, staged, or downloadable files"
      ],
      "notFor": [
        "Only one command-style download is needed; use file-download"
      ]
    },
    "primitive:form": {
      "for": [
        "Users edit a schema-defined object and explicitly commit or discard the draft"
      ],
      "notFor": [
        "Each field must emit immediately without an explicit commit",
        "The data is naturally edited as rows; use editable-table"
      ],
      "interaction": "committed-input"
    },
    "primitive:gantt": {
      "for": [
        "Records have meaningful start and end coordinates",
        "Users need to compare duration, span, or overlap"
      ],
      "notFor": [
        "Records are point events; use semantic:event-series",
        "Order is non-temporal; use semantic:process"
      ]
    },
    "primitive:graph-diagram": {
      "for": [
        "A caller has already normalized records into nodes and edges"
      ],
      "notFor": [
        "Relationship meaning or domain validation has not yet been resolved"
      ]
    },
    "primitive:growing-container": {
      "for": [
        "A bounded region receives content incrementally",
        "The viewport should own overflow and optionally follow appended content"
      ],
      "notFor": [
        "The parent already owns scrolling",
        "Content should expand the surrounding document instead of remaining bounded"
      ]
    },
    "primitive:infinite-canvas": {
      "for": [
        "Users need to pan, zoom, and reposition a node topology",
        "Connections can be represented by matching source and target port tokens"
      ],
      "notFor": [
        "A static relationship list is sufficient",
        "The data has no stable node identities"
      ]
    },
    "primitive:math-challenge": {
      "for": [
        "A destructive action requires deliberate confirmation"
      ],
      "notFor": [
        "A normal confirmation button is sufficient",
        "The operation is reversible"
      ]
    },
    "primitive:markdown": {
      "for": [
        "A trusted scalar contains Markdown document content",
        "Headings, lists, tables, code, and links must retain their structure"
      ],
      "notFor": [
        "The value is plain text; use fluent:text",
        "The source must be shown verbatim; use primitive:source-viewer"
      ]
    },
    "primitive:metric": {
      "for": [
        "One scalar deserves compact visual prominence"
      ],
      "notFor": [
        "Several related measures should be compared; use semantic:measure-set"
      ]
    },
    "primitive:note": {
      "for": [
        "Short supporting or status copy needs visual emphasis without interaction"
      ],
      "notFor": [
        "Content contains document structure; use primitive:markdown",
        "The message requires dismissal or an action"
      ]
    },
    "primitive:property": {
      "for": [
        "An identifier, enum, count, or short phrase needs a visible label"
      ],
      "notFor": [
        "The value is a prominent measure; use primitive:metric"
      ]
    },
    "primitive:source-viewer": {
      "for": [
        "Exact source wording and stable line references matter",
        "A source or precomputed diff needs safe read-only rendering"
      ],
      "notFor": [
        "Users must edit source content",
        "The component would need to calculate or interpret changes"
      ]
    },
    "primitive:timer-button": {
      "for": [
        "An action may be triggered manually or after a visible delay",
        "A user-selectable manual/auto pace supports repeated demonstrations or guided flows"
      ],
      "notFor": [
        "Elapsed time is informational and must not trigger an action",
        "The workflow needs scheduling that must survive an unmounted UI"
      ]
    },
    "primitive:todo-list": {
      "for": [
        "Boolean form fields should be presented as immediately committed todo items"
      ],
      "notFor": [
        "Values require an explicit Save or Discard step; use primitive:form",
        "Items are read-only; use fluent:list"
      ]
    },
    "semantic:argument": {
      "for": [
        "Claims are connected by explicit support, opposition, or qualification"
      ],
      "notFor": [
        "Several positions merely differ without an authored inference structure"
      ]
    },
    "semantic:measure-set": {
      "for": [
        "Several measurements form one comparison set"
      ],
      "notFor": [
        "Values form a continuous trend; use chart"
      ]
    },
    "semantic:milestones": {
      "for": [
        "Records are meaningful dated targets or achievements"
      ],
      "notFor": [
        "Records are procedural work phases; use process",
        "Records are general observed events; use event-series"
      ]
    },
    "semantic:narrative": {
      "for": [
        "Explanatory content is organized into stable sections"
      ],
      "notFor": [
        "Records are primarily chronological; use event-series"
      ]
    },
    "semantic:relationship-set": {
      "for": [
        "Explicit relationships connect stable entities"
      ],
      "notFor": [
        "Only grouped entities matter; use entity-set"
      ]
    },
    "semantic:work-set": {
      "for": [
        "Records represent actionable work with stable placement or order"
      ],
      "notFor": [
        "Records are purely informational or encode process steps"
      ]
    },
    "semantic:event-series": {
      "for": [
        "Timestamped events form the primary relationship"
      ],
      "notFor": [
        "Order is procedural rather than temporal"
      ]
    },
    "semantic:process": {
      "for": [
        "Records are ordered procedural steps"
      ],
      "notFor": [
        "Timestamps are the primary ordering relationship"
      ]
    },
    "semantic:entity-set": {
      "for": [
        "A population of entities is the semantic subject"
      ],
      "notFor": [
        "Relationships between entities are primary"
      ]
    },
    "semantic:evidence-case": {
      "for": [
        "Evidence collectively supports or challenges a case"
      ],
      "notFor": [
        "Records are merely chronological"
      ]
    },
    "semantic:decision": {
      "for": [
        "One decision and its justification are the focal result"
      ],
      "notFor": [
        "Users must choose among interactive options"
      ]
    },
    "security:attack-path": {
      "for": [
        "Directed adversarial activity connects security entities"
      ],
      "notFor": [
        "The relationships are not adversarial; use semantic:relationship-set",
        "Only event chronology matters"
      ]
    },
    "software:source-findings": {
      "for": [
        "Findings attach to exact software source lines"
      ],
      "notFor": [
        "Evidence spans unrelated sources without line references"
      ]
    },
    "software:source-comparison": {
      "for": [
        "Users need to compare two aligned software source versions"
      ],
      "notFor": [
        "Only one source is present"
      ]
    }
  },
  "details": {
    "fluent:badge": {
      "props": {
        "label": {
          "type": "string"
        },
        "appearance": {
          "type": "string",
          "enum": [
            "filled",
            "ghost",
            "outline",
            "tint"
          ]
        },
        "color": {
          "type": "string",
          "enum": [
            "brand",
            "danger",
            "important",
            "informative",
            "severe",
            "subtle",
            "success",
            "warning"
          ]
        },
        "shape": {
          "type": "string",
          "enum": [
            "circular",
            "rounded",
            "square"
          ]
        },
        "size": {
          "type": "string",
          "enum": [
            "tiny",
            "extra-small",
            "small",
            "medium",
            "large"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "constraints": [
        "Keep the label short",
        "Use only native Fluent appearance, color, shape, and size values"
      ],
      "example": {
        "capability": "fluent:badge",
        "props": {
          "label": "Active",
          "color": "success",
          "variant": "standard"
        }
      }
    },
    "fluent:button": {
      "props": {
        "label": {
          "type": "string"
        },
        "icon": {
          "type": "string",
          "enum": [
            "edit",
            "full-screen-maximize",
            "full-screen-minimize"
          ]
        },
        "appearance": {
          "type": "string",
          "enum": [
            "primary",
            "secondary",
            "subtle",
            "transparent",
            "outline"
          ]
        },
        "ariaLabel": {
          "type": "string"
        },
        "disabled": {
          "type": "boolean"
        },
        "loading": {
          "type": "boolean"
        },
        "shape": {
          "type": "string",
          "enum": [
            "rounded",
            "circular",
            "square"
          ]
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        }
      },
      "variants": {
        "action": {
          "summary": "Uses Fluent's standard labeled action presentation.",
          "useWhen": [
            "A normal labeled command is needed"
          ],
          "default": true
        },
        "primary": {
          "summary": "Uses Fluent's primary appearance.",
          "useWhen": [
            "The command is the primary action in its region"
          ]
        },
        "subtle": {
          "summary": "Uses Fluent's subtle appearance.",
          "useWhen": [
            "The command should remain visually quiet"
          ]
        },
        "icon": {
          "summary": "Renders an icon-only Fluent button.",
          "useWhen": [
            "A familiar icon has a complete accessible name"
          ]
        },
        "circular": {
          "summary": "Renders an icon-only circular Fluent button.",
          "useWhen": [
            "A compact circular command is appropriate"
          ]
        },
        "floating": {
          "summary": "Renders a large primary circular icon button; its container owns positioning.",
          "useWhen": [
            "A prominent floating-style command is needed"
          ]
        },
        "inline": {
          "summary": "Uses Fluent's transparent small button presentation.",
          "useWhen": [
            "An action appears inline with text or dense content"
          ]
        }
      },
      "emits": {
        "press": {
          "summary": "The user invokes the button.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {}
          }
        }
      },
      "constraints": [
        "Use a concise label for labeled variants",
        "Always provide ariaLabel for icon-only variants",
        "Handle press outside the component"
      ],
      "example": {
        "capability": "fluent:button",
        "props": {
          "label": "Analyze report",
          "appearance": "primary",
          "variant": "action"
        }
      }
    },
    "fluent:chips": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "label"
            ],
            "properties": {
              "value": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "disabled": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "props": {
        "ariaLabel": {
          "type": "string"
        },
        "disabled": {
          "type": "boolean"
        },
        "size": {
          "type": "string",
          "enum": [
            "extra-small",
            "small",
            "medium",
            "large"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "remove": {
          "summary": "The user removes a chip.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Provide stable item values and labels",
        "Handle remove outside the component"
      ],
      "example": {
        "capability": "fluent:chips",
        "props": {
          "ariaLabel": "Selected techniques",
          "variant": "standard"
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:data-grid": {
      "dataProps": {
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "cells"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "cells": {
                "type": "object",
                "additionalProperties": {
                  "type": [
                    "string",
                    "number",
                    "boolean",
                    "null"
                  ]
                }
              }
            }
          }
        }
      },
      "props": {
        "ariaLabel": {
          "type": "string"
        },
        "columns": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "label"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "label": {
                "type": "string"
              }
            }
          }
        },
        "selectionMode": {
          "type": "string",
          "enum": [
            "single",
            "multiselect"
          ]
        },
        "selectedRowIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "sortColumn": {
          "type": "string"
        },
        "sortDirection": {
          "type": "string",
          "enum": [
            "ascending",
            "descending"
          ]
        },
        "size": {
          "type": "string",
          "enum": [
            "extra-small",
            "small",
            "medium"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "The selected data-grid rows change.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "rowIds"
            ],
            "properties": {
              "rowIds": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        },
        "sort": {
          "summary": "The data-grid sort changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "columnId",
              "direction"
            ],
            "properties": {
              "columnId": {
                "type": "string"
              },
              "direction": {
                "enum": [
                  "ascending",
                  "descending"
                ]
              }
            }
          }
        }
      },
      "constraints": [
        "Provide explicit columns and stable row ids",
        "Apply sorting and selection state outside the component"
      ],
      "example": {
        "capability": "fluent:data-grid",
        "props": {
          "ariaLabel": "Selectable incidents",
          "columns": [
            {
              "id": "status",
              "label": "Status"
            },
            {
              "id": "owner",
              "label": "Owner"
            }
          ],
          "selectionMode": "single",
          "selectedRowIds": [
            "incident-1"
          ],
          "sortColumn": "status",
          "sortDirection": "ascending",
          "variant": "standard"
        },
        "bindings": {
          "rows": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:dialog": {
      "props": {
        "open": {
          "type": "boolean"
        },
        "defaultOpen": {
          "type": "boolean"
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        },
        "modalType": {
          "type": "string",
          "enum": [
            "modal",
            "non-modal",
            "alert"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard dialog surface.",
          "useWhen": [
            "Content requires a focused temporary surface"
          ],
          "default": true
        }
      },
      "slots": [
        "children"
      ],
      "emits": {
        "openChange": {
          "summary": "The dialog open state changed; handling this event is optional unless open is controlled.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "open"
            ],
            "properties": {
              "open": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "constraints": [
        "Prefer local dialog state and use defaultOpen only to choose its initial state",
        "Bind open only when application behavior or cross-Cell coordination must control the dialog",
        "Handle openChange only when the application needs to observe or control dialog state",
        "Place dialog content in children"
      ],
      "example": {
        "capability": "fluent:dialog",
        "props": {
          "defaultOpen": true,
          "title": "Review details",
          "variant": "standard"
        }
      }
    },
    "fluent:dropdown": {
      "props": {
        "value": {
          "type": "string"
        },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "label"
            ],
            "properties": {
              "value": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "disabled": {
                "type": "boolean"
              }
            }
          }
        },
        "label": {
          "type": "string"
        },
        "placeholder": {
          "type": "string"
        },
        "ariaLabel": {
          "type": "string"
        },
        "required": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "The selected option changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "label"
            ],
            "properties": {
              "value": {
                "type": "string"
              },
              "label": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Provide stable option values",
        "Provide label or ariaLabel",
        "Handle select outside the component"
      ],
      "example": {
        "capability": "fluent:dropdown",
        "props": {
          "value": "soc-t3",
          "ariaLabel": "Select demo Blueprint",
          "options": [
            {
              "value": "soc-t3",
              "label": "Governed SOC investigation"
            },
            {
              "value": "soc-executive",
              "label": "SOC executive walkthrough"
            }
          ],
          "variant": "standard"
        }
      }
    },
    "fluent:list": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "label"
            ],
            "properties": {
              "value": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "disabled": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "props": {
        "ariaLabel": {
          "type": "string"
        },
        "selectionMode": {
          "type": "string",
          "enum": [
            "single",
            "multiselect"
          ]
        },
        "selectedValues": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Renders a non-selecting Fluent list.",
          "useWhen": [
            "Items are displayed for reading or navigation handled elsewhere"
          ],
          "default": true
        },
        "selectable": {
          "summary": "Enables Fluent single selection unless selectionMode is explicitly authored.",
          "useWhen": [
            "Users choose one or more items from the list"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "The selected list values change.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "values"
            ],
            "properties": {
              "values": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "constraints": [
        "Use stable item values",
        "Set selectionMode only when selection is required",
        "Handle select outside the component"
      ],
      "example": {
        "capability": "fluent:list",
        "props": {
          "ariaLabel": "Incident states",
          "variant": "standard"
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:panel": {
      "props": {
        "title": {
          "type": "string"
        }
      },
      "variants": {
        "default": {
          "summary": "Uses the standard Fluent surface.",
          "useWhen": [
            "A bounded content group is required"
          ],
          "default": true
        },
        "subtle": {
          "summary": "Uses a quieter neutral surface.",
          "useWhen": [
            "The group is secondary to nearby content"
          ]
        }
      },
      "slots": [
        "children"
      ],
      "constraints": [
        "Use a concise title",
        "Do not nest panels solely for spacing"
      ],
      "example": {
        "capability": "fluent:panel",
        "props": {
          "title": "Details",
          "variant": "default"
        }
      }
    },
    "fluent:persona": {
      "props": {
        "name": {
          "type": "string"
        },
        "presenceOnly": {
          "type": "boolean"
        },
        "secondaryText": {
          "type": "string"
        },
        "tertiaryText": {
          "type": "string"
        },
        "size": {
          "type": "string",
          "enum": [
            "extra-small",
            "small",
            "medium",
            "large",
            "huge"
          ]
        },
        "textAlignment": {
          "type": "string",
          "enum": [
            "center",
            "start"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "constraints": [
        "Provide the display name",
        "Use supporting text only for identity-relevant details"
      ],
      "example": {
        "capability": "fluent:persona",
        "props": {
          "name": "Ada Lovelace",
          "secondaryText": "Incident commander",
          "variant": "standard"
        }
      }
    },
    "fluent:searchbox": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "label": {
          "type": "string"
        },
        "placeholder": {
          "type": "string"
        },
        "required": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "ariaLabel": {
          "type": "string"
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "submit": {
          "summary": "The user submits the search value.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Provide label or ariaLabel",
        "Handle submit outside the component"
      ],
      "example": {
        "capability": "fluent:searchbox",
        "props": {
          "label": "Search incidents",
          "variant": "standard"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:row": {
      "props": {
        "spacing": {
          "type": "string"
        }
      },
      "variants": {
        "default": {
          "summary": "Uses a standard horizontal layout.",
          "useWhen": [
            "Children fit on one line"
          ],
          "default": true
        },
        "wrap": {
          "summary": "Wraps children onto additional lines.",
          "useWhen": [
            "Children may exceed available width"
          ]
        },
        "between": {
          "summary": "Distributes children across the available width.",
          "useWhen": [
            "Leading and trailing groups share a row"
          ]
        }
      },
      "slots": [
        "children"
      ],
      "constraints": [
        "Use wrap when content may exceed the available width"
      ],
      "example": {
        "capability": "fluent:row",
        "props": {
          "variant": "default"
        }
      }
    },
    "fluent:spinner": {
      "props": {
        "appearance": {
          "type": "string",
          "enum": [
            "primary",
            "inverted"
          ]
        },
        "label": {
          "type": "string"
        },
        "labelPosition": {
          "type": "string",
          "enum": [
            "above",
            "below",
            "before",
            "after"
          ]
        },
        "size": {
          "type": "string",
          "enum": [
            "tiny",
            "extra-small",
            "small",
            "medium",
            "large",
            "huge"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "constraints": [
        "Provide a label when surrounding context does not explain the operation",
        "Remove the spinner when the operation completes"
      ],
      "example": {
        "capability": "fluent:spinner",
        "props": {
          "label": "Loading incident data",
          "variant": "standard"
        }
      }
    },
    "fluent:switch": {
      "props": {
        "value": {
          "type": "string"
        },
        "checked": {
          "type": "boolean"
        },
        "onValue": {
          "type": "string"
        },
        "offValue": {
          "type": "string"
        },
        "label": {
          "type": "string"
        },
        "onLabel": {
          "type": "string"
        },
        "offLabel": {
          "type": "string"
        },
        "disabled": {
          "type": "boolean"
        },
        "ariaLabel": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "toggle": {
          "summary": "The switch changes between its authored values.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "checked",
              "value"
            ],
            "properties": {
              "checked": {
                "type": "boolean"
              },
              "value": {
                "type": "string"
              },
              "name": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Declare stable on and off values",
        "Handle toggle outside the component"
      ],
      "example": {
        "capability": "fluent:switch",
        "props": {
          "value": "auto",
          "onValue": "auto",
          "offValue": "manual",
          "onLabel": "Auto",
          "offLabel": "Manual",
          "variant": "standard"
        }
      }
    },
    "fluent:table": {
      "dataProps": {
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "cells"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "cells": {
                "type": "object",
                "additionalProperties": {
                  "type": [
                    "string",
                    "number",
                    "boolean",
                    "null"
                  ]
                }
              }
            }
          }
        }
      },
      "props": {
        "ariaLabel": {
          "type": "string"
        },
        "columns": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "label"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "label": {
                "type": "string"
              }
            }
          }
        },
        "size": {
          "type": "string",
          "enum": [
            "extra-small",
            "small",
            "medium"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "constraints": [
        "Provide explicit columns",
        "Provide each row as a stable id and cells map"
      ],
      "example": {
        "capability": "fluent:table",
        "props": {
          "ariaLabel": "Incident ownership",
          "columns": [
            {
              "id": "status",
              "label": "Status"
            },
            {
              "id": "owner",
              "label": "Owner"
            }
          ],
          "variant": "standard"
        },
        "bindings": {
          "rows": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:text": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "as": {
          "type": "string",
          "enum": [
            "span",
            "p",
            "div",
            "label",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6"
          ]
        },
        "htmlFor": {
          "type": "string",
          "minLength": 1
        },
        "align": {
          "type": "string",
          "enum": [
            "start",
            "center",
            "end",
            "justify"
          ]
        },
        "block": {
          "type": "boolean"
        },
        "italic": {
          "type": "boolean"
        },
        "truncate": {
          "type": "boolean"
        },
        "underline": {
          "type": "boolean"
        },
        "wrap": {
          "type": "boolean"
        }
      },
      "variants": {
        "body": {
          "summary": "Uses standard body typography.",
          "useWhen": [
            "Text is ordinary prose or a short value"
          ],
          "default": true
        },
        "caption": {
          "summary": "Uses compact supporting typography.",
          "useWhen": [
            "Text annotates or qualifies nearby content"
          ]
        },
        "subtitle": {
          "summary": "Uses emphasized section-support typography.",
          "useWhen": [
            "Text introduces a compact subsection"
          ]
        },
        "title": {
          "summary": "Uses prominent title typography.",
          "useWhen": [
            "Text names a page or major region"
          ]
        },
        "display": {
          "summary": "Uses the largest display typography.",
          "useWhen": [
            "A sparse surface needs one dominant textual signal"
          ]
        }
      },
      "constraints": [
        "Use as to express semantics and variant to express visual hierarchy",
        "Use h1 through h6 according to document structure rather than desired font size",
        "Use label with htmlFor only for a corresponding form control",
        "Do not encode Markdown in value"
      ],
      "example": {
        "capability": "fluent:text",
        "props": {
          "as": "h1",
          "variant": "title",
          "block": true
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:tab-bar": {
      "dataProps": {
        "tabs": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "headerLabel"
            ],
            "properties": {
              "value": {
                "type": "string",
                "minLength": 1
              },
              "headerLabel": {
                "type": "string",
                "minLength": 1
              },
              "disabled": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "props": {
        "active": {
          "type": "string"
        },
        "defaultActive": {
          "type": "string"
        },
        "ariaLabel": {
          "type": "string"
        },
        "disabled": {
          "type": "boolean"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value",
              "label"
            ],
            "properties": {
              "value": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "disabled": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "slots": [
        "panes"
      ],
      "emits": {
        "select": {
          "summary": "The active tab changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Provide stable tab values and headerLabel values",
        "Place one authored child in the panes slot for each tab, in the same order",
        "Prefer local tab state and use defaultActive only to choose the initial tab",
        "Bind active only when application behavior, persistence, or cross-Cell coordination controls the active tab",
        "Handle select only when the application needs to observe or control tab selection"
      ],
      "example": {
        "capability": "fluent:tab-bar",
        "props": {
          "defaultActive": "all",
          "ariaLabel": "Incident views",
          "variant": "standard"
        },
        "bindings": {
          "tabs": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:text-field": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "label": {
          "type": "string"
        },
        "placeholder": {
          "type": "string"
        },
        "required": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "secret": {
          "type": "boolean"
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "input": {
          "summary": "The edited text value changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Use secret only for obscured text entry",
        "Handle input outside the component"
      ],
      "example": {
        "capability": "fluent:text-field",
        "props": {
          "label": "Name",
          "variant": "standard"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:textarea": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "label": {
          "type": "string"
        },
        "placeholder": {
          "type": "string"
        },
        "required": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "rows": {
          "type": "number",
          "minimum": 1
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "input": {
          "summary": "The edited multiline value changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Use rows only when the authored surface requires a specific initial height",
        "Handle input outside the component"
      ],
      "example": {
        "capability": "fluent:textarea",
        "props": {
          "label": "Notes",
          "rows": 4,
          "variant": "standard"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "fluent:toolbar": {
      "props": {
        "ariaLabel": {
          "type": "string"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "vertical": {
          "type": "boolean"
        }
      },
      "slots": [
        "children"
      ],
      "constraints": [
        "Provide ariaLabel",
        "Keep command and control groups concise"
      ],
      "example": {
        "capability": "fluent:toolbar",
        "props": {
          "ariaLabel": "Incident report controls"
        }
      }
    },
    "fluent:toggle": {
      "props": {
        "value": {
          "type": "string"
        },
        "checked": {
          "type": "boolean"
        },
        "onValue": {
          "type": "string"
        },
        "offValue": {
          "type": "string"
        },
        "label": {
          "type": "string"
        },
        "onLabel": {
          "type": "string"
        },
        "offLabel": {
          "type": "string"
        },
        "disabled": {
          "type": "boolean"
        },
        "ariaLabel": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "size": {
          "type": "string",
          "enum": [
            "small",
            "medium",
            "large"
          ]
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses Fluent's standard control sizing.",
          "useWhen": [
            "The control appears in a normal form, panel, or command surface"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses Fluent's native small control sizing.",
          "useWhen": [
            "The control appears in a dense toolbar, table, or constrained surface"
          ]
        }
      },
      "emits": {
        "toggle": {
          "summary": "The pressed state changes between its authored values.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "checked",
              "value"
            ],
            "properties": {
              "checked": {
                "type": "boolean"
              },
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Declare stable on and off values",
        "Handle toggle outside the component"
      ],
      "example": {
        "capability": "fluent:toggle",
        "props": {
          "value": "auto",
          "onValue": "auto",
          "offValue": "manual",
          "onLabel": "Auto",
          "offLabel": "Manual",
          "variant": "standard"
        }
      }
    },
    "primitive:access-gate": {
      "dataProps": {
        "access": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "triggered"
          ],
          "properties": {
            "triggered": {
              "type": "boolean"
            },
            "status": {
              "type": "string",
              "enum": [
                "idle",
                "checking",
                "required",
                "error"
              ]
            },
            "title": {
              "type": "string"
            },
            "message": {
              "type": "string"
            },
            "error": {
              "type": "string"
            },
            "inputFormSpec": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "fields": {
                  "type": "object"
                },
                "schema": {
                  "type": "object"
                },
                "value": {
                  "type": "object"
                },
                "data": {
                  "type": "object"
                },
                "validationContext": {
                  "type": "object"
                },
                "saveLabel": {
                  "type": "string"
                },
                "discardLabel": {
                  "type": "string"
                },
                "initiallyDirty": {
                  "type": "boolean"
                },
                "readOnly": {
                  "type": "boolean"
                },
                "className": {
                  "type": "string"
                },
                "style": {
                  "type": "object",
                  "additionalProperties": {
                    "type": [
                      "string",
                      "number"
                    ]
                  }
                },
                "layout": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "slots": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "key",
                          "slot"
                        ],
                        "properties": {
                          "key": {
                            "type": "string",
                            "minLength": 1
                          },
                          "slot": {
                            "type": "string",
                            "minLength": 1
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "actions": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "retry": {
                  "type": "boolean"
                },
                "retryLabel": {
                  "type": "string"
                },
                "reset": {
                  "type": "boolean"
                },
                "resetLabel": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "slots": [
        "children"
      ],
      "emits": {
        "submit": {
          "summary": "The user submits the authored access fields.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "values"
            ],
            "properties": {
              "values": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "retry": {
          "summary": "The user requests another access check.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {}
          }
        },
        "reset": {
          "summary": "The user requests that access state be reset.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {}
          }
        },
        "dismiss": {
          "summary": "The user dismisses the access prompt without completing the access workflow.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {}
          }
        }
      },
      "constraints": [
        "Resolve authored conditions into access.triggered at the call site",
        "Describe credential fields through inputFormSpec",
        "Handle emitted events with declarative actions or effects",
        "Handle dismiss only when the application needs to react to cancellation",
        "Never place credentials in the trigger expression"
      ],
      "example": {
        "capability": "primitive:access-gate",
        "bindings": {
          "access": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:alert": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "label": {
          "type": "string"
        },
        "level": {
          "type": "string",
          "enum": [
            "good",
            "success",
            "warn",
            "warning",
            "bad",
            "error",
            "info",
            "unknown"
          ]
        }
      },
      "constraints": [
        "Bind message text through value",
        "Use level only for semantic status"
      ],
      "example": {
        "capability": "primitive:alert",
        "props": {
          "label": "Status",
          "level": "info"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:chart": {
      "dataProps": {
        "points": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "summaryValue": {
          "type": [
            "string",
            "number"
          ]
        },
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "fields"
          ],
          "properties": {
            "kind": {
              "enum": [
                "bar",
                "line",
                "pie"
              ]
            },
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "valueSuffix": {
              "type": "string"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "label",
                "value"
              ],
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "value": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "accent",
                  "positive",
                  "negative",
                  "warning",
                  "neutral"
                ]
              }
            },
            "summary": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "label"
              ],
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "prefix": {
                  "type": "string"
                },
                "suffix": {
                  "type": "string"
                }
              }
            },
            "table": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "label",
                "columns"
              ],
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "columns": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "field",
                      "label"
                    ],
                    "properties": {
                      "field": {
                        "type": "string",
                        "minLength": 1
                      },
                      "label": {
                        "type": "string",
                        "minLength": 1
                      },
                      "prefix": {
                        "type": "string"
                      },
                      "suffix": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Full chart with direct value labels where the chart kind supports them.",
          "useWhen": [
            "The chart is a primary analytical surface",
            "Exact values should remain visible"
          ],
          "default": true
        },
        "compact": {
          "summary": "Reduced-height chart without direct value labels.",
          "useWhen": [
            "The chart supports a dashboard summary",
            "Vertical space is constrained"
          ]
        }
      },
      "constraints": [
        "Provide finite non-negative numeric values",
        "Set spec.kind to bar for category comparison, line for ordered trends, or pie for part-to-whole composition",
        "Keep labels short",
        "Map tone values only to recognized chart tokens"
      ],
      "example": {
        "capability": "primitive:chart",
        "props": {
          "variant": "standard",
          "spec": {
            "kind": "line",
            "title": "Risk events by hour",
            "description": "Observed events during the response window",
            "fields": {
              "label": "hour",
              "value": "count",
              "tone": "posture"
            },
            "toneMap": {
              "normal": "accent",
              "elevated": "warning",
              "critical": "negative"
            }
          }
        },
        "bindings": {
          "points": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:collection-board": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "selectedId": {
          "type": "string"
        },
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "columns",
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "columns": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "label"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "label": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "title",
                "column"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "column": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "interaction": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "selection": {
                  "enum": [
                    "none",
                    "single"
                  ]
                },
                "reorder": {
                  "type": "boolean"
                },
                "moveBetweenColumns": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Full board cards with titles, details, and enabled interaction controls.",
          "useWhen": [
            "The board is a primary work surface",
            "Item detail should remain visible"
          ],
          "default": true
        },
        "compact": {
          "summary": "Dense title-only cards with the same interaction contract.",
          "useWhen": [
            "Many cards share the board",
            "Column state matters more than item detail"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "The selected board item changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              }
            }
          }
        },
        "activate": {
          "summary": "The user activates a board item.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              }
            }
          }
        },
        "reorder": {
          "summary": "An item moves within its current column.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId",
              "fromColumnId",
              "toColumnId",
              "fromIndex",
              "toIndex"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              },
              "fromColumnId": {
                "type": "string"
              },
              "toColumnId": {
                "type": "string"
              },
              "fromIndex": {
                "type": "integer"
              },
              "toIndex": {
                "type": "integer"
              }
            }
          }
        },
        "move": {
          "summary": "An item moves to another column.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId",
              "fromColumnId",
              "toColumnId",
              "fromIndex",
              "toIndex"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              },
              "fromColumnId": {
                "type": "string"
              },
              "toColumnId": {
                "type": "string"
              },
              "fromIndex": {
                "type": "integer"
              },
              "toIndex": {
                "type": "integer"
              }
            }
          }
        }
      },
      "constraints": [
        "Provide stable unique item IDs",
        "Declare every referenced column",
        "Use interaction only for mechanics the host handles",
        "Persist emitted move and reorder intents outside the component"
      ],
      "example": {
        "capability": "primitive:collection-board",
        "props": {
          "variant": "standard",
          "spec": {
            "title": "Response work",
            "description": "Operational items grouped by current placement",
            "columns": [
              {
                "id": "planned",
                "label": "Planned"
              },
              {
                "id": "active",
                "label": "Active"
              },
              {
                "id": "complete",
                "label": "Complete"
              }
            ],
            "fields": {
              "id": "id",
              "title": "title",
              "detail": "detail",
              "column": "column",
              "order": "order"
            },
            "interaction": {
              "selection": "single",
              "reorder": true,
              "moveBetweenColumns": true
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:container": {
      "props": {
        "gap": {
          "enum": [
            "none",
            "xs",
            "s",
            "m",
            "l",
            "xl"
          ]
        },
        "align": {
          "enum": [
            "stretch",
            "start",
            "center",
            "end",
            "baseline"
          ]
        },
        "justify": {
          "enum": [
            "start",
            "center",
            "end",
            "space-between",
            "space-around",
            "space-evenly"
          ]
        },
        "wrap": {
          "type": "boolean"
        },
        "direction": {
          "enum": [
            "row",
            "row-reverse",
            "column",
            "column-reverse"
          ]
        },
        "fill": {
          "type": "boolean"
        },
        "grow": {
          "type": "boolean"
        },
        "fullWidth": {
          "type": "boolean"
        },
        "fullHeight": {
          "type": "boolean"
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        }
      },
      "variants": {
        "row": {
          "summary": "Places children horizontally in source order.",
          "useWhen": [
            "Peers belong on one horizontal line"
          ]
        },
        "column": {
          "summary": "Places children vertically in source order.",
          "useWhen": [
            "A page or region flows from top to bottom"
          ],
          "default": true
        },
        "stack": {
          "summary": "Places children in a single-column grid.",
          "useWhen": [
            "Grid sizing should align vertically stacked children"
          ]
        },
        "flex": {
          "summary": "Provides configurable flex direction, alignment, wrapping, and distribution.",
          "useWhen": [
            "Responsive child distribution needs explicit flex controls"
          ]
        }
      },
      "slots": [
        "children"
      ],
      "constraints": [
        "Place composed views in the children slot",
        "Use row or column for ordinary one-axis layouts and flex only when direction or wrapping must be configurable",
        "Use stack for a single-column grid, not for overlapping layers",
        "Use named gap values instead of embedding spacing in child styles",
        "Use fullWidth or fullHeight for axis sizing, grow for flex growth, and fill only when all three behaviors are intended",
        "Do not bind authored data to a container; containers intentionally declare no dataProp"
      ],
      "example": {
        "capability": "primitive:container",
        "props": {
          "variant": "column",
          "gap": "m",
          "fill": true,
          "ariaLabel": "Content region"
        }
      }
    },
    "primitive:datetime": {
      "dataProps": {
        "value": {
          "type": [
            "string",
            "number"
          ]
        }
      },
      "props": {
        "hourFormat": {
          "enum": [
            "24",
            "12"
          ]
        },
        "showSeconds": {
          "type": "boolean"
        },
        "showTimeZone": {
          "type": "boolean"
        }
      },
      "variants": {
        "date": {
          "summary": "Calendar date without a clock time.",
          "useWhen": [
            "The day matters but time-of-day does not"
          ]
        },
        "time": {
          "summary": "Localized clock time without a timezone suffix.",
          "useWhen": [
            "The date is already established by surrounding context"
          ]
        },
        "timestamp": {
          "summary": "Localized calendar date and clock time.",
          "useWhen": [
            "Users need the date and local time of an event"
          ],
          "default": true
        }
      },
      "constraints": [
        "Provide a parseable ISO timestamp or epoch value",
        "Choose date, time, or timestamp according to the surrounding semantic context",
        "Time uses 24-hour format by default; set hourFormat to 12 for locale-appropriate AM/PM output",
        "Time and timestamp omit seconds by default; set showSeconds when second-level precision is meaningful",
        "Formatting follows the browser locale and local timezone; set showTimeZone only when the timezone label is useful"
      ],
      "example": {
        "capability": "primitive:datetime",
        "props": {
          "variant": "timestamp"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:drawer": {
      "props": {
        "open": {
          "type": "boolean"
        },
        "defaultOpen": {
          "type": "boolean"
        },
        "fabPosition": {
          "enum": [
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right"
          ]
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "openLabel": {
          "type": "string",
          "minLength": 1
        },
        "closeLabel": {
          "type": "string",
          "minLength": 1
        },
        "panelWidthPercent": {
          "type": "number",
          "minimum": 20,
          "maximum": 80
        }
      },
      "variants": {
        "panel-vertical": {
          "summary": "Composes a corner-pinned circular toggle with one full-height floating panel.",
          "useWhen": [
            "Secondary tools must overlay a workspace without resizing it"
          ],
          "default": true
        }
      },
      "slots": [
        "children"
      ],
      "emits": {
        "openChange": {
          "summary": "The drawer open state changed; handling this event is optional unless open is controlled.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "open"
            ],
            "properties": {
              "open": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "constraints": [
        "Prefer local drawer state; use defaultOpen only to choose its initial state",
        "Bind open only when application behavior or cross-Cell coordination must control the drawer",
        "Handle openChange only when the application needs to observe or control drawer state",
        "Place all authored children inside the panel",
        "Choose the toggle corner with fabPosition",
        "Provide concise accessible labels"
      ],
      "example": {
        "capability": "primitive:drawer",
        "props": {
          "variant": "panel-vertical",
          "defaultOpen": true,
          "fabPosition": "top-left",
          "title": "Source reports",
          "panelWidthPercent": 80
        }
      }
    },
    "primitive:editable-table": {
      "dataProps": {
        "rows": {
          "type": "array"
        }
      },
      "props": {
        "spec": {
          "type": "object"
        },
        "baseRows": {
          "type": "array"
        },
        "saveLabel": {
          "type": "string"
        },
        "discardLabel": {
          "type": "string"
        },
        "ariaLabel": {
          "type": "string"
        }
      },
      "emits": {
        "save": {
          "summary": "The user commits the edited rows.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "rows"
            ],
            "properties": {
              "rows": {
                "type": "array",
                "items": {
                  "type": "object"
                }
              }
            }
          }
        }
      },
      "constraints": [
        "Declare columns or a property schema when rows may be empty",
        "Handle save payload rows",
        "Keep persistence outside the component"
      ],
      "example": {
        "capability": "primitive:editable-table",
        "props": {
          "spec": {
            "schema": {
              "properties": {
                "name": {
                  "type": "string",
                  "title": "Name"
                },
                "amount": {
                  "type": "number",
                  "title": "Amount"
                }
              }
            }
          }
        },
        "bindings": {
          "rows": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:file-download": {
      "props": {
        "label": {
          "type": "string"
        },
        "filename": {
          "type": "string",
          "minLength": 1
        },
        "content": {
          "type": "string"
        },
        "mediaType": {
          "type": "string"
        },
        "encoding": {
          "enum": [
            "text",
            "base64"
          ]
        },
        "disabled": {
          "type": "boolean"
        }
      },
      "emits": {
        "download": {
          "summary": "The file download was requested.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "filename"
            ],
            "properties": {
              "filename": {
                "type": "string"
              }
            }
          }
        }
      },
      "constraints": [
        "Bind filename and content from committed state",
        "Specify the media type",
        "Use base64 only for binary content"
      ],
      "example": {
        "capability": "primitive:file-download",
        "props": {
          "label": "Download report",
          "filename": "report.txt",
          "content": "Ready",
          "mediaType": "text/plain"
        }
      }
    },
    "primitive:file-input": {
      "props": {
        "label": {
          "type": "string"
        },
        "accept": {
          "type": "string"
        },
        "multiple": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        },
        "readAs": {
          "enum": [
            "metadata",
            "text",
            "base64"
          ]
        }
      },
      "variants": {
        "button": {
          "summary": "Opens a native file picker from a compact button.",
          "useWhen": [
            "File selection is a secondary command"
          ],
          "default": true
        },
        "dropzone": {
          "summary": "Accepts drag-and-drop and click selection.",
          "useWhen": [
            "File acquisition is a primary workflow"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "Files were selected or dropped.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "files"
            ],
            "properties": {
              "files": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "name",
                    "type",
                    "size",
                    "lastModified"
                  ],
                  "properties": {
                    "name": {
                      "type": "string"
                    },
                    "type": {
                      "type": "string"
                    },
                    "size": {
                      "type": "number"
                    },
                    "lastModified": {
                      "type": "number"
                    },
                    "text": {
                      "type": "string"
                    },
                    "content": {
                      "type": "string"
                    },
                    "encoding": {
                      "enum": [
                        "text",
                        "base64"
                      ]
                    }
                  }
                }
              },
              "file": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "name",
                  "type",
                  "size",
                  "lastModified"
                ],
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "type": {
                    "type": "string"
                  },
                  "size": {
                    "type": "number"
                  },
                  "lastModified": {
                    "type": "number"
                  },
                  "text": {
                    "type": "string"
                  },
                  "content": {
                    "type": "string"
                  },
                  "encoding": {
                    "enum": [
                      "text",
                      "base64"
                    ]
                  }
                }
              }
            }
          }
        }
      },
      "constraints": [
        "Use text for textual documents",
        "Use base64 only when binary content must cross the event boundary",
        "Use metadata when content stays browser-owned"
      ],
      "example": {
        "capability": "primitive:file-input",
        "props": {
          "label": "Attach files",
          "multiple": true,
          "variant": "dropzone",
          "readAs": "metadata"
        }
      }
    },
    "primitive:file-list": {
      "dataProps": {
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "required": [
              "name"
            ],
            "properties": {
              "id": {
                "type": [
                  "string",
                  "number"
                ]
              },
              "name": {
                "type": "string"
              },
              "type": {
                "type": "string"
              },
              "size": {
                "type": "number"
              },
              "url": {
                "type": "string"
              }
            }
          }
        }
      },
      "props": {
        "removable": {
          "type": "boolean"
        },
        "emptyText": {
          "type": "string"
        }
      },
      "emits": {
        "select": {
          "summary": "A non-downloadable file was selected.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "index",
              "file"
            ],
            "properties": {
              "index": {
                "type": "integer"
              },
              "file": {
                "type": "object",
                "additionalProperties": true,
                "required": [
                  "name"
                ],
                "properties": {
                  "id": {
                    "type": [
                      "string",
                      "number"
                    ]
                  },
                  "name": {
                    "type": "string"
                  },
                  "type": {
                    "type": "string"
                  },
                  "size": {
                    "type": "number"
                  },
                  "url": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "download": {
          "summary": "A URL-backed file download was requested.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "index",
              "file"
            ],
            "properties": {
              "index": {
                "type": "integer"
              },
              "file": {
                "type": "object",
                "additionalProperties": true,
                "required": [
                  "name"
                ],
                "properties": {
                  "id": {
                    "type": [
                      "string",
                      "number"
                    ]
                  },
                  "name": {
                    "type": "string"
                  },
                  "type": {
                    "type": "string"
                  },
                  "size": {
                    "type": "number"
                  },
                  "url": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "remove": {
          "summary": "A file removal was requested.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "index",
              "file"
            ],
            "properties": {
              "index": {
                "type": "integer"
              },
              "file": {
                "type": "object",
                "additionalProperties": true,
                "required": [
                  "name"
                ],
                "properties": {
                  "id": {
                    "type": [
                      "string",
                      "number"
                    ]
                  },
                  "name": {
                    "type": "string"
                  },
                  "type": {
                    "type": "string"
                  },
                  "size": {
                    "type": "number"
                  },
                  "url": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      },
      "constraints": [
        "Bind JSON-serializable normalized file records",
        "Keep upload and storage effects outside the component",
        "Provide URLs only for host-authorized downloads"
      ],
      "example": {
        "capability": "primitive:file-list",
        "props": {
          "removable": true
        },
        "bindings": {
          "files": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:form": {
      "dataProps": {
        "value": {
          "type": "object"
        }
      },
      "props": {
        "fields": {
          "type": "object"
        },
        "schema": {
          "type": "object"
        },
        "data": {
          "type": "object"
        },
        "validationContext": {
          "type": "object"
        },
        "saveLabel": {
          "type": "string"
        },
        "discardLabel": {
          "type": "string"
        },
        "initiallyDirty": {
          "type": "boolean"
        },
        "readOnly": {
          "type": "boolean"
        }
      },
      "emits": {
        "save": {
          "summary": "The user commits the edited form values.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "values"
            ],
            "properties": {
              "values": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        }
      },
      "constraints": [
        "Define fields through JSON Schema properties",
        "Handle save payload values",
        "Use readOnly for inspect-only forms",
        "Pass external validator bindings through validationContext",
        "Use initiallyDirty only for drafts not yet persisted",
        "Keep workflow effects outside the component"
      ],
      "notes": [
        "Editing is draft-based; values are published only through save."
      ],
      "example": {
        "capability": "primitive:form",
        "props": {
          "fields": {
            "properties": {
              "name": {
                "type": "string",
                "title": "Name"
              },
              "active": {
                "type": "boolean",
                "title": "Active"
              }
            },
            "required": [
              "name"
            ]
          }
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:gantt": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "scale": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind"
              ],
              "properties": {
                "kind": {
                  "enum": [
                    "datetime",
                    "linear"
                  ]
                },
                "hourFormat": {
                  "enum": [
                    "24",
                    "12"
                  ]
                },
                "displayPrefix": {
                  "type": "string"
                },
                "minimum": {
                  "type": "number"
                },
                "maximum": {
                  "type": "number"
                },
                "tickStep": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "showSeconds": {
                  "type": "boolean"
                },
                "showTimeZone": {
                  "type": "boolean"
                }
              }
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label",
                "start",
                "end"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "start": {
                  "type": "string",
                  "minLength": 1
                },
                "end": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Full labels, details, timestamps, and interval tracks.",
          "useWhen": [
            "The Gantt is a primary temporal comparison",
            "Interval context should remain visible"
          ],
          "default": true
        },
        "compact": {
          "summary": "Reduced-height tracks and labels without details.",
          "useWhen": [
            "The Gantt is embedded in a dense supporting surface",
            "Users primarily compare timing and duration"
          ]
        }
      },
      "constraints": [
        "Provide unique stable ids",
        "Use datetime for actual timestamps and numeric linear coordinates for logical order or progress",
        "Use displayPrefix only to format linear coordinates, such as showing 1 as T1",
        "Set a positive tickStep in milliseconds for datetime or coordinate units for linear when the scale should show shared column markers",
        "Ensure each end is not earlier than its start",
        "Use one consistent scale across all intervals"
      ],
      "example": {
        "capability": "primitive:gantt",
        "props": {
          "variant": "standard",
          "spec": {
            "title": "Attack activity",
            "description": "Observed relationship intervals",
            "fields": {
              "id": "id",
              "label": "label",
              "detail": "detail",
              "start": "start",
              "end": "end"
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:graph-diagram": {
      "dataProps": {
        "graph": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "nodes",
            "edges"
          ],
          "properties": {
            "nodes": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "label"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "label": {
                    "type": "string",
                    "minLength": 1
                  },
                  "detail": {
                    "type": "string"
                  },
                  "category": {
                    "type": "string"
                  },
                  "tone": {
                    "enum": [
                      "accent",
                      "danger",
                      "warning",
                      "success",
                      "neutral"
                    ]
                  }
                }
              }
            },
            "edges": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "source",
                  "target"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "source": {
                    "type": "string",
                    "minLength": 1
                  },
                  "target": {
                    "type": "string",
                    "minLength": 1
                  },
                  "label": {
                    "type": "string"
                  },
                  "directed": {
                    "type": "boolean"
                  }
                }
              }
            }
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "layout": {
              "enum": [
                "radial",
                "hierarchical"
              ]
            },
            "interaction": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "pan": {
                  "type": "boolean"
                },
                "zoom": {
                  "type": "boolean"
                },
                "selection": {
                  "type": "boolean"
                }
              }
            }
          }
        },
        "stateKey": {
          "type": "string",
          "minLength": 1
        },
        "canvasState": {
          "type": [
            "object",
            "null"
          ]
        },
        "height": {
          "type": [
            "number",
            "string"
          ]
        },
        "miniMap": {
          "type": "boolean"
        },
        "controls": {
          "type": "boolean"
        },
        "background": {
          "type": "boolean"
        }
      },
      "variants": {
        "diagram": {
          "summary": "Static node-edge diagram.",
          "useWhen": [
            "Topology should be inspected without canvas interaction"
          ],
          "default": true
        },
        "canvas": {
          "summary": "Interactive pan-and-zoom graph canvas.",
          "useWhen": [
            "Users need to explore or reposition a larger graph"
          ]
        }
      },
      "emits": {
        "node": {
          "summary": "The user selects a canvas node.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "edge": {
          "summary": "The user selects a derived canvas edge.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "layout": {
          "summary": "The canvas commits its current viewport and node positions.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        }
      },
      "constraints": [
        "Provide stable unique node and edge IDs",
        "Reference only declared node IDs",
        "Assign semantic meaning before lowering into this primitive"
      ],
      "example": {
        "capability": "primitive:graph-diagram",
        "props": {
          "variant": "diagram",
          "spec": {
            "title": "Graph diagram",
            "layout": "radial"
          }
        },
        "bindings": {
          "graph": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:growing-container": {
      "props": {
        "followEnd": {
          "enum": [
            "always",
            "when-at-end",
            "off"
          ]
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        }
      },
      "slots": [
        "children"
      ],
      "constraints": [
        "Place rendered content in the children slot",
        "Use always for output surfaces that must stay at the newest content",
        "Use when-at-end when users must be able to scroll back without being pulled to the end",
        "Use off when the viewport must never move automatically",
        "Provide ariaLabel when the scrolling region needs an accessible name"
      ],
      "example": {
        "capability": "primitive:growing-container",
        "props": {
          "followEnd": "when-at-end",
          "ariaLabel": "Streaming output"
        }
      }
    },
    "primitive:infinite-canvas": {
      "dataProps": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "title"
            ],
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1
              },
              "title": {
                "type": "string",
                "minLength": 1
              },
              "detail": {
                "type": "string"
              },
              "eyebrow": {
                "type": "string"
              },
              "tone": {
                "enum": [
                  "accent",
                  "danger",
                  "warning",
                  "success",
                  "neutral"
                ]
              },
              "width": {
                "type": "number",
                "minimum": 120,
                "maximum": 640
              },
              "draggable": {
                "type": "boolean"
              }
            }
          }
        }
      },
      "props": {
        "stateKey": {
          "type": "string",
          "minLength": 1
        },
        "nodePorts": {
          "type": "object",
          "additionalProperties": {
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "properties": {
              "top": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "token"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "token": {
                      "type": "string",
                      "minLength": 1
                    },
                    "label": {
                      "type": "string"
                    },
                    "selected": {
                      "type": "boolean"
                    },
                    "highlighted": {
                      "type": "boolean"
                    },
                    "dimmed": {
                      "type": "boolean"
                    },
                    "running": {
                      "type": "boolean"
                    }
                  }
                }
              },
              "bottom": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "token"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "token": {
                      "type": "string",
                      "minLength": 1
                    },
                    "label": {
                      "type": "string"
                    },
                    "selected": {
                      "type": "boolean"
                    },
                    "highlighted": {
                      "type": "boolean"
                    },
                    "dimmed": {
                      "type": "boolean"
                    },
                    "running": {
                      "type": "boolean"
                    }
                  }
                }
              },
              "left": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "token"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "token": {
                      "type": "string",
                      "minLength": 1
                    },
                    "label": {
                      "type": "string"
                    },
                    "selected": {
                      "type": "boolean"
                    },
                    "highlighted": {
                      "type": "boolean"
                    },
                    "dimmed": {
                      "type": "boolean"
                    },
                    "running": {
                      "type": "boolean"
                    }
                  }
                }
              },
              "right": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "token"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1
                    },
                    "token": {
                      "type": "string",
                      "minLength": 1
                    },
                    "label": {
                      "type": "string"
                    },
                    "selected": {
                      "type": "boolean"
                    },
                    "highlighted": {
                      "type": "boolean"
                    },
                    "dimmed": {
                      "type": "boolean"
                    },
                    "running": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          }
        },
        "canvasState": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "properties": {
            "v": {
              "type": "number"
            },
            "viewport": {
              "type": [
                "object",
                "null"
              ],
              "additionalProperties": false,
              "required": [
                "x",
                "y",
                "zoom"
              ],
              "properties": {
                "x": {
                  "type": "number"
                },
                "y": {
                  "type": "number"
                },
                "zoom": {
                  "type": "number"
                }
              }
            },
            "nodes": {
              "type": "object",
              "additionalProperties": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "x",
                  "y"
                ],
                "properties": {
                  "x": {
                    "type": "number"
                  },
                  "y": {
                    "type": "number"
                  }
                }
              }
            }
          }
        },
        "height": {
          "type": [
            "number",
            "string"
          ]
        },
        "minZoom": {
          "type": "number",
          "exclusiveMinimum": 0
        },
        "maxZoom": {
          "type": "number",
          "exclusiveMinimum": 0
        },
        "miniMap": {
          "type": "boolean"
        },
        "controls": {
          "type": "boolean"
        },
        "background": {
          "type": "boolean"
        },
        "panOnScroll": {
          "type": "boolean"
        },
        "selectionOnDrag": {
          "type": "boolean"
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        }
      },
      "variants": {
        "standard": {
          "summary": "Full node cards with eyebrow, title, and detail.",
          "useWhen": [
            "The graph is a primary exploratory surface",
            "Node detail should remain visible"
          ],
          "default": true
        },
        "compact": {
          "summary": "Compact cards with eyebrow and title.",
          "useWhen": [
            "The graph contains many nodes",
            "Labels matter more than prose detail"
          ]
        },
        "minimal": {
          "summary": "Small title-only cards.",
          "useWhen": [
            "Topology is the primary information",
            "The canvas must accommodate a dense graph"
          ]
        }
      },
      "emits": {
        "node": {
          "summary": "The user selects a canvas node.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "edge": {
          "summary": "The user selects a derived canvas edge.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "layout": {
          "summary": "The canvas commits its current viewport and node positions.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        }
      },
      "constraints": [
        "Provide unique stable node ids",
        "Declare input ports on left or top and output ports on right or bottom",
        "Use one shared token for each intended source-target connection",
        "Do not author an explicit edge array",
        "Persist layout events back into canvasState when layout continuity is required"
      ],
      "example": {
        "capability": "primitive:infinite-canvas",
        "props": {
          "stateKey": "infinite-canvas-trial",
          "variant": "standard",
          "height": 420,
          "controls": true,
          "nodePorts": {
            "source": {
              "right": [
                {
                  "id": "access:source",
                  "token": "relationship:access",
                  "label": "accessed"
                }
              ]
            },
            "target": {
              "left": [
                {
                  "id": "access:target",
                  "token": "relationship:access",
                  "label": "accessed"
                }
              ]
            }
          }
        },
        "bindings": {
          "nodes": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:math-challenge": {
      "dataProps": {
        "message": {
          "type": "string"
        }
      },
      "props": {
        "operandA": {
          "type": "number"
        },
        "operandB": {
          "type": "number"
        },
        "title": {
          "type": "string"
        },
        "cancelLabel": {
          "type": "string"
        },
        "confirmLabel": {
          "type": "string"
        }
      },
      "emits": {
        "confirm": {
          "summary": "The user solves the challenge and confirms the action.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {}
          }
        },
        "cancel": {
          "summary": "The user cancels the challenge.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "reason"
            ],
            "properties": {
              "reason": {
                "enum": [
                  "escape",
                  "button"
                ]
              }
            }
          }
        }
      },
      "constraints": [
        "Handle both confirm and cancel",
        "Explain the destructive consequence in message",
        "Do not use as authentication"
      ],
      "example": {
        "capability": "primitive:math-challenge",
        "props": {
          "title": "Delete Blueprint",
          "operandA": 3,
          "operandB": 7
        },
        "bindings": {
          "message": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:markdown": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "constraints": [
        "Bind Markdown through value",
        "Do not pass HTML as a substitute for Markdown",
        "Use fenced mermaid blocks for diagrams"
      ],
      "example": {
        "capability": "primitive:markdown",
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:metric": {
      "dataProps": {
        "value": {
          "type": [
            "string",
            "number"
          ]
        }
      },
      "props": {
        "label": {
          "type": "string"
        }
      },
      "constraints": [
        "Provide a concise label",
        "Bind the scalar through value"
      ],
      "example": {
        "capability": "primitive:metric",
        "props": {
          "label": "Coverage"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:note": {
      "dataProps": {
        "value": {
          "type": "string"
        }
      },
      "props": {
        "tone": {
          "type": "string",
          "enum": [
            "muted",
            "info",
            "warning",
            "danger",
            "success"
          ]
        }
      },
      "constraints": [
        "Bind text through value",
        "Use tone only for semantic status"
      ],
      "example": {
        "capability": "primitive:note",
        "props": {
          "tone": "success"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:property": {
      "dataProps": {
        "value": {
          "type": [
            "string",
            "number",
            "boolean"
          ]
        }
      },
      "props": {
        "label": {
          "type": "string"
        }
      },
      "constraints": [
        "Keep values concise",
        "Bind the attribute through value"
      ],
      "example": {
        "capability": "primitive:property",
        "props": {
          "label": "Version"
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:source-viewer": {
      "dataProps": {
        "lines": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "fields"
          ],
          "properties": {
            "kind": {
              "enum": [
                "source",
                "unified-diff",
                "split-diff"
              ]
            },
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "sourceLabel": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "wrap": {
              "type": "boolean"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "number": {
                  "type": "string",
                  "minLength": 1
                },
                "text": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeText": {
                  "type": "string",
                  "minLength": 1
                },
                "afterNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "afterText": {
                  "type": "string",
                  "minLength": 1
                },
                "annotation": {
                  "type": "string",
                  "minLength": 1
                },
                "change": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          }
        }
      },
      "variants": {
        "standard": {
          "summary": "Full source rows with optional annotations.",
          "useWhen": [
            "Source inspection is a primary surface",
            "Line annotations should remain visible"
          ],
          "default": true
        },
        "compact": {
          "summary": "Dense source rows without annotation details.",
          "useWhen": [
            "Source supports another primary result",
            "Horizontal space is constrained"
          ]
        }
      },
      "constraints": [
        "Choose source, unified-diff, or split-diff through spec.kind",
        "Supply precomputed aligned diff rows",
        "Use variant only for density",
        "Preserve source text exactly"
      ],
      "example": {
        "capability": "primitive:source-viewer",
        "props": {
          "variant": "standard",
          "spec": {
            "kind": "split-diff",
            "title": "Containment policy change",
            "language": "TypeScript",
            "sourceLabel": "policies/containment.ts",
            "fields": {
              "id": "id",
              "beforeNumber": "beforeLine",
              "beforeText": "before",
              "afterNumber": "afterLine",
              "afterText": "after",
              "change": "change",
              "annotation": "note"
            }
          }
        },
        "bindings": {
          "lines": {
            "from": "<state-path>"
          }
        }
      }
    },
    "primitive:timer-button": {
      "props": {
        "label": {
          "type": "string",
          "minLength": 1
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        },
        "durationMs": {
          "type": "number",
          "minimum": 0
        },
        "autoDurationMs": {
          "type": "number",
          "minimum": 0
        },
        "manualDurationMs": {
          "type": "number",
          "minimum": 0
        },
        "defaultPace": {
          "enum": [
            "manual",
            "auto"
          ]
        },
        "autoStart": {
          "type": "boolean"
        },
        "repeat": {
          "type": "boolean"
        },
        "showCountdown": {
          "type": "boolean"
        },
        "showPaceSwitch": {
          "type": "boolean"
        },
        "disabled": {
          "type": "boolean"
        },
        "resetKey": {
          "type": [
            "string",
            "number",
            "boolean",
            "null"
          ]
        },
        "appearance": {
          "enum": [
            "primary",
            "secondary",
            "outline",
            "subtle",
            "transparent"
          ]
        },
        "size": {
          "enum": [
            "small",
            "medium",
            "large"
          ]
        },
        "paceAriaLabel": {
          "type": "string",
          "minLength": 1
        },
        "autoLabel": {
          "type": "string",
          "minLength": 1
        },
        "manualLabel": {
          "type": "string",
          "minLength": 1
        }
      },
      "variants": {
        "standard": {
          "summary": "Supports manual or automatic pace, with an optional user-facing pace switch.",
          "useWhen": [
            "The authored flow may use manual pace or let the user choose between manual and automatic pace"
          ],
          "default": true
        },
        "auto-only": {
          "summary": "Always runs in automatic pace and never displays the manual/auto switch.",
          "useWhen": [
            "The action must trigger automatically without exposing manual versus automatic pace controls"
          ]
        }
      },
      "emits": {
        "press": {
          "summary": "The button invokes manually or when its countdown elapses.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "reason"
            ],
            "properties": {
              "reason": {
                "enum": [
                  "manual",
                  "timeout"
                ]
              }
            }
          }
        }
      },
      "constraints": [
        "Handle press payload reason as manual or timeout",
        "Set showPaceSwitch only when the user should control manual versus auto behavior",
        "Use auto-only when the action must always run in automatic pace without exposing pace controls",
        "Set repeat only when every elapsed interval should trigger another press",
        "Use resetKey to restart the countdown when external progress changes",
        "Keep durable scheduling and domain workflow state outside the projection component"
      ],
      "example": {
        "capability": "primitive:timer-button",
        "props": {
          "label": "Continue",
          "variant": "standard",
          "durationMs": 5000,
          "defaultPace": "auto",
          "showCountdown": true,
          "showPaceSwitch": true
        }
      }
    },
    "primitive:todo-list": {
      "dataProps": {
        "value": {
          "type": "object",
          "additionalProperties": {
            "type": "boolean"
          }
        }
      },
      "props": {
        "fields": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "properties"
          ],
          "properties": {
            "properties": {
              "type": "object",
              "additionalProperties": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "type",
                  "title"
                ],
                "properties": {
                  "type": {
                    "const": "boolean"
                  },
                  "title": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  },
                  "hint": {
                    "type": "string"
                  },
                  "readOnly": {
                    "type": "boolean"
                  },
                  "disabled": {
                    "type": "boolean"
                  }
                }
              }
            }
          }
        },
        "ariaLabel": {
          "type": "string"
        },
        "emptyText": {
          "type": "string"
        }
      },
      "variants": {
        "standard": {
          "summary": "Uses standard Fluent control sizing.",
          "useWhen": [
            "The todo editor appears in a normal panel or form"
          ],
          "default": true
        },
        "compact": {
          "summary": "Uses native compact Fluent control sizing.",
          "useWhen": [
            "The todo editor appears in a dense or constrained surface"
          ]
        }
      },
      "emits": {
        "save": {
          "summary": "A todo change commits the complete next values object.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "values"
            ],
            "properties": {
              "values": {
                "type": "object",
                "additionalProperties": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "constraints": [
        "Define every field as a titled boolean property",
        "Provide values as a keyed boolean object",
        "Handle each save payload values object as the complete next value",
        "Keep persistence outside the component"
      ],
      "example": {
        "capability": "primitive:todo-list",
        "props": {
          "variant": "standard",
          "fields": {
            "properties": {
              "shipComponent": {
                "type": "boolean",
                "title": "Ship the component"
              },
              "publishDocs": {
                "type": "boolean",
                "title": "Publish the docs"
              }
            }
          }
        },
        "bindings": {
          "value": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:argument": {
      "dataProps": {
        "argument": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "claims",
            "relations"
          ],
          "properties": {
            "claims": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "statement",
                  "role"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "statement": {
                    "type": "string",
                    "minLength": 1
                  },
                  "detail": {
                    "type": "string"
                  },
                  "role": {
                    "enum": [
                      "conclusion",
                      "premise",
                      "evidence",
                      "objection"
                    ]
                  }
                }
              }
            },
            "relations": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "id",
                  "source",
                  "target",
                  "kind"
                ],
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "source": {
                    "type": "string",
                    "minLength": 1
                  },
                  "target": {
                    "type": "string",
                    "minLength": 1
                  },
                  "kind": {
                    "enum": [
                      "supports",
                      "opposes",
                      "qualifies"
                    ]
                  }
                }
              }
            }
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "map": {
          "summary": "Directed claim and inference topology.",
          "useWhen": [
            "Inferential structure is primary"
          ],
          "default": true
        },
        "outline": {
          "summary": "Claim cards with their outgoing reasoning links.",
          "useWhen": [
            "Claims and supporting detail need close reading"
          ]
        },
        "text": {
          "summary": "Complete linear claims and inference statements.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "constraints": [
        "Use conclusion, premise, evidence, and objection only as authored claim roles",
        "Every relation must reference declared claim IDs",
        "Do not infer omitted links or collapse disagreement into opposition",
        "All variants preserve every claim and relation"
      ],
      "notes": [
        "Relations express authored inference, not merely visual connectivity."
      ],
      "example": {
        "capability": "semantic:argument",
        "props": {
          "variant": "map",
          "spec": {
            "title": "Containment argument",
            "description": "Authored reasoning behind the recommended response",
            "density": "comfortable"
          }
        },
        "bindings": {
          "argument": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:measure-set": {
      "dataProps": {
        "measures": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label",
                "value"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "value": {
                  "type": "string",
                  "minLength": 1
                },
                "unit": {
                  "type": "string",
                  "minLength": 1
                },
                "baseline": {
                  "type": "string",
                  "minLength": 1
                },
                "delta": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "positive",
                  "negative",
                  "warning",
                  "neutral",
                  "unknown"
                ]
              }
            }
          }
        }
      },
      "variants": {
        "tiles": {
          "summary": "Prominent measure tiles for rapid scanning.",
          "useWhen": [
            "A small measure set is a primary result"
          ],
          "default": true
        },
        "table": {
          "summary": "Aligned values, baselines, and deltas.",
          "useWhen": [
            "Exact cross-measure comparison matters"
          ]
        },
        "ranking": {
          "summary": "Authored measure order with explicit ordinal positions.",
          "useWhen": [
            "The supplied order communicates rank"
          ]
        },
        "text": {
          "summary": "Complete textual measure projection.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "constraints": [
        "All variants consume the same measures",
        "Ranking uses authored order and never infers importance",
        "Put density in spec"
      ],
      "example": {
        "capability": "semantic:measure-set",
        "props": {
          "variant": "tiles",
          "spec": {
            "title": "Incident measures",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "label": "label",
              "value": "value",
              "unit": "unit",
              "baseline": "baseline",
              "delta": "delta",
              "order": "order",
              "tone": "direction"
            },
            "toneMap": {
              "adverse": "negative",
              "favorable": "positive"
            }
          }
        },
        "bindings": {
          "measures": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:milestones": {
      "dataProps": {
        "milestones": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "title",
                "timestamp"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "timestamp": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "status": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "scale": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind"
              ],
              "properties": {
                "kind": {
                  "enum": [
                    "datetime",
                    "linear"
                  ]
                },
                "hourFormat": {
                  "enum": [
                    "24",
                    "12"
                  ]
                },
                "displayPrefix": {
                  "type": "string"
                },
                "minimum": {
                  "type": "number"
                },
                "maximum": {
                  "type": "number"
                },
                "tickStep": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "showSeconds": {
                  "type": "boolean"
                },
                "showTimeZone": {
                  "type": "boolean"
                }
              }
            },
            "sort": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "direction"
              ],
              "properties": {
                "direction": {
                  "enum": [
                    "ascending",
                    "descending",
                    "none"
                  ]
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "achieved",
                  "current",
                  "upcoming",
                  "blocked",
                  "unknown"
                ]
              }
            }
          }
        }
      },
      "variants": {
        "rail": {
          "summary": "Vertical milestone progression with diamond checkpoints.",
          "useWhen": [
            "Ordered checkpoint progress should be rapidly scannable"
          ],
          "default": true
        },
        "timeline": {
          "summary": "Dated vertical milestone chronology.",
          "useWhen": [
            "Milestone dates are the primary reading path"
          ]
        },
        "list": {
          "summary": "Compact milestone records with date and state.",
          "useWhen": [
            "Precise record scanning matters more than progression"
          ]
        },
        "axis": {
          "summary": "Scaled horizontal milestone axis.",
          "useWhen": [
            "Temporal spacing between milestones matters"
          ]
        },
        "text": {
          "summary": "Complete linear milestone projection.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "constraints": [
        "All variants consume the same milestones",
        "Use authored order for rail and list when supplied",
        "Never infer milestone achievement from dates",
        "Put density and scale in spec"
      ],
      "example": {
        "capability": "semantic:milestones",
        "props": {
          "variant": "rail",
          "spec": {
            "title": "Release milestones",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "title": "title",
              "detail": "detail",
              "timestamp": "at",
              "order": "order",
              "status": "state"
            },
            "scale": {
              "kind": "datetime"
            },
            "sort": {
              "direction": "ascending"
            },
            "toneMap": {
              "done": "achieved",
              "active": "current",
              "next": "upcoming"
            }
          }
        },
        "bindings": {
          "milestones": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:narrative": {
      "dataProps": {
        "sections": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "heading",
                "body"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "heading": {
                  "type": "string",
                  "minLength": 1
                },
                "body": {
                  "type": "string",
                  "minLength": 1
                },
                "parent": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                },
                "role": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "primary",
                  "supporting",
                  "caution",
                  "critical",
                  "neutral"
                ]
              }
            }
          }
        }
      },
      "variants": {
        "article": {
          "summary": "Continuous editorial reading flow.",
          "useWhen": [
            "Narrative reading is primary"
          ],
          "default": true
        },
        "outline": {
          "summary": "Authored section hierarchy with complete section bodies.",
          "useWhen": [
            "Structure and parentage should be visible"
          ]
        },
        "briefing": {
          "summary": "Compact operational section composition.",
          "useWhen": [
            "Readers need rapid section scanning"
          ]
        },
        "text": {
          "summary": "Complete linear textual projection.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "constraints": [
        "All variants consume and preserve the same sections",
        "Outline depth comes only from authored parent links",
        "Briefing never summarizes or omits content",
        "Put density in spec"
      ],
      "example": {
        "capability": "semantic:narrative",
        "props": {
          "variant": "article",
          "spec": {
            "title": "Incident narrative",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "heading": "heading",
              "body": "body",
              "parent": "parentId",
              "order": "order",
              "role": "role",
              "tone": "tone"
            },
            "toneMap": {
              "primary": "primary",
              "supporting": "supporting"
            }
          }
        },
        "bindings": {
          "sections": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:relationship-set": {
      "dataProps": {
        "graph": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "entities",
            "relationships"
          ],
          "properties": {
            "entities": {
              "type": "array",
              "items": {
                "type": "object"
              }
            },
            "relationships": {
              "type": "array",
              "items": {
                "type": "object"
              }
            }
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "entityFields",
            "relationshipFields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            },
            "entityFields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "relationshipFields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "source",
                "target"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "source": {
                  "type": "string",
                  "minLength": 1
                },
                "target": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "central",
                  "related",
                  "risk",
                  "positive",
                  "neutral"
                ]
              }
            }
          }
        }
      },
      "variants": {
        "network": {
          "summary": "Node-link topology projection.",
          "useWhen": [
            "Topology and connected structure are primary"
          ],
          "default": true
        },
        "matrix": {
          "summary": "Pairwise entity relationship matrix.",
          "useWhen": [
            "Dense pairwise inspection matters"
          ]
        },
        "relations": {
          "summary": "Readable source-predicate-target statements.",
          "useWhen": [
            "Precise relationship reading matters"
          ]
        },
        "text": {
          "summary": "Complete linear relationship statements.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "constraints": [
        "All variants consume the same entities and relationships",
        "Reference only declared entity IDs",
        "Matrix cells and network edges are derived without changing relationships",
        "Put density in spec"
      ],
      "example": {
        "capability": "semantic:relationship-set",
        "props": {
          "variant": "network",
          "spec": {
            "title": "Incident relationships",
            "description": "Entities linked by observed activity",
            "density": "comfortable",
            "entityFields": {
              "id": "id",
              "label": "label",
              "detail": "detail",
              "tone": "role"
            },
            "relationshipFields": {
              "id": "id",
              "source": "from",
              "target": "to",
              "label": "relation"
            },
            "toneMap": {
              "focus": "central",
              "risk": "risk",
              "related": "related"
            }
          }
        },
        "bindings": {
          "graph": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:work-set": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "selectedId": {
          "type": "string"
        },
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields",
            "groups"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "title",
                "group"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "group": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "groups": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "value",
                  "label"
                ],
                "properties": {
                  "value": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  }
                }
              }
            },
            "interaction": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "selection": {
                  "enum": [
                    "none",
                    "single"
                  ]
                },
                "reorder": {
                  "type": "boolean"
                },
                "moveBetweenGroups": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "variants": {
        "board": {
          "summary": "Work grouped into parallel declared columns.",
          "useWhen": [
            "Placement across groups matters"
          ],
          "default": true
        },
        "queue": {
          "summary": "Ordered work from the first declared active group.",
          "useWhen": [
            "Users should focus on the next actionable records"
          ]
        },
        "list": {
          "summary": "A linear scan of all work records.",
          "useWhen": [
            "Cross-group comparison is secondary"
          ]
        },
        "text": {
          "summary": "Accessible textual work summary.",
          "useWhen": [
            "Visual layout is unavailable or inappropriate"
          ]
        }
      },
      "emits": {
        "select": {
          "summary": "The selected board item changes.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              }
            }
          }
        },
        "activate": {
          "summary": "The user activates a board item.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              }
            }
          }
        },
        "reorder": {
          "summary": "An item moves within its current column.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId",
              "fromColumnId",
              "toColumnId",
              "fromIndex",
              "toIndex"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              },
              "fromColumnId": {
                "type": "string"
              },
              "toColumnId": {
                "type": "string"
              },
              "fromIndex": {
                "type": "integer"
              },
              "toIndex": {
                "type": "integer"
              }
            }
          }
        },
        "move": {
          "summary": "An item moves to another column.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "itemId",
              "fromColumnId",
              "toColumnId",
              "fromIndex",
              "toIndex"
            ],
            "properties": {
              "itemId": {
                "type": "string"
              },
              "fromColumnId": {
                "type": "string"
              },
              "toColumnId": {
                "type": "string"
              },
              "fromIndex": {
                "type": "integer"
              },
              "toIndex": {
                "type": "integer"
              }
            }
          }
        }
      },
      "constraints": [
        "Use variant for the actual representation",
        "Put density and interaction configuration in spec",
        "Persist emitted movement intents outside the component"
      ],
      "example": {
        "capability": "semantic:work-set",
        "props": {
          "variant": "board",
          "spec": {
            "title": "Response work",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "title": "title",
              "detail": "detail",
              "group": "group",
              "order": "order"
            },
            "groups": [
              {
                "value": "active",
                "label": "Active"
              }
            ],
            "interaction": {
              "selection": "single",
              "reorder": true
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:event-series": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "scale": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind"
              ],
              "properties": {
                "kind": {
                  "enum": [
                    "datetime",
                    "linear"
                  ]
                },
                "hourFormat": {
                  "enum": [
                    "24",
                    "12"
                  ]
                },
                "displayPrefix": {
                  "type": "string"
                },
                "minimum": {
                  "type": "number"
                },
                "maximum": {
                  "type": "number"
                },
                "tickStep": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "showSeconds": {
                  "type": "boolean"
                },
                "showTimeZone": {
                  "type": "boolean"
                }
              }
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "title",
                "timestamp"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "timestamp": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "status": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "sort": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "direction"
              ],
              "properties": {
                "direction": {
                  "enum": [
                    "ascending",
                    "descending",
                    "none"
                  ]
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "past",
                  "current",
                  "upcoming",
                  "blocked",
                  "unknown"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "chronology": {
          "summary": "chronology presentation.",
          "useWhen": [
            "The chronology presentation best matches the authored intent"
          ],
          "default": true
        },
        "axis": {
          "summary": "axis presentation.",
          "useWhen": [
            "The axis presentation best matches the authored intent"
          ]
        },
        "text": {
          "summary": "text presentation.",
          "useWhen": [
            "The text presentation best matches the authored intent"
          ]
        }
      },
      "constraints": [
        "Map stable identity, title, and timestamp fields",
        "Put density and scale configuration in spec"
      ],
      "example": {
        "capability": "semantic:event-series",
        "props": {
          "variant": "chronology",
          "spec": {
            "title": "Investigation timeline",
            "description": "Ordered operational events",
            "density": "comfortable",
            "fields": {
              "id": "eventKey",
              "title": "title",
              "timestamp": "at",
              "detail": "detail",
              "status": "state"
            },
            "scale": {
              "kind": "datetime"
            },
            "sort": {
              "direction": "ascending"
            },
            "toneMap": {
              "resolved": "past",
              "active": "current"
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:process": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "orientation": {
              "enum": [
                "horizontal",
                "vertical"
              ]
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "title"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "order": {
                  "type": "string",
                  "minLength": 1
                },
                "status": {
                  "type": "string",
                  "minLength": 1
                },
                "reference": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "complete",
                  "current",
                  "upcoming",
                  "blocked",
                  "skipped",
                  "unknown"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "flow": {
          "summary": "flow presentation.",
          "useWhen": [
            "The flow presentation best matches the authored intent"
          ],
          "default": true
        },
        "stages": {
          "summary": "stages presentation.",
          "useWhen": [
            "The stages presentation best matches the authored intent"
          ]
        },
        "text": {
          "summary": "text presentation.",
          "useWhen": [
            "The text presentation best matches the authored intent"
          ]
        }
      },
      "constraints": [
        "Use the existing sequence field and orientation contract",
        "Put density and orientation in spec"
      ],
      "example": {
        "capability": "semantic:process",
        "props": {
          "variant": "flow",
          "spec": {
            "title": "Response process",
            "density": "comfortable",
            "orientation": "horizontal",
            "fields": {
              "id": "key",
              "title": "label",
              "order": "order",
              "detail": "detail",
              "status": "state"
            },
            "toneMap": {
              "done": "complete",
              "active": "current"
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:entity-set": {
      "dataProps": {
        "items": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "status": {
                  "type": "string",
                  "minLength": 1
                },
                "group": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "groups": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "value",
                  "label"
                ],
                "properties": {
                  "value": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  }
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "affected",
                  "at-risk",
                  "observed",
                  "positive",
                  "unknown"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "clusters": {
          "summary": "clusters presentation.",
          "useWhen": [
            "The clusters presentation best matches the authored intent"
          ],
          "default": true
        },
        "matrix": {
          "summary": "matrix presentation.",
          "useWhen": [
            "The matrix presentation best matches the authored intent"
          ]
        },
        "list": {
          "summary": "list presentation.",
          "useWhen": [
            "The list presentation best matches the authored intent"
          ]
        },
        "text": {
          "summary": "text presentation.",
          "useWhen": [
            "The text presentation best matches the authored intent"
          ]
        }
      },
      "constraints": [
        "Use clusters only when grouping is meaningful",
        "Use mapped fields for matrix, list, and text projections"
      ],
      "example": {
        "capability": "semantic:entity-set",
        "props": {
          "variant": "clusters",
          "spec": {
            "title": "Entity set",
            "density": "comfortable",
            "fields": {
              "id": "key",
              "label": "name",
              "type": "kind",
              "status": "condition",
              "group": "group",
              "description": "detail"
            },
            "groups": [
              {
                "value": "impacted",
                "label": "Impacted"
              }
            ],
            "toneMap": {
              "compromised": "affected"
            }
          }
        },
        "bindings": {
          "items": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:evidence-case": {
      "dataProps": {
        "evidence": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "title",
                "source"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "source": {
                  "type": "string",
                  "minLength": 1
                },
                "excerpt": {
                  "type": "string",
                  "minLength": 1
                },
                "timestamp": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "corroborating",
                  "contradicting",
                  "uncertain",
                  "primary",
                  "context"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "case": {
          "summary": "case presentation.",
          "useWhen": [
            "The case presentation best matches the authored intent"
          ],
          "default": true
        },
        "sources": {
          "summary": "sources presentation.",
          "useWhen": [
            "The sources presentation best matches the authored intent"
          ]
        },
        "chain": {
          "summary": "chain presentation.",
          "useWhen": [
            "The chain presentation best matches the authored intent"
          ]
        },
        "text": {
          "summary": "text presentation.",
          "useWhen": [
            "The text presentation best matches the authored intent"
          ]
        }
      },
      "constraints": [
        "Use chain for ordered provenance",
        "Do not invent excerpts or source attribution"
      ],
      "example": {
        "capability": "semantic:evidence-case",
        "props": {
          "variant": "case",
          "spec": {
            "title": "Evidence case",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "title": "title",
              "source": "source",
              "timestamp": "at",
              "excerpt": "excerpt",
              "tone": "role"
            },
            "toneMap": {
              "corroborates": "corroborating",
              "primary": "primary"
            }
          }
        },
        "bindings": {
          "evidence": {
            "from": "<state-path>"
          }
        }
      }
    },
    "semantic:decision": {
      "dataProps": {
        "decision": {
          "type": "object"
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "eyebrow": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "title",
                "summary",
                "outcome"
              ],
              "properties": {
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "summary": {
                  "type": "string",
                  "minLength": 1
                },
                "outcome": {
                  "type": "string",
                  "minLength": 1
                },
                "rationale": {
                  "type": "string",
                  "minLength": 1
                },
                "confidence": {
                  "type": "string",
                  "minLength": 1
                },
                "impact": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "labels": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "rationale": {
                  "type": "string"
                },
                "confidence": {
                  "type": "string"
                },
                "impact": {
                  "type": "string"
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "affirmative",
                  "cautionary",
                  "negative",
                  "uncertain",
                  "neutral"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "summary": {
          "summary": "summary presentation.",
          "useWhen": [
            "The summary presentation best matches the authored intent"
          ],
          "default": true
        },
        "rationale-chain": {
          "summary": "rationale-chain presentation.",
          "useWhen": [
            "The rationale-chain presentation best matches the authored intent"
          ]
        },
        "text": {
          "summary": "text presentation.",
          "useWhen": [
            "The text presentation best matches the authored intent"
          ]
        }
      },
      "constraints": [
        "Map title, summary, outcome, and rationale",
        "Use rationale-chain only when reasoning order is meaningful"
      ],
      "example": {
        "capability": "semantic:decision",
        "props": {
          "variant": "summary",
          "spec": {
            "eyebrow": "Decision",
            "density": "comfortable",
            "fields": {
              "title": "title",
              "summary": "summary",
              "outcome": "verdict.outcome",
              "confidence": "verdict.confidence",
              "rationale": "verdict.rationale",
              "impact": "impact"
            },
            "toneMap": {
              "approved": "affirmative"
            }
          }
        },
        "bindings": {
          "decision": {
            "from": "<state-path>"
          }
        }
      }
    },
    "security:attack-path": {
      "dataProps": {
        "graph": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "entities",
            "relationships"
          ],
          "properties": {
            "entities": {
              "type": "array",
              "items": {
                "type": "object"
              }
            },
            "relationships": {
              "type": "array",
              "items": {
                "type": "object"
              }
            }
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "entityFields",
            "relationshipFields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "entityFields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "label"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "detail": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "tone": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "relationshipFields": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "source",
                "target"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "source": {
                  "type": "string",
                  "minLength": 1
                },
                "target": {
                  "type": "string",
                  "minLength": 1
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "start": {
                  "type": "string",
                  "minLength": 1
                },
                "end": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "ganttScale": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind"
              ],
              "properties": {
                "kind": {
                  "enum": [
                    "datetime",
                    "linear"
                  ]
                },
                "hourFormat": {
                  "enum": [
                    "24",
                    "12"
                  ]
                },
                "displayPrefix": {
                  "type": "string"
                },
                "minimum": {
                  "type": "number"
                },
                "maximum": {
                  "type": "number"
                },
                "tickStep": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "showSeconds": {
                  "type": "boolean"
                },
                "showTimeZone": {
                  "type": "boolean"
                }
              }
            },
            "toneMap": {
              "type": "object",
              "additionalProperties": {
                "enum": [
                  "accent",
                  "danger",
                  "warning",
                  "success",
                  "neutral"
                ]
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        },
        "stateKey": {
          "type": "string",
          "minLength": 1
        },
        "canvasState": {
          "type": [
            "object",
            "null"
          ]
        },
        "height": {
          "type": [
            "number",
            "string"
          ]
        },
        "miniMap": {
          "type": "boolean"
        },
        "controls": {
          "type": "boolean"
        },
        "background": {
          "type": "boolean"
        },
        "ariaLabel": {
          "type": "string",
          "minLength": 1
        }
      },
      "variants": {
        "canvas": {
          "summary": "canvas attack-path presentation.",
          "useWhen": [
            "The canvas presentation best matches the investigation surface"
          ],
          "default": true
        },
        "diagram": {
          "summary": "diagram attack-path presentation.",
          "useWhen": [
            "The diagram presentation best matches the investigation surface"
          ]
        },
        "relations": {
          "summary": "relations attack-path presentation.",
          "useWhen": [
            "The relations presentation best matches the investigation surface"
          ]
        },
        "gantt": {
          "summary": "gantt attack-path presentation.",
          "useWhen": [
            "The gantt presentation best matches the investigation surface"
          ]
        },
        "text": {
          "summary": "text attack-path presentation.",
          "useWhen": [
            "The text presentation best matches the investigation surface"
          ]
        }
      },
      "emits": {
        "node": {
          "summary": "The user selects a canvas node.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "edge": {
          "summary": "The user selects a derived canvas edge.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "type": "string"
              }
            }
          }
        },
        "layout": {
          "summary": "The canvas commits its current viewport and node positions.",
          "payloadSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "value"
            ],
            "properties": {
              "value": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        }
      },
      "constraints": [
        "Preserve stable entity and relationship identities",
        "Use relationship start and end fields for gantt",
        "Put density and canvas mechanics in spec or root props"
      ],
      "example": {
        "capability": "security:attack-path",
        "props": {
          "variant": "canvas",
          "stateKey": "attack-path-trial",
          "spec": {
            "title": "Attack path",
            "density": "comfortable",
            "entityFields": {
              "id": "id",
              "label": "label",
              "detail": "detail",
              "type": "type",
              "tone": "status"
            },
            "relationshipFields": {
              "id": "id",
              "source": "sourceId",
              "target": "targetId",
              "label": "label",
              "start": "start",
              "end": "end"
            },
            "toneMap": {
              "observed": "neutral",
              "compromised": "danger",
              "affected": "warning"
            }
          }
        },
        "bindings": {
          "graph": {
            "from": "<state-path>"
          }
        }
      }
    },
    "software:source-findings": {
      "dataProps": {
        "lines": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "sourceLabel": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "wrap": {
              "type": "boolean"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "number": {
                  "type": "string",
                  "minLength": 1
                },
                "text": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeText": {
                  "type": "string",
                  "minLength": 1
                },
                "afterNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "afterText": {
                  "type": "string",
                  "minLength": 1
                },
                "annotation": {
                  "type": "string",
                  "minLength": 1
                },
                "change": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "findings": {
          "summary": "Annotated source findings.",
          "useWhen": [
            "Findings attach to exact source lines"
          ],
          "default": true
        },
        "text": {
          "summary": "Linear textual findings.",
          "useWhen": [
            "Visual source rendering is unavailable"
          ]
        }
      },
      "constraints": [
        "Map source line, text, and annotation fields",
        "Do not infer findings in the renderer"
      ],
      "example": {
        "capability": "software:source-findings",
        "props": {
          "variant": "findings",
          "spec": {
            "title": "Source findings",
            "density": "comfortable",
            "fields": {
              "number": "line",
              "text": "text",
              "annotation": "note"
            }
          }
        },
        "bindings": {
          "lines": {
            "from": "<state-path>"
          }
        }
      }
    },
    "software:source-comparison": {
      "dataProps": {
        "lines": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      },
      "props": {
        "spec": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "fields"
          ],
          "properties": {
            "title": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "sourceLabel": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "emptyText": {
              "type": "string"
            },
            "wrap": {
              "type": "boolean"
            },
            "fields": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "number": {
                  "type": "string",
                  "minLength": 1
                },
                "text": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "beforeText": {
                  "type": "string",
                  "minLength": 1
                },
                "afterNumber": {
                  "type": "string",
                  "minLength": 1
                },
                "afterText": {
                  "type": "string",
                  "minLength": 1
                },
                "annotation": {
                  "type": "string",
                  "minLength": 1
                },
                "change": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "density": {
              "enum": [
                "comfortable",
                "compact"
              ]
            }
          }
        }
      },
      "variants": {
        "unified-diff": {
          "summary": "unified-diff source comparison.",
          "useWhen": [
            "The unified-diff presentation matches the review surface"
          ],
          "default": true
        },
        "split-diff": {
          "summary": "split-diff source comparison.",
          "useWhen": [
            "The split-diff presentation matches the review surface"
          ]
        },
        "text": {
          "summary": "text source comparison.",
          "useWhen": [
            "The text presentation matches the review surface"
          ]
        }
      },
      "constraints": [
        "Supply precomputed aligned diff rows",
        "Do not calculate or interpret changes in the renderer"
      ],
      "example": {
        "capability": "software:source-comparison",
        "props": {
          "variant": "unified-diff",
          "spec": {
            "title": "Policy comparison",
            "density": "comfortable",
            "fields": {
              "id": "id",
              "beforeNumber": "beforeLine",
              "beforeText": "before",
              "afterNumber": "afterLine",
              "afterText": "after",
              "change": "change"
            }
          }
        },
        "bindings": {
          "lines": {
            "from": "<state-path>"
          }
        }
      }
    }
  }
};
