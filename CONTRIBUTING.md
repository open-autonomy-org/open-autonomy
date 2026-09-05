# Contributing

- `bun run check` from the repository root runs every package's tests and typecheck, the kit's check on the
  cookbook, and the cookbook's own check. Run it before pushing.
- The world is where a change is proven with no keys: `TWINS_ROOT=/path/to/twin bun world/run.ts check`
  (`world/README.md`). Run it before anything that touches metering, keys, the stream, the docs sync or the kit.
- Nothing pushes to `main`. Push a `land/<topic>` branch; the landing workflow opens the pull request and
  auto-merge lands it when `ci` and `security` pass. The agent's own work lands from `agent/<item>` the same way.
- Deploys and admin operations go through GitHub workflows gated on the `production` environment's reviewer
  (`apps/platform/DEPLOY.md`). No machine holds a deploy or admin token.
- `hermes/`, `container/` and `.open-autonomy/` in this repository come from the Hermes kit
  (`create-open-autonomy upgrade .`); a kit change is made in `packages/kit-hermes/template` and applied.

## How code is written

The bar every diff is reviewed against, beside the constitution's invariants. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun everywhere; the worker on Cloudflare. `bun run check` is the definition of green.
- **Shape.** Small modules with one job each, named for what they hold; a file's header says what it is for. No layer that only forwards.
- **Tests are smoke tests.** One per surface, end to end through the worker, saying a change broke the surface, not why; one line each for the security claims. The world gate is the proof. Do not grow the suites; grow the world.
- **Errors.** Fail loudly with the cause in the message, and say what was needed against what was available. No silent fallbacks.
- **Money.** The ledger's settled cents are the only cost; never a client-side estimate. Security-critical paths get the higher bar.
- **Docs.** Nothing documented twice; `bun scripts/check-docs.ts` holds every doc to paths and routes that exist.
- **Dependencies.** Add one only when writing it would be more code than reading it. Pin what you add.
- **History.** One change per commit, the task id first in the subject, signed as the agent.
