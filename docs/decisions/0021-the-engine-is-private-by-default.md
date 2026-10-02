# ADR 0021: The engine is private by default; a deployment names its audience

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its implementation;
proposed until both occur. It rests on the constitution's clarification in #857, which lands on the owner's approval.

## Context and sources

**Authorization.** The owner's coding conversation of October 2, 2026:
- "open autonomy is for self running public tech, but we also have volter autonomy which is for the private deployment
  of open autonomy. The issue is that open autonomy the platform is mixing the two purposes";
- "should we reorient to remove the public by default";
- "we need to make it clear that the 'public' part of open autonomy is the platform - the actual core autonomy engine
  runs private by default but can easily be configured to be public as it is on our platform";
- "what changes have to happen in the code? Let's do it".

**What exists** (`origin/main` at d5576c9b):
- `packages/backend/src/page/model.ts`: `DEFAULT_PRESET = 'roadmap'`, the books and the roadmap to everyone, in the
  engine itself; a deployment had no word on who it shows to.
- The `private` preset (`books: 'team'`) and `status` (`books: 'giver'`) let a project's committed word close its books
  on the public platform, against "every spend is metered on public books".
- `apps/self-host/README.md` ("Who may look"): "The worker holds no notion of a viewer; that is the edge's job." Volter's
  tenants (volter-ai/volter-autonomy) mount `worker()` bare behind Cloudflare Access with `visibility: private`; their
  privacy is the edge's alone, and the engine would show everything to a request that reached it another way.
- #857 clarifies the constitution: the invariants bind the engine wherever it runs, "public" means the deployment's
  audience, private is the engine's default, and a project's committed word narrows what its deployment shows, never
  widens it.

## Decision

**A deployment names its audience** (`AUDIENCE`, `packages/backend/src/audience.ts`). Unset, nobody: the pages and the
read doors show nothing, and a project is read through its own key, its org's key or a roster seat. `public`: everyone;
the platform names it. `access`: whoever Cloudflare Access admitted on the hostname, proved by Access's signed token
(its header, or its `CF_Authorization` cookie on the paths Access bypasses) against `ACCESS_TEAM_DOMAIN` and
`ACCESS_AUD`; a header alone admits nobody.

**The `public` role is the deployment's audience.** Every door that showed `public` panels (the front, a name, a
project's pages, card and feed, `/v1/accounts/*`, `/v1/orgs/*`, `/v1/funders/*`) shows them only inside the audience.
Roster seats, project keys and org keys are unchanged.

**The owner's word narrows within the audience.** Presets: `roadmap` (default) and `open`, then a role per panel.
`books` and `calls` are the audience's under every word. A word that closes them, or that the parser does not know, is
refused: the project is shown to its team alone and the team's dashboard says why. Nothing an owner had closed is
published by this change.

## Alternatives and tradeoffs

- **Keep public as the engine's default and let private deployments close it with the word.** Rejected: a missing or
  mistyped line in a client's repository would publish its books, and the engine would contradict #857.
- **Clamp a word that closes the books up to the audience.** Rejected for the platform: it would publish books their
  owners had closed, without their consent. Refusal shows them to the team until the owner chooses.
- **Leave privacy to the edge alone.** Rejected: the edge guards one hostname; the engine is reachable through others
  (`workers.dev`, a route without Access), and the read doors Access bypasses would answer anyone.
- **An identity per Access viewer** (email as a `Viewer`). Deferred: the audience is enough for a client's window;
  roles inside it still come from the roster and the platform's sign-in.

## Consequences

- The platform (`AUDIENCE = "public"`) reads as before, except projects whose word closed their books or named
  `status`/`private`: team-only until their owners commit a word that holds.
- A self-host with no `AUDIENCE` shows nothing to strangers; its README says how to name one.
- Volter's tenants stay as closed as they were; to give a client its window a tenant names `AUDIENCE = "access"` with
  its Access application's team domain and audience tag, and its word becomes `roadmap`.

## Constitution review

- **"Every spend is metered on public books"**, with "public" read as the deployment's audience (#857): the books and
  every metered call can no longer be closed below the audience by any word; a word that tries is refused.
- **"Authority comes from the repository, not from a key"** and "a project's committed word narrows what its deployment
  shows, never widens it": the word's roles are within the audience the deployment names; no key or word widens it.
- **"Nothing in a public agent's reach is a secret that matters"**: unchanged; a private deployment's audience is that
  agent's audience.
- **"The engine shows; it does not steer"**: the gate decides what is shown, never what an agent does.
