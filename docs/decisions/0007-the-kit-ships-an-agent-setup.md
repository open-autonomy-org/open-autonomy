# ADR 0007: The kit ships an agent-setup package; Supercode's applier renders it into the harness

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends [ADR 0006](0006-the-kit-is-a-lineage.md) (what a project's brain carries, and what an upgrade
retires) and [ADR 0001](0001-runtime-boundary.md) (what the host does before the gateway starts), each as
stated under Consequences. Supersedes neither.

## Context and sources

**Authorization.** The owner's coding conversation of September 23, 2026, in this repository (no public
permalink; the quotations record scope, not independent approval).
- "can we set the template with that IR and compile INTO the 3 types?" and "yes proceed".
- The constitution, amended ("yes amend", [#706](https://github.com/open-autonomy-org/open-autonomy/pull/706)):
  "the kit renders its brain for the harness the owner picks and never implements one."
- "a project's spec is a file in its repository", reached by the kit's three-way merge; "most of MY projects
  switch to supercode - for other people they probably are more comfortable with hermes"; "our system is
  actually smart about what to do"; "be super sure about the IR"; "set a goal to complete all steps".

**The IR.** Supercode's accepted
[agent-setup IR](https://github.com/volter-ai/supercode/blob/main/docs/architecture/content-spec-status.md),
derived from 269 elements of thirteen real setups (this repository's own agent and Hookline among them) and
a fresh adversarial review ([plan](https://github.com/volter-ai/supercode/blob/main/docs/plans/content-spec-status.md)).
What this record uses from it:
- a package is the one source: content files (persona, skills, hooks, plugins, gate scripts) are their own
  declaration; declared records (jobs, `Inference`, harness settings under `extensions.<harness>`) sit
  beside them; a harness's config files are rendered into the home, never committed;
- one manager per field: the package (this repository, whoever committed), the operator (a pause is an
  overlay), the agent, the runtime (custody, the workspace), the harness; a write by anyone else is a
  conflict reported to the manager;
- `Inference`: named models with default and unattended pointers, and a key only by its custody name;
- the applier (`orchestrator apply`, Supercode `sdk/orchestrator/apply`): records owned by harness id
  against a base in the applier's own state per home, through the harness's own functions (Hermes's cron
  and config functions under its own interpreter), a home with no state plan-only until provisioned or
  adopted, `delete` only through a reviewed plan.

**The kit today** (this repository at 13a18c29).
- `base/hermes/config.yaml` and `base/hermes/profiles/treasurer/config.yaml` carry the model route (the
  valve's `OPEN_AUTONOMY_BASE_URL` / `OPEN_AUTONOMY_PAY_URL`, `api_mode: chat_completions`), the terminal,
  memory off, compression, `agent.max_turns`, the disabled `browser-use` toolset and the board's dispatch.
- Each skew's `hermes/cron/jobs.seed.json` declares its jobs; the seed hook
  (`base/hermes/hooks/seed`) creates them by name at gateway start, re-pins every job's model and
  provider to `config.yaml`'s route, pins `workdir` to the checkout, and refreshes a job whose seed changed.
- `start.ts` fills the home (`~/.local/state/open-autonomy/<owner>/<repo>/home`) from the checkout's
  `hermes/` and starts the gateway there.

## Decision

- **The package.** Each project carries `.open-autonomy/agent.json`, the declared records of its agent
  setup, one entry per profile (`default`, and the treasurer):
  - `inference`: the named model `project` (provider `custom`, the model, `endpoint:
    OPEN_AUTONOMY_BASE_URL` and `credential: OPEN_AUTONOMY_KEY` by custody name, `api_mode`), the
    default and unattended pointers; the treasurer's own model on `OPEN_AUTONOMY_PAY_URL`;
  - `jobs`: each skew's jobs, keyed by name, each naming the model `project` and the workspace as its
    `workdir`;
  - `extensions.hermes`: the Hermes-only settings `config.yaml` carries today, in Hermes's own dotted key
    names.

  Content stays as files under `hermes/`: `SOUL.md`, skills, the session-attribution plugin, and
  self-build's gate script.
- **Rendered, never committed.** `hermes/config.yaml`, the treasurer's `config.yaml`,
  `hermes/cron/jobs.seed.json` and the seed hook leave the kit. At every start, before the gateway,
  `start.ts` runs the applier once per profile against that profile's home: provisioning the home on its
  first start, resolving the parameters (the workspace is the checkout's path) and applying. The applier's
  report goes to the start log, every row that is not converged; its conflicts are the agent's to act on
  (capture back into `agent.json` by a commit, or restore by leaving the declaration). A profile whose
  Inference was refused or read back other than declared stops the start: a gateway on an unrendered home
  runs on Hermes's default model. A setting dropped from `agent.json` stays in the home (Hermes has no
  function that unsets a key) and is reported `still-live` at every start until it is set or resolved.
- **What the seed hook did, the applier does by the IR's rules.** A changed model reaches every job
  because each job names the model `project` and the pointer moves (`act`); the workspace reaches every job
  as its declared `workdir`; a job whose declaration changed is edited through `update_job`; a job the
  agent or an operator changed is reported, not overwritten. What the hook did that the IR refuses —
  falling back to `local` delivery when a platform has no credential — goes: Hermes's own preflight
  blocks such a run, once alerted. Its webhook seed (`hermes/cron/webhooks.seed.json`, which no project
  carries) goes with it: a route is the agent's act through `hermes webhook`, its secret the home's.
- **Upgrade.** A project on the old layout gets its `.open-autonomy/agent.json` derived by the upgrade from
  its own files — `hermes/config.yaml`'s model (a `${NAME}` endpoint or key becomes its custody name; a
  literal URL or the valve's `valve` key stays literal), every other key as `extensions.hermes.config`,
  the treasurer's the same, and its job seed with the model `project` and the workspace declared — so its
  choices (a Codex subscription, Discord bindings, a changed schedule) are kept, and those files and the
  seed hook are retired. After that the kit's three-way merge carries `agent.json` like any kit-owned file.
  The first start on the new layout finds a home with no apply state and the jobs the seed hook made: the
  runtime adopts each job the package declares by its key, once (an explicit per-home act); the next apply
  converges them, keeping a live model pin the package does not name until the declared model changes.
- **Targets.** `hermes` is the target the kit renders for today. The same package applies to the
  orchestrator (`--orchestrator <root>`), whose workers are Claude Code or Codex; offering it as a kit
  target waits on an ADR 0001 amendment naming its scheduler, image and reporter.
- **The fleet.** A fleet gateway's profile names are flat, so the composer namespaces each project's
  profiles by the repository (`<repo>` and `<repo>-<profile>`), never dropping one: a name that would not
  be a Hermes profile id, or would collide, refuses the composition. A fleet still opens no pay door: work
  reaches a profile by its bare name, which `<repo>-treasurer` is not, so every profile's pay address is its
  key's, which spends and stops at zero. Nothing in this record moves money.

## What this record extrapolates beyond the owner's words

The owner directed that the template be written once and rendered for the harness picked, that a
project's spec be a file its repository merges, and that the IR be derived from real setups; Supercode's
IR is accepted. The following are this author's design, marked so:
- the file name and shape of `agent.json`, and one entry per profile;
- applying at every start, before the gateway, per profile;
- dropping the seed hook's `local` delivery fallback;
- the runtime adopting the seed hook's jobs once on the first start after the upgrade;
- namespacing fleet profiles as `<repo>-<profile>`;
- failing the start when a profile's Inference does not land, and reporting a dropped setting rather than
  clearing it.

What has run, and where the evidence stops: steps 2 and 3 below ran as bounded hand walks through the kit's
own `applyAgent` and the pinned Hermes (v2026.8.31), not yet in a World. Step 2: a fresh home made from the
cookbook's `hermes/` and `agent.json` created `pm` on `zai/glm-5.3-flash` with the checkout as workdir, a
second apply said nothing, and the rendered `model:` block equals the old committed one. Step 3: a copy of
this repository's live home adopted `pm` and `community` under their ids, kept their pauses and model pins,
wrote only `cron.model`, left the notepad byte-identical, and the second apply said nothing. A bad
`inference.default` stopped the apply. Unverified: the gateway serving from the rendered `config.yaml`
(read, not run: Hermes's own `save_config` wrote it) until our own agent's first start on this change.

## Order of proof

Each step is a hand-run walk; a step that fails stops the ones after it.
1. A Supercode release carrying the applier, pinned by the host package (`^0.2.2`).
2. A fresh project home: its start provisions, applies, and `jobs list` shows `pm` pinned to `project`'s
   model with the checkout as workdir; a second start reports nothing.
3. A home already seeded by the old hook: the first start adopts `pm`, the next converges; its notepad is
   untouched.
4. The fleet host moves to this kit before `create-open-autonomy upgrade --fleet` takes the nine
   repositories onto it (an older host reads `hermes/config.yaml`, which the upgrade retires); the fleet,
   when the owner starts it, composes `<repo>` and `<repo>-<profile>` profiles.

## Alternatives and tradeoffs

- **Supercode's name-keyed `jobs apply` and `model-route apply` (this record's earlier draft).** Removed
  from Supercode: they matched jobs by name, drove Hermes's CLI (which exits 0 on failure) and kept no
  base, so a renamed job was created twice and a live edit was silently reverted.
- **Keep `config.yaml` committed beside the package.** Two copies of one fact: an edit to either is
  ambiguous. The IR makes the package the one source.
- **Keep the seed hook.** It is Hermes-only, re-pins on every start with no record of who changed what,
  and cannot tell an agent's edit from drift.

## Consequences

- **ADR 0006, amended:** a project's brain is its content files plus `.open-autonomy/agent.json`;
  `hermes/config.yaml`, the treasurer's config, the job seeds and the seed hook are retired by the
  upgrade. `agent.json`, which holds the model, is kit-owned: the kit's three-way merge carries it, so a
  project's own edits survive an upgrade and an upgrade that changes the same lines is a conflict for the
  project to resolve. This reverses ADR 0006's "the config is the project's" for the model and settings;
  the project still decides them, by the merge. The target is `hermes`; a second target amends this record.
- **ADR 0001, amended:** the host runs the applier before the gateway, in bare and container mode alike;
  the applier's state lives beside the home under the open-autonomy state directory. Nothing else moves.
- **Nothing changes on the platform, the wire or metering.** Every model call still goes through the
  valve; the session-attribution plugin stays.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books.** Compatible: the route is still the valve's, referenced by
  custody name, and the treasurer's pay door is the valve's second port as today.
- **Only the SDK is real; the platform shows, does not steer.** Compatible: the reporter is unchanged.
- **Authority comes from the repository.** Strengthened: the agent setup is one committed file, and a live
  change the repository did not make is reported rather than kept silently.
- **Nothing in an agent's reach is a secret that matters.** Compatible: `agent.json` carries custody names,
  never values; the applier never writes a custody value.
- **No automated tests; nothing develops against a real API.** Compatible: each proof step is a hand-run
  walk in a World.
- **Out of scope (as amended in #706).** Compatible: the kit declares a package and implements no harness;
  Supercode's applier is its tool.
