# T2 — Front Door / Platform Storyboard — working notes

> Scope: **Beat 1** of the four-beat pitch. `samples-overview` is the executive front door: it
> frames the category, previews the canonical SOC proof, opens its Runtime and Blueprint planes,
> and signals the Tax Prep plus deployment expansion owned by Beat 4.
>
> Status: **IMPLEMENTED (v2, 2026-07-15), aligned with canonical T3.** The storyboard is driven
> by bundle state, both primary destinations open the same `live-workspace-soc` artifact at a
> specific plane, and unsupported remote/headless claims are kept outside the SOC proof boundary.

---

## 1. Job of the front door

Make an executive understand a painful operational consequence, see a credible product category,
and enter one concrete proof without first learning builder vocabulary.

The product thesis is:

> **A mixed team of humans and agents works through one shared operational state. Every
> contribution remains attributable, and every consequential action remains governed.**

The memorable Runtime contract is:

> **Participation does not imply authority.**

The broader platform thesis remains:

> **Agents can leave the screen. They cannot leave the governance boundary.**

Beat 4, not the current in-process SOC runtime, owns the literal proof of transported, remote, and
headless continuity.

## 2. Sequenced argument

The page makes six moves:

1. **Why now** — human UI, agent context, authority, and retrospective logs are fragmented.
2. **Product invariant** — many actors, one state, role-bounded authority, multiple views, and
   complete provenance.
3. **SOC wedge** — two humans and two agents resolve a privileged-access anomaly during payroll
   cutover without disrupting the protected system.
4. **Trust proof** — governance changes outcomes and preserves a reconstructable causal record.
5. **One system, two proof planes** — Runtime and Blueprint open the same compiled SOC artifact.
6. **Expansion** — Tax Prep and the Deployment Atlas prove the invariant across domain and medium.

This is a storyboard, not a sample catalog, API tutorial, or management console.

## 3. Information architecture

```text
Hero
  Humans and agents need one governed place to work
  Participation does not imply authority

01 Why now
  Human interface | Agent runtime | Retrospective logs

02 Product contract
  Morgan | Priya | Correlation Agent | Response Agent
  one event/state model; distinct responsibility and authority

03 SOC first
  five canonical acts + compact causal chain

04 Why trust it
  one truth | explicit authority | outcome-changing governance | reconstructable causality

05 Enter the proof
  Runtime plane | Blueprint plane

Expansion
  SOC: protect | Tax Prep: optimize + comply
  same provenance, validation/fallback, confirmation, and trace
```

## 4. Canonical SOC preview

The front door summarizes, but does not duplicate, T3's domain truth.

### Actors

1. Morgan, SOC Analyst — directs investigation and recommends containment.
2. Priya, Incident Commander — protects operations and authorizes consequential containment.
3. Correlation Agent — suggests exploration and contributes cross-source evidence.
4. Response Agent — proposes bounded responses and executes after authorization.

### Acts

1. **Human intent and constraint** — Morgan establishes intent; Priya protects payroll and DC-01.
2. **Exploration and reorientation** — Correlation suggests; Morgan amends; Correlation replans.
3. **Correlation and governed overreach** — policy rejects DC-01 isolation, applies fallback, and
   evidence resolves Host-A.
4. **Response refinement** — Response proposes Host-A containment; Morgan revises and recommends.
5. **Correct authority and execution** — Priya authorizes; Response executes separately.

The preview uses an untimed causal chain rather than fabricated ledger timestamps:

```text
suggested → amended → rejected + fallback → recommended → authorized → executed
```

## 5. Proof navigation

There are two equal, late-page proof cards. They are two planes of one artifact, not separate
products:

- **Experience the SOC Runtime** → `?bundle=live-workspace-soc&plane=runtime`
- **Inspect the Executable Blueprint** → `?bundle=live-workspace-soc&plane=blueprint`

The Blueprint card says **inspect**, not **author**. The implemented plane exposes actual
`traceProfile` outputs, four tiers, three lowering recipes, contexts, and blueprint resources; it
is not an editing surface.

`manage-blueprints` and `manage-bundles` remain independently routable engineering tools. They are
not the primary Beat 2 or Beat 3 pitch destination.

The SOC bundle accepts an optional `context=<id>` query parameter. Plane/context selection is
projection state: it does not mutate the incident or append journal entries.

## 6. Tax Prep expansion flash

Tax Prep is Beat 4's second-domain proof, not another hero and not a second full product in this
page. The front door shows only the contrast and invariant:

| SOC | Shared invariant | Tax Prep |
|---|---|---|
| Protect operations | Source-grounded provenance | Optimize within policy |
| Reject unsafe containment | Validate or fallback | Reject unsupported deductions |
| Commander authorization | Human confirmation | Preparer/taxpayer confirmation |
| Forensic evidence | Complete causal trace | Document + policy traceability |

The compact Tax journey is:

1. Source documents establish an initial tax position.
2. An agent proposes an optimization with document and policy citations.
3. A current-policy change invalidates part of the strategy.
4. The kernel recomputes while the agent replans.
5. Filing remains blocked behind human confirmation.

Until the Domain + Deployment Atlas exists, this is labeled forthcoming and has no dead CTA.

## 7. Implementation contract

- `state.json` owns the editorial storyboard data: thesis, actors, acts, trust claims, proof
  destinations, expansion, and proof boundary.
- `document.json` binds that object into one specialized `overview:platform-storyboard` view.
- The native projection owns responsive arrangement and navigation behavior, not product truth.
- SOC summary IDs and act count must agree with the canonical SOC blueprint.
- Use host semantic variables and Fluent tokens; no independent decorative palette.
- The page remains the default bundle and contains no horizontal page overflow.

This front door is intentionally not compiled through the four SOC tiers. It is a static editorial
and navigation surface, not a governed domain interaction. Data-driven bundle composition is the
appropriate boundary.

## 8. Proof boundary

The implemented SOC experience proves deterministic, attributable, governed multi-actor
orchestration over one in-process substrate and multiple projections. It does not yet prove:

- independently running remote human clients;
- durable background agents;
- disconnect/reconnect continuity;
- transported state synchronization;
- autonomous work while no human client is connected.

Beat 4 owns those medium-transversality claims through the Deployment Atlas.

## 9. Acceptance criteria

- [x] Hero states the mixed-team product contract without builder jargon.
- [x] “Participation does not imply authority” is visible.
- [x] Four canonical SOC actors are simultaneously introduced.
- [x] The SOC preview uses the canonical payroll-cutover scenario and five acts.
- [x] The causal preview contains no fabricated timestamps or unsupported autonomous continuation.
- [x] Runtime and Blueprint target the same `live-workspace-soc` bundle at different planes.
- [x] Blueprint copy says inspect rather than claiming an editing experience.
- [x] Tax Prep is a light expansion flash with no dead Atlas link.
- [x] The proof boundary assigns remote/headless continuity to Beat 4.
- [x] Focused sample tests, React tests, host build, and desktop/mobile browser validation pass.