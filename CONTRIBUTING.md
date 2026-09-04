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
