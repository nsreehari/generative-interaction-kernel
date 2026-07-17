import React from "react";
import type { ProjectionView } from "@gik/react";
import { useStyles } from "./styles";

export const LiveWorkspaceSocBody: ProjectionView = ({ children }) => {
  const styles = useStyles();
  const [substrate, ...sideChildren] = React.Children.toArray(children);

  return (
    <div className={styles.layout}>
      <div className={styles.workColumn}>{substrate}</div>
      {sideChildren}
    </div>
  );
};
