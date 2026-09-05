# The constitution of lexicon

What this project is and must remain. No task may violate an invariant, and no change may enter what is out of
scope; the review holds every diff to this file.

## What it is

A shared glossary that its community writes through the project's agent: terms proposed in the repository's
issues and discussions and in its Discord channel, added by the agent, rendered to the homepage. The north star:
a community can grow a vocabulary together without anyone but the agent touching the repository.

## Invariants

- A term is defined once. A second definition of a term is a correction to the first, never a duplicate.
- Every term carries its definition and, when one was given, its source.
- The homepage is rendered from `lexicon.json` and nothing else; `docs/index.html` is never edited by hand.
- A community request becomes a board task only when it fits this file; the agent tells the requester what it
  filed or why it did not, where they asked.
- Everything the agent says in public is a published session. It never speaks for the owner, never promises a
  date, never asks for money or keys.
- `bun run check` finishes in under thirty seconds, and a test guards an invariant of this file or is not written.

## Out of scope

- Accounts, logins, or any store of who said what beyond what GitHub and Discord already keep.
- A backend. The homepage is static; the glossary is a file.
- Moderation beyond declining what does not fit this file.
