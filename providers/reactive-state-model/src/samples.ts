import type { Json } from "../../../kernel/src/index";

export interface ReactiveComputedSample {
  name: string;
  description: string;
  computed: Record<string, string>;
  initial: Record<string, Json>;
}

export const profileFormSample: ReactiveComputedSample = {
  name: "profile-form",
  description:
    "A dotted-path form composition: full name, readiness, and submit label are maintained as standing computed cells.",
  computed: {
    "form.full": 'form.first & " " & form.last',
    "form.ready": 'form.first != "" and form.last != "" and consent = true',
    "ui.submitLabel": 'form.ready ? "Create profile" : "Complete required fields"',
  },
  initial: {
    "form.first": "",
    "form.last": "",
    consent: false,
  },
};

export const capacityBannerSample: ReactiveComputedSample = {
  name: "capacity-banner",
  description:
    "A transitive metrics chain: total and remaining feed an over-limit flag, which then drives a banner string.",
  computed: {
    "metrics.total": "metrics.approved + metrics.pending",
    "metrics.remaining": "metrics.limit - metrics.total",
    "metrics.overLimit": "metrics.total > metrics.limit",
    "ui.banner": 'metrics.overLimit ? "Capacity exceeded" : "Capacity available"',
  },
  initial: {
    "metrics.approved": 3,
    "metrics.pending": 1,
    "metrics.limit": 10,
  },
};

export const reactiveComputedSamples = [profileFormSample, capacityBannerSample] as const;