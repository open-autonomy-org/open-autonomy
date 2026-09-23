# ADR 0008: People act at declared seams, and each seam leaves a durable record

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends the kit's `project-communications` skill and [PRODUCTION.md](../../packages/kit-hermes/base/.open-autonomy/PRODUCTION.md)
as stated under Consequences. Supersedes nothing.

## Context and sources

**Authorization.** The owner's coding conversation of September 23, 2026, about Evidence Desk working with
Open Autonomy ([evidence-desk#114](https://github.com/open-autonomy-org/evidence-desk/issues/114)):
- "we still need some people - but the people plug in at very small few controlled places";
- "the seams have to be extremely well specified in OA";
- "the aim here is to have open autonomy templates that can use evidence desk to become 'soc2 ready' out of
  the box (knowing that this will require onboarding quizzes and surveys for the humans who use it etc.)".

The purpose the owner gave: a project that runs on Open Autonomy should be able to show an auditor (SOC2 and
similar) where people act, that they act nowhere else, and what they did, from its own records rather than
from surveys.

**The seams today** (this repository at ee4bb46a). Every place a person acts in a kit project, how it is
specified, and where the act is recorded:

| Seam | Who | Door | Record | Specified by |
|---|---|---|---|---|
| Roster and authority | an `owner` | a merged change to `team` in `.open-autonomy/config.yaml` | Git history, each grant's `source` | [team codec](../../packages/sdk/src/team.ts), strict validation |
| Spending bounds | an `owner` | a merged change to `rails:` | Git history | constitution ("the owner's committed word"), treasurer SOUL |
| Pause and resume | a holder of a `steer` key | `oa pause` / `oa resume` | the platform | CLI; an agent's key lacks `steer` |
| Production deploy | the `production` environment's required reviewer; an org admin cuts `deploy-v*` | GitHub environment and tag ruleset | GitHub deployments | PRODUCTION.md; Hookline carries both |
| Release approval | `release-review` | a chat reply to PM's request, verified by the agent against the author's platform ID | the chat | prose in `project-communications` |
| Direction | `owner`, `direction` | an issue, a chat message, or "a coding session on the owner's own machine" | varies; the session case has none | prose in `project-communications` |
| Moderation | `moderation` | native Discord permissions | Discord | prose; grants no decision authority |
| Key minting and rotation | the owner | `oa key mint` / `rotate` | the platform (unverified here) | CLI |
| Credential custody | the owner | writes a custody file beside the home | none | setup guide |
| Vendor account administration (GitHub org, Cloudflare, Discord server, model accounts) | whoever holds it | each vendor's console | the vendor's own audit log, if any | not modelled |

The first four are well specified: a typed record or a native gate, one door, a durable record. Release
approval and direction depend on an agent's judgment of a chat message and leave no record an outsider can
check. Credential custody and vendor administration are not modelled at all, so nothing shows that the roster
is the complete set of people who can act.

## Decision

- **A seam is one of three doors, nothing else.** A person's act takes effect only as (a) a commit by a roster
  member to a declared file, merged under the repository's rules; (b) a native gate of the code host with a
  named required reviewer (an environment approval, a protected tag); or (c) a platform door that requires a
  scoped key an agent never holds. Chat and conversation carry requests and discussion; they are never the
  record of an act.
- **Release approval collapses onto door (b).** The durable acts already exist: cutting the `deploy-v*` tag
  at the candidate and approving the `production` run. PM's review request stays; the reviewer's answer is those
  acts. For packages and local applications, the human creating the release at the candidate SHA is the act.
- **Direction takes effect through door (a) or a durable, attributable record.** Direction given in chat or in
  a coding session binds once it is recorded as an issue or comment by the roster member's verified account, or
  as a commit the owner lands. PM acts on the record, not the conversation.
- **The seams are declared.** `.open-autonomy/config.yaml` gains a `seams:` section, the owner's document:
  each seam's name, the roster scope that may act, its door, where its record lives, and the vendor accounts
  whose administrators count as people in scope. Unknown keys fail strict validation, as `team` does.
- **Completeness is checkable.** For each declared vendor account, the people holding admin or deploy rights are
  compared with the roster by whoever audits (Evidence Desk, a reviewer, the owner); a right held outside the
  roster is a finding. The kit declares the accounts; it does not collect from them.

## What this record extrapolates beyond the owner's words

The owner directed that people act at few, controlled, extremely well specified places. The following are this
author's design, marked so:
- the three doors as the complete list, and chat never counting as a record;
- collapsing release approval onto the tag and environment acts;
- the direction rule, including that a coding-session instruction binds only once recorded;
- a `seams:` section in `config.yaml` and its fields;
- vendor accounts named in the declaration, with completeness checked by an outside reader.

What has run, and where the evidence stops: nothing. The table above is read from this repository's files and
Hookline's live `production` environment (required reviewer and tag branch policy). The platform's records of
pause, resume and key minting are named from the CLI's documentation, not read.

## Order of proof

Each step is a hand-run walk in a World; a step that fails stops the ones after it.
1. The codec validates a `seams:` declaration and refuses an unknown key, an unknown scope or a door outside
   the three.
2. A kit project declares its seams; a release is approved only by tag and environment, and PM's report cites
   those records.
3. Direction given in a session is acted on only after its issue record exists.
4. A synthetic vendor account with an admin outside the roster is reported by a reader of the declaration.

## Alternatives and tradeoffs

- **Keep seams as skill prose.** An agent's judgment is the enforcement, and nothing records the act where an
  outsider can check it: the gap this record closes.
- **A seam engine in the kit.** Refused: the kit declares and the code host, the platform and the harness
  enforce; the constitution keeps Open Autonomy out of workflow engines.
- **Collect vendor administrators in the kit.** Refused here: collection needs vendor credentials the kit
  should not hold; the declaration makes an outside reader's check possible.

## Consequences

- `project-communications` loses release approval by chat reply and gains the direction rule; PRODUCTION.md
  names the tag and environment acts as the release approval.
- `config.yaml` gains `seams:`; the kit's three-way merge carries it like `team`.
- A roster member acts at door (a) only through a verified GitHub account; a Discord-only member can hold
  moderation but cannot act at a seam that needs a commit, and their onboarding records need the same account.
- A kit template that declares its seams and runs Evidence Desk's setup is the out-of-the-box SOC2-ready
  project the owner named; the template follows this record's acceptance.
- A project that declares its seams can hand an auditor its seam list, its records and a completeness check;
  Evidence Desk's `open-autonomy-ingestion` reads the declaration.

## Constitution review (by the author; the independent review follows on the pull request)

- **Authority comes from the repository.** Strengthened: every act that carries authority lands in the
  repository or a native gate it configures.
- **Only the SDK is real; the platform shows, does not steer.** Compatible: the declaration is read, not executed.
- **Nothing in an agent's reach is a secret that matters.** Compatible: vendor accounts are named, never their credentials.
- **Out of scope.** Compatible: no workflow engine; the kit declares, native gates enforce.
