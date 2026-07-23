import { makeStyles, tokens } from "@fluentui/react-components";
import type { ProjectionView } from "@gik/react";

type AgentActivity = {
  id: string;
  name: string;
  description: string;
  source: string;
  status: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  preview: string;
  run: Record<string, unknown>;
};

const useWorkspaceStyles = makeStyles({
  root: {
    width: "100%",
    minWidth: 0,
    padding: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  title: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
  },
});

const useActivityStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: tokens.spacingHorizontalL,
  },
  tile: {
    minHeight: "190px",
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    textAlign: "left",
    display: "grid",
    gridTemplateRows: "auto auto 1fr auto",
    gap: tokens.spacingVerticalM,
    cursor: "pointer",
    boxShadow: tokens.shadow2,
    ":hover": {
      border: `1px solid ${tokens.colorBrandStroke1}`,
      boxShadow: tokens.shadow8,
    },
    ":focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "2px",
    },
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  name: {
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "anywhere",
  },
  status: {
    flexShrink: 0,
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
  },
  running: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorPaletteBlueForeground2,
  },
  completed: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
  },
  failed: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  description: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  preview: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
    fontFamily: "Cascadia Code, Consolas, monospace",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  empty: {
    paddingBlock: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground2,
    textAlign: "center",
  },
});

const useConsoleStyles = makeStyles({
  console: {
    minHeight: "min(36vh, 380px)",
    maxHeight: "52vh",
    overflow: "auto",
    margin: 0,
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground6,
    color: tokens.colorNeutralForeground1,
    fontFamily: "Cascadia Code, Consolas, monospace",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

function statusClass(status: string, styles: ReturnType<typeof useActivityStyles>): string {
  if (status === "running") return `${styles.status} ${styles.running}`;
  if (status === "completed") return `${styles.status} ${styles.completed}`;
  if (["failed", "timed_out", "cancelled"].includes(status)) return `${styles.status} ${styles.failed}`;
  return styles.status;
}

const Workspace: ProjectionView = ({ node, children }) => {
  const styles = useWorkspaceStyles();
  return (
    <main className={styles.root}>
      <h2 className={styles.title}>{String(node.props.title ?? "Workspace")}</h2>
      {children}
    </main>
  );
};

const AgentActivityBoard: ProjectionView = ({ node, emit }) => {
  const styles = useActivityStyles();
  const items = Array.isArray(node.props.items) ? node.props.items as unknown as AgentActivity[] : [];

  if (items.length === 0) {
    return <div className={styles.empty}>{String(node.props.emptyMessage ?? "Discover agents to begin.")}</div>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.tile}
          onClick={() => void emit("select", {
            agentId: item.id,
            runId: item.runId,
            run: item.run,
          })}
        >
          <span className={styles.header}>
            <span className={styles.name}>{item.name}</span>
            <span className={statusClass(item.status, styles)}>{item.status}</span>
          </span>
          <span className={styles.description}>{item.description || item.source}</span>
          <span className={styles.preview}>{item.preview || "No run yet"}</span>
          <span className={styles.meta}>
            {item.status === "running" ? item.startedAt : (item.finishedAt || item.source)}
          </span>
        </button>
      ))}
    </div>
  );
};

const RunConsole: ProjectionView = ({ node }) => {
  const styles = useConsoleStyles();
  return (
    <pre className={styles.console} aria-live="polite">
      {String(node.props.content ?? node.props.emptyMessage ?? "No output yet.")}
    </pre>
  );
};

export default {
  workspace: Workspace,
  "agent-activity-board": AgentActivityBoard,
  "run-console": RunConsole,
};