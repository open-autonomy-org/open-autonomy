# Contributing

- `platform/` is the Cloudflare Worker: run `bun run check` from the repo root before pushing.
- `hermes/` is this project's own agent setup. Changes there are what the agent will do next, so
  keep them readable; the site renders them.
- Deploys are tag-gated (`deploy-v*`); a pushed commit does not deploy anything.
- Sign off commits (`git commit -s`, DCO). Never commit secrets; the worker's secrets live in
  Cloudflare and `.dev.vars` is git-ignored.
