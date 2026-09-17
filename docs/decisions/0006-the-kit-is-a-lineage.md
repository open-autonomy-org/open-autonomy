# ADR 0006: The kit is a lineage: an abstract base, three skews, projects as branches, upgrades as merges

Status: Proposed. Accepted only upon independent constitution review and merge of this record with
the first implementation (the engine split); proposed until both occur.

## Context and sources

Source of authorization: the owner's coding conversation of September 16, 2026, in the company
repository (no public permalink; the quotations record scope, not independent approval). The owner
challenged the kit's PM: "Every PM is supposed to only know its own posture — the different postures
were different cookbooks, not for a 'single universal PM agent' to know about"; then "perhaps the
problem is with our template"; "perhaps the answer is we need a few template skews"; "for each skew —
it's actually just a small 'patch' applied to the base right? Almost like inheritance?"; "we're going to
potentially have changes applied to peak or any of the specific projects on their own — that will differ
from what the base or a skew has. So upgrade cannot actually be mechanical but presumably if there are
conflicts (specifically when tracked historically) it will have to be merged by an agent"; "in that case
peak is not a skew"; "I think we should have: self-build, manage-project, manage-organization as the 3
skews. The manage organization's job would be to communicate in a channel still daily with a concise but
complete memo with the meeting agenda — that meeting is the heart of the job of the organization. The
results of that meeting are then filtered down to the projects and their PMs take action redirecting
the roadmap as needed."

What exists (source audit, same day, `main` at eafe027e):

- One kit. `packages/kit-hermes/src/kit.ts` names it (`KIT = { name: 'hermes' }`); the README says
  "Hermes is currently the only kit". `render()` is one flat walk of `template/` with three token
  substitutions (`__PROJECT__`, `__ACCOUNT__`, `__ACCOUNT_ENC__`) into nine files: the two configs, the
  two package files, README, CONSTITUTION, CONTRIBUTING, AGENTS.md, ROADMAP.md, brand.json.
- The brain is kit-owned. The `OWNED` rule keeps `hermes/` current except the config, the two seeds,
  the schedule and any skill outside `hermes/skills/open-autonomy/`: SOUL and the four skills (pm,
  develop, community, strategy) are rewritten by `upgrade` in every project. `check` treats any
  difference as drift and exits 1; a project keeps a file only by naming it in `kit.json`'s
  `divergences`.
- The cookbooks do not differ. todo-cli's `hermes/skills/open-autonomy/pm/SKILL.md` is byte-identical
  to the template's, as is this repository's own; the five files that differ are the model config, the
  job seed, the kanban seed, the treasurer config and project-communications. A cookbook is a
  parameterization of one brain, not a posture.
- The posture lives in the PM. `template/hermes/skills/open-autonomy/pm/SKILL.md` line 143: "never
  rewrite the constitution. If it still reserves all task creation to the owner, request a concrete
  owner amendment and hold new dispatch; continue coordinating existing authorized work." Introduced by
  dddef4d2 (2026-09-06, the roadmap-scrum change) and repeated in the kit README's upgrade notes. With
  one brain for every project, the only place a difference in authority could live was something the
  brain reads at runtime; the constitution became that place.
- Peak is a project with a long local history on that brain: `volter-ai/peak-autonomy` replaced the
  PM with peak-scrum, handed the timeline to the client's tracker (`timeline: none`), turned on seats
  and added the human-service recipe, all as commits in a private repository.

## Decision

- **Two kinds of subject, three skews.** A project kit with two skews, `self-build` and
  `manage-project`, and an organization kit, `manage-organization`. A skew is what its PM does and to
  whom: self-build executes through its own fleet (kanban, seats); manage-project keeps the plan and
  the record for work that people or hand-run sessions execute, asks people, and holds no dispatch
  verb; manage-organization reads its organization's projects, writes one daily memo with the agenda
  into the organization's channel, records the meeting's outcomes, and files each outcome that touches
  a project as an authorized request in that project's intake. A PM knows only its own skew. No skill
  reads a constitution to decide whether it may dispatch; the clause at line 143 leaves.
- **An abstract base, whole-file overlays.** The template splits into `base/` and `skews/<name>/`. Base
  holds only what every subject runs: the reporter, reporting, the valve, start, the container stack,
  credentials, codex-auth, mint-key, maintain, the vendored SDK, the landing workflow, the model-provider
  plugin, the treasurer profile, SETUP and PRODUCTION, branding, LICENSE, package.json. A skew holds the
  brain (SOUL, its skills, its job seed) and the seeded texts whose promises differ (README,
  CONSTITUTION, AGENTS.md). `render(base) ⊕ render(skew)`: a later key wins. A skew replaces or adds
  whole files and never carries a textual patch against a base file. If a skew would have to delete a
  base file, that file was never base: develop, strategy, community, pm, the kanban seed, the community
  monitor, scrum.ts and community.ts move down into self-build.
- **Identity stays where it is rendered, and never conflicts.** The merge's ancestor and theirs are
  both renders with the project's own parameters, so a `__PROJECT__` or `__ACCOUNT__` substitution is
  identical on both sides and can never be a conflict. Of the nine files that carry a token, eight are
  seeded once and are the project's; the one kit-owned file that carries one,
  `.open-autonomy/package.json`, drops it so the host package is the same bytes in every project. Only a
  plain-git lineage with no engine would need identity out of the files; the engine does not.
- **A project is a branch off its skew.** `kit.json` records `kit: <skew>` and the kit version. A
  project's edits to kit files are commits, first-class, not drift and not a declaration. `check`'s
  drift error and the `divergences` list are retired.
- **Upgrade is a three-way merge.** Ancestor: the render at the recorded version. Theirs: the render at
  the new version. Ours: the project's file. Clean hunks apply mechanically; a hunk both sides changed
  is a conflict, left in place on an upgrade branch for an agent in the project's own session to
  resolve, landed through the project's normal landing, and adversarially reviewed as every non-trivial
  merge is. An upgrade never changes a project's skew; moving between skews is a deliberate re-adopt.
- **Peak is not a skew.** It is a project on self-build with private commits. There is no engagement
  skew and no private-skew mechanism; a second engagement decides then whether it forks from
  peak-autonomy or from self-build. The mechanisms Peak's history relies on, `seats` and the
  tracker-owned timeline, are doors and stay in base.

## What this record extrapolates beyond the owner's words

The file-level split of base and skews (which files are base), the name `manage-project` for the
posture the owner called "manage", the three-way merge with the recorded render as ancestor, and the
retirement of `check`'s drift error and `divergences` are this author's
design to satisfy the rulings above, not rulings themselves. The memo's fixed shape and the
three-day review as a memo variant are decided in the company repository's own record
(`volter-ai/volter`, decision 0014).

## Alternatives and tradeoffs

- Keep one PM and let the constitution carry the posture. Rejected by the owner: it is the universal
  PM that knows about postures.
- Skews as textual patches on base files. Rejected: a patch rots the first time the base moves and an
  upgrade cannot reason about it; whole files duplicate prose, which is cheap.
- Skews as git branches with projects merging from upstream, no engine at all. Not now: the engine's
  render is the ancestor a merge needs, and with no engine the identity tokens would have to leave the
  files first; the engine keeps the merge and the render together.
- A private skew source for Peak. Rejected by the owner: Peak's privacy is its repository's; a project
  with local commits needs no skew.

## Consequences

- Kit 3.0: `template/` becomes `base/` plus `skews/{self-build,manage-project,manage-organization}/`;
  `create` and `adopt` take `--skew`; `kit.json` records it; `check` and `upgrade` become the merge.
  Existing projects (this repository, todo-cli, hookline, evidence-desk, peak-autonomy) record
  `self-build` on their next upgrade and merge, with any conflict resolved by an agent in that project.
- The PM skill loses the constitution-reading clause and the amendment request; the README's upgrade
  notes that describe them leave with it, per the constitution's rule that a retired thing is removed,
  not deprecated.
- The manage-project PM runs one scrum a day, before the organization's memo, rather than hourly; the
  organization PM runs one gather-memo-meeting cycle a day. Cost per project is measured on the first
  two adoptions before more follow.
- Nothing here changes the platform, the wire, metering or the SDK: a skew's reporter publishes the same
  events; the platform reads no skew.
