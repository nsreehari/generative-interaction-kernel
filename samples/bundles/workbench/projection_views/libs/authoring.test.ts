// The portable authored-session artifact ({interaction, context, edits} + profile identity) that the
// workbench imports/exports. Verifies serialize/parse round-trips, boundary validation of untrusted
// import text, and the replay guard against a host profile. Moved out of the interaction package with
// the authoring lib it covers — the workbench bundle is its only consumer.

import { test } from "vitest";
import assert from "node:assert/strict";

import { checkAuthoredProfile, parseAuthoredSession, toAuthoredSession } from "./authoring";

test("authored sessions carry a profile identity and are guarded against the host before replay", () => {
  const authored = toAuthoredSession(
    { interaction: "investigate", subject: "incident" },
    { surface: "desktop" },
    { disabled: [], priority: {}, disclosure: {}, order: [] },
    { id: "live-cards", version: "0.1.0" }
  );
  assert.deepEqual(authored.profile, { id: "live-cards", version: "0.1.0" });

  // a serialized session without profile identity is rejected at the import boundary.
  const noProfile = JSON.stringify({ interaction: { interaction: "investigate", subject: "incident" } });
  assert.equal(parseAuthoredSession(noProfile).error, "missing profile.id / profile.version");

  // a well-formed session round-trips.
  const parsed = parseAuthoredSession(JSON.stringify(authored));
  assert.equal(parsed.error, "");
  assert.deepEqual(parsed.authored?.profile, { id: "live-cards", version: "0.1.0" });

  // the replay guard passes on an exact match and explains a mismatch otherwise.
  assert.equal(checkAuthoredProfile(authored, "live-cards", "0.1.0"), "");
  assert.match(checkAuthoredProfile(authored, "live-cards", "0.2.0"), /v0\.1\.0.*v0\.2\.0/);
  assert.match(checkAuthoredProfile(authored, "other-profile", "0.1.0"), /other-profile/);
});
