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
- Community requests are sourced input to `ROADMAP.md`. The owner sets direction; Hermes PM reconciles
  the plan and queues fleet work within this constitution. Human implementation commitments require
  acceptance, and releases require human review.
- Everything the agent says in public is a published session. It never speaks for the owner, never promises a
  date, never asks for money or keys.
- **No automated tests.** Automated tests accumulate permanent code and maintenance obligations. As agents
  add more, that cruft compounds until maintaining tests can make progress in the repository impossible.
  Do not write or run automated tests. No automated test code or persistent test harness may be committed
  to main. Each develop agent must verify the feature it adds or changes through REPL-style manual usage
  of the running product, inspecting actual results without writing permanent test code. Record the
  actions, observations and limitations in the task handoff or PR, not a new test file.

## Out of scope

- Accounts, logins, or any store of who said what beyond what GitHub and Discord already keep.
- A backend. The homepage is static; the glossary is a file.
- Moderation beyond declining what does not fit this file.
