# Contributing

- `platform/` is the Cloudflare Worker: run `bun run check` from the repo root before pushing. For an end-to-end
  run of the real stack with no tokens (the real `hermes`, this worker, twin vendors), see `cookbook/open-autonomy-world`
  in the sibling `twin` repository.
- `hermes/` is this project's own agent setup. Changes there are what the agent will do next, so
  keep them readable; the site renders them.
- Nothing pushes to `main`. Push a `land/<topic>` branch (the agent uses `agent/<item>`): `land.yml` opens the
  pull request and it merges when the required `ci` and `security` checks pass.
- A pushed commit does not deploy anything. Deploys and admin operations go through GitHub workflows gated by
  the `production` environment's reviewer (`platform/DEPLOY.md`).
- Sign off commits (`git commit -s`, DCO). Never commit secrets; the worker's secrets live in
  Cloudflare and `.dev.vars` is git-ignored.
