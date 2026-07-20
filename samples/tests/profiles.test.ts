import liveCardsSpec from "../profiles/live-cards/sample-tests.json" with { type: "json" };
import briefingSpec from "../profiles/briefing/sample-tests.json" with { type: "json" };
import fourLayersSpec from "../profiles/4layers/sample-tests.json" with { type: "json" };
import socSpec from "../profiles/live-workspace-soc/sample-tests.json" with { type: "json" };
import { registerSampleProfileTests, type SampleProfileTestSpec } from "./sample-test-runner";

registerSampleProfileTests("../profiles/live-cards", liveCardsSpec as SampleProfileTestSpec);
registerSampleProfileTests("../profiles/briefing", briefingSpec as SampleProfileTestSpec);
registerSampleProfileTests("../profiles/4layers", fourLayersSpec as SampleProfileTestSpec);
registerSampleProfileTests("../profiles/live-workspace-soc", socSpec as SampleProfileTestSpec);