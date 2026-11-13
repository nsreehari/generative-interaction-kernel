---
"gik-controlface": minor
---

Add provider-owned operation constraints that prohibit queueing and automatic
transport/guardrail retries without granting invocation authority. Enforce the
constraints at queue admission and execution so non-repeatable writes cannot be
retried after uncertain completion.
