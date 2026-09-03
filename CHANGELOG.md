# Changelog

## Unreleased

- The project's own agent is a checked-in Hermes home (`hermes/`) running off the project's account on a standing key; the platform forwards to Merge Gateway and the site renders `docs/VISION.md` and `ROADMAP.yml`.
**The repo split.** This repository is now the funding platform (`platform/`, the Cloudflare Worker)
plus this project's own Hermes setup. The `autonomy.ir.v1` descriptor, the substrate compilers, the
install CLI, the profiles and the bench moved with their full history to
[`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).
