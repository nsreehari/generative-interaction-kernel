import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";

export const LiveWorkspaceSocBody: ProjectionView = ({ children }) => {
  const styles = useStyles();
  return <div className={styles.workColumn}>{children}</div>;
};
