---
"@gik-ai/kernel": patch
"@gik-ai/evaluators": patch
"@gik-ai/durable-runtime": patch
"@gik-ai/blueprint": patch
"@gik-ai/react": patch
"@gik-ai/controlface": patch
"@gik-ai/agentface": patch
"@gik-ai/transport-http-sse": patch
---

Republish the public packages with their declared build output. The previous
prerelease tarballs were produced without a build of the release commit, so
installed packages were missing the `dist` entry points declared by their
package manifests.
