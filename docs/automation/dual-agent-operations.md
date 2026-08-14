# Dual-agent operations

GIK supports two mutually exclusive issue implementation routes:

- GitHub Copilot cloud agent
- The local `gik-auto` Copilot CLI controller

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
  -> human review and required CI
  -> human-controlled merge
```

On ambiguity, remove `agent-in-progress`, apply `needs-human`, and leave a
specific question. On an environmental failure, replace it with
`agent-blocked`. After resolving the problem, a maintainer may remove the
failure label and reapply `agent-ready`.

## Cloud automation

Copilot automations require a private or internal repository. In the
repository's **Agents > Automations** page, create an hourly automation using
the `gik-issue-implementer` custom agent and an economical default model. Grant
only issue, code-editing, push-branch, test, and pull-request tools.

Use this prompt:

```text
Find the oldest open issue labeled `agent-ready` and `agent-route:cloud` that
is unassigned, is not labeled `agent-in-progress`, and has no existing open
pull request. If none exists, make no changes.

Process exactly one issue with the gik-issue-implementer agent. Claim it before
editing. Follow AGENTS.md, implement and validate the requested change, and
open a pull request for human review. Never merge or push to the default
branch. If requirements are ambiguous or execution is blocked, update the
issue labels and leave a precise comment instead of making speculative changes.
```

Run the automation manually for several trial issues before enabling its
schedule.

## Local automation

The local controller selects only issues carrying `agent-ready` and
`agent-route:local`. Run it manually for several trial issues before using
Windows Task Scheduler. Do not schedule overlapping executions.

The local controller owns issue claiming, worktree creation, final validation,
commit, push, and pull-request creation. Copilot CLI only edits and tests the
isolated worktree. Its default clean-checkout validation command is
`npm run build:public-packages && npm run conformance && npm run typecheck &&
npm run test:jsonata`. Agents must also run focused tests for changed behavior.

The full Vitest baseline is currently non-blocking in CI because the default
branch has known failures. Its result remains visible on every pull request.
Make it required once the default branch baseline is green.

## Required repository rules

Protect `master` with:

- Pull requests required
- At least one human approval
- Required `CI / Validate` check
- Resolved review conversations
- Force pushes blocked
- Direct agent pushes blocked
- Automatic agent merge disabled

Store any cloud-agent-only variables or secrets in the `copilot` GitHub
environment. Do not expose deployment credentials to issue implementation
agents.
