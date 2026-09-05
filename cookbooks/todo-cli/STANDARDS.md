# todo-cli — coding standards

The bar every change is reviewed against. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun. `bun run check` is the definition of green and runs in seconds.
- **Shape.** Small modules with one job each, named for what they hold. No layer that exists only to forward.
- **Tests.** A test proves an acceptance line or guards a bug that happened. No tests for their own sake, no
  mocks of our own code, no fixtures larger than the thing they test.
- **Errors.** Fail loudly with the cause in the message. No silent fallbacks.
- **Docs.** A file's header says what it is for. The README says how to run it. Nothing else is documented twice.
- **Dependencies.** Add one only when writing it would be more code than reading it. Pin what you add.
- **History.** One change per commit, the task id first in the subject, signed as the agent.
