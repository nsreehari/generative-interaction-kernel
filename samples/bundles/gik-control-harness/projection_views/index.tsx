import { ControlHarnessShell } from "./ControlHarnessShell";
import socViews from "./soc";

export * from "./soc";

export default {
	shell: ControlHarnessShell,
	"blueprint-inspector": socViews["blueprint-inspector"],
	journal: socViews.journal,
	participants: socViews.participants,
};