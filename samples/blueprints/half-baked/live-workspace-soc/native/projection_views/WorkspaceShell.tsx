import React from "react";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";

export const WorkspaceShell: ProjectionView = ({ children }) => {
  const styles = useStyles();
  return <main className={styles.workspace}>{children}</main>;
};
