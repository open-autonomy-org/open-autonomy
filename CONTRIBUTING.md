# Contributing

- `platform/` is the Cloudflare Worker: run `bun run check` from the repo root before pushing. For an end-to-end
  run of the real stack with no tokens (the real `hermes`, this worker, twin vendors), see `cookbook/open-autonomy-world`
  in the sibling `twin` repository.
- `hermes/` is this project's own agent setup. Changes there are what the agent will do next, so
  keep them readable; the site renders them.
- A pushed commit does not deploy anything. Maintainers deploy with `bunx wrangler deploy` from `platform/`;
  the reviewed path is a `deploy-v*` tag through the `production` environment (`platform/DEPLOY.md`).
- Sign off commits (`git commit -s`, DCO). Never commit secrets; the worker's secrets live in
  Cloudflare and `.dev.vars` is git-ignored.
