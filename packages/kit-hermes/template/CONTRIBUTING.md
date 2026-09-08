# Contributing to __PROJECT__

How code is written here, for people and for the agent alike. The bar every diff is reviewed against, beside
the constitution's invariants. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun. `bun run check` is the definition of green and runs in seconds.
- **Shape.** Small modules with one job each, named for what they hold. No layer that exists only to forward.
- **Thirty seconds, total, forever.** `bun run check` is every test and typecheck there is, and it must finish in
  under thirty seconds. A test guards an invariant of the constitution or it is not written; behavior is verified by
  driving the running system. Test cruft compounds, because every agent that follows writes more of it.
- **Errors.** Fail loudly with the cause in the message. No silent fallbacks.
- **Docs.** Keep durable project documentation, maintained in place; no rehearsal journals, session reports
  or temporary planning documents. Put change-specific verification evidence in the PR. A file's header says
  what it is for. The README says how to run it. Nothing else is documented twice.
- **Dependencies.** Add one only when writing it would be more code than reading it. Pin what you add.
- **History.** One change per commit, the task id first in the subject, signed as the agent.
