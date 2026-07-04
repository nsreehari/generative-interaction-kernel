import { createRoot } from "react-dom/client";
import { Workbench } from "./Workbench";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up the guest
// runtime twice. Fine to revisit once the guest moves to a transport-backed client.
createRoot(el).render(<Workbench />);
