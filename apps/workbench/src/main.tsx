import { createRoot } from "react-dom/client";
import { BundleHost } from "../../../adapters/react/src/index";
import { workbenchBundle } from "./Workbench";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// The workbench is a first-class CompositionBundle mounted through the generic host — the same entry
// that runs every leaf bundle. StrictMode intentionally omitted: it double-invokes effects, which
// would spin up the guest runtime twice. Fine to revisit once the guest moves to a transport client.
createRoot(el).render(<BundleHost bundle={workbenchBundle} />);
