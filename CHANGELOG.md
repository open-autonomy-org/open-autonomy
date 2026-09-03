# Changelog

## Unreleased

- `per-call-audit`: every metered model call is appended durably to the account's audit trail and served publicly at `/v1/accounts/:id/calls` (newest first, cursor-paginated); the project page links to it.
- `token-only-books`: the platform meters model calls and nothing else — the supplier debit API, the GitHub OIDC mint/exchange paths, project-to-project redistribution and the planner-label roadmap rollup are gone; a roadmap item's state is the `status` written in `ROADMAP.yml`.
- `fund-and-show`: the funding site renders the project's vision and roadmap from the repo, sponsor money lands in the account and every model call is metered against it, and the README runway widget shows the live balance and runway.
- The project's own agent is a checked-in Hermes home (`hermes/`) running off the project's account on a standing key; the platform forwards to Merge Gateway and the site renders `docs/VISION.md` and `ROADMAP.yml`.
**The repo split.** This repository is now the funding platform (`platform/`, the Cloudflare Worker)
plus this project's own Hermes setup. The `autonomy.ir.v1` descriptor, the substrate compilers, the
install CLI, the profiles and the bench moved with their full history to
[`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).
