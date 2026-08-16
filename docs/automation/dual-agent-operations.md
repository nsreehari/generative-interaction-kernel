# Dual-agent operations

GIK supports two mutually exclusive issue implementation routes coordinated by
the private `gik-maintainer` control plane:

- GitHub Copilot cloud agent
- The local `gik-maintainer` Copilot CLI controller

Both routes open pull requests. Neither route may merge or push directly to the
default branch.

## Labels

Create these repository labels:

| Label | Color | Purpose |
| --- | --- | --- |
| `agent-ready` | `0E8A16` | A maintainer approved the issue |
| `agent-route:cloud` | `1D76DB` | Route exclusively to cloud automation |
| `agent-route:local` | `5319E7` | Route exclusively to the local controller |
| `agent-in-progress` | `FBCA04` | An agent claimed the issue |
| `needs-human` | `D93F0B` | Requirements need a human decision |
| `agent-blocked` | `B60205` | Environment or dependency blocked execution |

Only maintainers should apply `agent-ready`. Apply exactly one route label.
Changing routes requires removing any current claim first.

## State transitions

```text
draft issue
  -> agent-ready + one route label
  -> assigned + agent-in-progress
  -> open pull request
  -> required CI and independent guardian
  -> low risk: policy-controlled merge
     critical: human review and merge
```

On ambiguity, remove `agent-in-progress`, apply `needs-human`, and leave a
specific question. On an environmental failure, replace it with
`agent-blocked`. After resolving the problem, a maintainer may remove the
failure label and reapply `agent-ready`.

## Cloud automation

GitHub's native Copilot Automations require a private or internal target
repository and are not the public-repository control plane. The private
`gik-maintainer` repository receives a cross-repository dispatch when
`agent-ready` is applied to an issue already carrying `agent-route:cloud`, then
uses the Copilot Agent Tasks API with a dedicated user-to-server token. It
monitors the active task, records durable state, and passes resulting PRs to
the guardian. There are no idle scheduled cloud-dispatch runs.

The dispatch workflow requires the `GIK_MAINTAINER_DISPATCH_TOKEN` Actions
secret. Use a fine-grained token restricted to the private maintainer
repository with `Contents: Read and write`, as required by the repository
dispatch API. Apply the route label before applying `agent-ready`; the ready
label is the final authorization event.

## Local automation

The scheduled local controller selects only issues carrying `agent-ready` and
`agent-route:local`. Run it manually for several trial issues before using
Windows Task Scheduler. Do not schedule overlapping executions.

On a new Windows worker, cloning the private maintainer repository does not
install anything automatically. From that checkout, run
`npm run bootstrap:unattended -- --minutes 5` after authenticating GitHub CLI
and Copilot CLI. This explicitly links the CLI, initializes labels, and creates
the machine-local scheduled task.

An explicit `gik-maintainer run --issue <number>` invocation is itself a
maintainer authorization and does not require queue labels.

The local controller owns issue claiming, worktree creation, final validation,
commit, push, and pull-request creation. Copilot CLI only edits and tests the
isolated worktree. Its default clean-checkout validation command is
`npm run build:public-packages && npm test`. Agents must also run focused tests
for changed behavior. Every failure is blocking; repair the default branch
baseline rather than weakening required checks.

## Required repository rules

Protect `master` with:

- Pull requests required
- Required `CI / Validate` check
- Resolved review conversations
- Force pushes blocked
- Direct agent pushes blocked
- Low-risk automatic merge allowed only through the independent maintainer
  guardian

Human review remains mandatory for workflows, dependencies, public
APIs/schemas, conformance contracts, governed SOT/ADRs, security, releases,
agent policy, and other protected paths.

Store any cloud-agent-only variables or secrets in the `copilot` GitHub
environment. Do not expose deployment credentials to issue implementation
agents.
