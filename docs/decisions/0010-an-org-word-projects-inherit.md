# ADR 0010: An org has its own word, and its projects inherit it

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends [ADR 0003](0003-operating-state-through-the-sdk.md) as stated under Decision. Supersedes nothing.

## Context and sources

**Authorization.** The owner's coding conversation of September 24, 2026, while two of an org's projects
(`volter-ai/volter`, `open-autonomy-org/hookline`) ran on the orchestrator pilot: "do we have org level
controls? Because I sometimes ask about org and sometimes about the project"; asked how to handle it, "think
about how all other cloud clis work"; on the answer below, "okay let's go".

**What exists** (this repository at 13a18c29):
- The operating state (ADR 0003) is one record per project account: `control.desired`, set by
  `POST /v1/agent/state` on a `steer` key, and `control.observed`, reported by the automation. Every reader
  reads `desired`: the kit's reporter, `oa`, the landing page, the dashboard, the pulse.
- The owner's bounds are per project: `spend.limits` in the project's `.open-autonomy/config.yaml`, synced
  to the books every ten minutes, held in `reserve` against that account's own usage buckets.
- A name without a slash is already an account: `@<login>` is a funder on the books, proven by a claim
  file in a repository `<login>` owns, and its key only gives. The page `/<name>` lists the projects the
  name owns and what it gave. Nothing on the books is set for a name and read by its projects.
- `oa` takes `owner/project` on every command and nothing else.

**How other cloud CLIs do it** (the owner's pointer). The scope an act lands on is explicit and has a
default: `gcloud --project` over `gcloud config set project`, `gh -R` over the checkout's remote, `vercel
--scope` over the linked directory, `fly -a` over `fly.toml`. The org is a resource in its own right, and
its policy is inherited by the platform, most restrictive winning (GCP organization policies, AWS service
control policies, GitHub org rulesets): a project never copies the org's word, and the console names the
org when the org's word is what holds.

## Decision

**The org is the `@<org>` account.** An org's word is kept on the account that already stands for the
name on the books; no new kind of account.

- **Its pause.** `POST /v1/agent/state` on a `steer` key for `@<org>` records the org's desired state,
  exactly as for a project. A `steer` key for `@<org>` is minted by the claim file on the default branch
  of `<org>/.github`, the repository GitHub itself reads as the org's defaults; a claim in any other of the
  org's repositories proves that repository, not the org.
- **Its bounds.** `spend.limits` in `<org>/.github/.open-autonomy/config.yaml`, synced like a project's,
  in the same syntax. Each is held in `reserve` against the sum over every `<org>/*` account: its settled
  spend, its calls and tokens in the window, and everything in flight. The total is enforced over every
  project but published (on a project's books, the org's, and a refusal) only when every project of the org
  opens its books to everyone; otherwise a closed project's spend would be read off a sibling as the total
  less the sibling's own, so the limit shows with its total withheld.
- **Its credits.** The org's give key, like its steer key, is proven only in `<org>/.github`; a login GitHub
  does not say is a person is held to that proof.
- **Inheritance, most restrictive wins.** A project's effective desired state is paused when its own word
  or its org's is paused. The platform serves the effective state wherever it served the project's own:
  `GET /v1/accounts/:account/state`, the page, the dashboard, the pulse. When the org's word is what holds,
  `desired` is the org's record and carries `from: "@<org>"`, and the project's own record is beside it as
  `own`. Both records stay as they were set: resuming the org never resumes a project its owner paused,
  and the project's own resume under a paused org changes nothing that runs. Every automation that
  implements ADR 0003 obeys an org pause with no change to it.
- **The org's key reads its projects.** Owner's ruling, 2026-09-24: the org's steer key reads every project of
  the org as that project's own key does, every panel on every door, and the rollup lists every project of the
  org with every figure to it. Anyone else gets what everyone may see.
- **The rollup answers as each project's own doors would.** A project appears in it only when its overview is
  open to everyone, with its money only when its books are and its live sessions only when its sessions are.
- **The CLI scopes like a cloud CLI.** Each `oa` command takes its scope as its argument, `org` or
  `org/project`, or `--project`/`--org`; with none, the checkout's GitHub remote names the project, then `oa use <scope>` the
  saved default. `oa status <org>` rolls up the org's listed projects; `oa pause <org>` and `oa resume
  <org>` set the org's word; `oa key mint <org>` mints the org's key through `<org>/.github` (a checkout of it
  names the org). An act refuses a key whose own account is not the scope named, since the platform records
  the act on the key's account.

Extrapolation, this author's (the owner named the model, not these particulars): `<org>/.github` as the
proof and the home of the org's bounds; `own` and `from` as the field names; the argument, checkout,
saved default order; the rollup's contents (each project's effective word, balance and live sessions).
An org's desired state is the org's alone: an org reports nothing observed, since the projects do.

## Alternatives and tradeoffs

- **The CLI fans out**: `oa pause <org>` pauses each project. Rejected: a project added later is not
  paused, a resume clobbers a project the owner had paused on its own, and the page cannot say the org
  did it. Every cloud CLI named above keeps the org's word on the org.
- **The org's bounds as a project's config key** (`org_limits:` in each project). Rejected: the owner of
  one project could loosen what bounds the org.
- **A new org account kind.** Rejected: `@<org>` already stands for the name on the books and on the page.
- **Enforcing the org pause on the model rail.** Rejected, as ADR 0003 rejected it for a project: the
  platform records and the automation applies. The org's spend bounds are enforced, as a project's are.

## Consequences

- The ledger serves the effective state from one place and adds the org's bounds to `reserve`; the sync
  reads `<org>/.github` for `@<org>` names; the key mint admits `steer` for an org through that repository.
- The org's bounds are money-path code: read by a human before it ships, as every change to `reserve` is.
- The SDK's `AgentControl` gains the optional `own`, and `desired` the optional `from`.
- `oa` gains `use`, the optional scope, the org rollup and the org's pause.
- The page and dashboard name the org when its word holds ("paused by volter-ai"), and offer no project
  resume under it.
- A funder key for an org is no longer minted from any other of its repositories. One minted that way before
  stays valid until it expires (at most 90 days) unless an admin revokes it.

## Verification

Walked by hand on a local self-host worker, a stand-in serving GitHub's files and the model gateway: an org
`acme` with projects `alpha` and `beta`. The org's steer key minted through `acme/.github` and was refused
through `acme/alpha` (`org_claim_in_dot_github`; the same claim there minted only `give`), and refused a roadmap
push. With `beta` paused on its own word and the org paused, `alpha` served the org's word with `from: "@acme"`;
`alpha`'s own resume changed nothing that runs (`oa` said "still paused by acme"); the org's resume ran `alpha`
and left `beta` paused. The pages read "Pause requested by acme" for `alpha` and plain "Pause requested" for
`beta`. The org's 50¢ daily limit, synced from `acme/.github`, refused the fourth 20¢ call across both
projects, naming `@acme`. `oa` took its scope from the checkout's remote and from `oa use`, and refused an org
where only a project is meant.

After review, walked again: with `beta` on the `status` preset (books closed), `alpha`'s books, the org's view
and `alpha`'s refusal showed the org's limit with its total withheld; an `acme` give key was refused through
`acme/alpha` and minted through `acme/.github`, a person's (`bob`) through any repository of theirs; `oa pause
acme` with `alpha`'s key in `OPEN_AUTONOMY_KEY` refused instead of pausing `alpha`; a checkout of `acme/.github`
named the org; the dashboard offered no project resume under the org's pause and said why.
