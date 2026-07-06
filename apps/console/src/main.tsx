import { createRoot } from "react-dom/client";
import { Console } from "./Console";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up the nested
// preview runtime twice. Matches the workbench host.
createRoot(el).render(<Console />);
