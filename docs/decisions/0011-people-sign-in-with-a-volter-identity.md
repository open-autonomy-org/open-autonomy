# ADR 0011: People sign in with a Volter identity; GitHub stays the repository grant

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
implementation; proposed until both occur.

## Context and sources

Source of authorization: the owner's conversation of September 24, 2026, in the browser-substrate
repository (no public permalink; the quotations record scope, not independent approval). The owner:
"we should have a system of identities where that person can be associated with information
permanently", "I want to shift everything over", "We'll migrate everything EXCEPT runhuman", and,
after the sweep that found this platform, "let's do all of it". The identity service is
volter-ai/identity (its ADR-0001), live at `https://id.volter.ai`: an OpenID Connect provider where a
person proves who they are with GitHub, Google, an emailed code or a passkey, and whose tokens name a
linked GitHub account by its numeric id (`https://volter.ai/github_id`, from the linked account row). The
login it also carries (`https://volter.ai/github_login`) is recorded when the identity is first created
with GitHub and is not refreshed, so it can be stale after a rename and is absent when GitHub was linked
later.

Observed in this repository before the change: `apps/platform/src/give-auth.ts` runs GitHub OAuth for
the giving page and every page's viewer; the session carries the GitHub login and id; the books name a
funder `@<login>` and an account `<owner>/<repo>`; a team edit asks GitHub for `public_repo` and opens a
pull request under the person's token; the grants-pool admin bit is the login's organization role,
read with the platform's own credential.

## Decision

1. Signing in to the platform (the giving page and the viewer on every page) is a Volter sign-in: the
   authorization code with PKCE at the configured issuer (`VOLTER_ISSUER`, `VOLTER_CLIENT_ID`,
   `VOLTER_CLIENT_SECRET`), the verifier kept in the signed state cookie, the code traded with the
   client secret, the issuer's metadata and the id token verified from the issuer's published keys
   (`@volter/identity`).
2. The person is their linked GitHub account, keyed by the token's `github_id`. The login is read from
   GitHub for that id at sign-in (`GET /user/{id}`, with the platform's credential), exactly as the GitHub
   sign-in read it from `/user`, so the books, the session and the grants-pool check name the account's
   current login and nothing on the books changes. The token's `github_login` is not used. A Volter
   identity without a linked GitHub account is told to link one and is not signed in.
3. A team edit keeps GitHub OAuth with `public_repo`: it is a repository grant for one pull request,
   not a sign-in, and asking for it separately keeps the sign-in scope-free.
4. The grants-pool admin bit is unchanged: the login's organization role, read with the platform's
   credential.
5. Without a configured issuer the platform signs in with GitHub as before, so a self-hosted platform
   needs no identity service.
6. Against the Volter identity twin (`packages/twin/volteridentity` in volter-ai/twin), the platform's
   world entry (`apps/platform/world.ts`, given `VOLTER_IDENTITY_TWIN_URL`) registers the platform as a
   confidential client through the service's own admin routes, the way an operator registers a
   product (as `native`: the service admits a loopback http redirect only for native clients, and
   production registers a web client with an https redirect); the operator's sign-in and the people (the funder, linked to the GitHub twin's octocat by
   the id that twin gives it) are seeded through the twin's own doors (`/_twin/login`, `/_twin/people`).
   The scenario World does not start that twin: it is not yet published to the registry the World's
   twins are pinned from, and the scenario needs no sign-in. It joins `world/world.config.json` when a
   published version can be pinned.

## What this record extrapolates beyond the owner's words

The owner ruled that everything moves to the Volter identity. That a person here must have a linked
GitHub account, that team edits keep their own GitHub grant, that the login is read from GitHub by id, and that the
GitHub path remains when no issuer is configured are this record's design, chosen so that no record on
the public books changes.

## Alternatives and tradeoffs

- Name funders by their Volter subject or email: opens giving to people without GitHub, but changes the
  public books' names and publishes email addresses; deferred until the books have a display name of
  their own.
- Keep GitHub OAuth only: leaves this platform the one Volter product with a separate account.
- Ask Volter for repository access: the identity service holds no provider token past sign-in (its
  ADR-0001 §6), so the pull-request grant stays GitHub's.

## Consequences

The platform needs a registered client at `https://id.volter.ai` (redirect
`https://open-autonomy.org/give/callback`) and its secret before a release enables it; until then it
signs in with GitHub. The login lookup reads GitHub as the platform: `GITHUB_TOKEN` where it is set,
otherwise the GitHub OAuth app's own client credentials, never anonymously, since GitHub's anonymous
limit is per address and a Worker's egress is shared (measured at release: the first production sign-in
was refused by the anonymous lookup; production sets no `GITHUB_TOKEN`). Walking it again needs the twins from volter-ai/twin's main (`TWINS_ROOT`), since the pinned
GitHub twin predates its `/user/{id}` answer for octocat. Who a funder is now rests on two parties instead of one: id.volter.ai vouches
that the person controls the identity and which GitHub account it links (its ADR-0001 §2 links a provider
only when it vouches for the email or while the person is signed in), and GitHub names that account's
current login. Walked by hand (the model, GitHub and Volter identity twins from volter-ai/twin's main
and the platform's world entry): the giving page's sign-in reached the twin's sign-in page naming
"Open Autonomy", choosing the octocat person returned "Signed in as @octocat", and a person without a
linked GitHub account was refused with the instruction to link one.

## Constitution review

- Every spend is metered on public books; the ledger's settled cents are the only cost: untouched; no
  spend path changes, and funders keep their GitHub-login names.
- Only the SDK is real; the platform shows, it does not steer: untouched; the change is the platform's
  own sign-in door.
- Authority comes from the repository, not from a key: a sign-in names a person; it grants no bound.
  The trust boundary moves: the identity service, not GitHub's OAuth, now vouches which GitHub account
  is signing in, and that account decides the funder's name and whose organization role is read for the
  grants-pool admin bit. The service can only name an account linked to the identity (by the provider
  vouching for the email or by the person while signed in, its ADR-0001 §2), the role itself still comes
  from the organization, and the login is read from GitHub by the account's id, so a renamed or
  re-registered login cannot be asserted.
- Nothing in an agent's reach is a secret that matters: the client secret is the platform's deployment
  secret, beside its GitHub OAuth secret; no agent sees it.
- No automated tests: none added. The existing smoke test's two expected labels follow the button's
  new wording ("Sign in", since the sign-in is no longer GitHub's alone); no assertion is added.
  Verified by hand in the running product.
- Nothing here develops against a real API: exercised against the Volter identity twin and the GitHub
  twin (whose `GET /user/{account_id}` now knows its own octocat, volter-ai/twin 82f9bc03); the live
  issuer is only configured at release.
