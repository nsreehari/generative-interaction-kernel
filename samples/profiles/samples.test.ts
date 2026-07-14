import liveCardsSpec from "./live-cards/sample-tests.json" with { type: "json" };
import briefingSpec from "./briefing/sample-tests.json" with { type: "json" };
import fourLayersSpec from "./4layers/sample-tests.json" with { type: "json" };
import { registerSampleProfileTests, type SampleProfileTestSpec } from "./sample-test-runner";

registerSampleProfileTests("./live-cards", liveCardsSpec as SampleProfileTestSpec);
registerSampleProfileTests("./briefing", briefingSpec as SampleProfileTestSpec);
registerSampleProfileTests("./4layers", fourLayersSpec as SampleProfileTestSpec);