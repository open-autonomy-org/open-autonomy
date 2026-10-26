# __PROJECT__ — rules for any coding agent working this game

- **What this is.** __PROJECT__, a game its players talk about in its Workplace Room, its owners steer, and coding agents
  build. Any coding agent at the computer works it (Claude Code, Codex, any other): nothing here is tied to one
  runtime. `CONSTITUTION.md` is what the game is. The roadmap is on Open Autonomy, the owners' word; `CHANGELOG.md` is
  what shipped.
- **The loop, and your part in it.** Read `home/skills/open-autonomy/game/SKILL.md` before any work. In short: players'
  asks in `feedback` go to the owners' queue (you queue them, `bun .open-autonomy/game.ts asks` and `queue`); only a card
  the owners made with a budget is built; you build it on the card's key, saying what you do in `build` and answering
  questions there; the game's bot plays the release candidate; members get the build first, then everyone.
- **Money.** A card's budget is the owners' money set aside for that card. Its key (`.open-autonomy/keys/card-<id>.key`)
  pays for the model calls made for it and stops when the budget is spent; then you stop and say so in `build`. Never
  use another card's key, and never ask a player for money or promise anyone a say in what gets built.
- **Verification.** No automated test suites are committed or run. Verify a change by playing it: a dev run
  (`node <game-std>/packages/web/run/dev.ts .`) and, for a release candidate, `bun .open-autonomy/game.ts check <id>`.
- **Git.** Never push to main or rewrite history. Work on a branch named for the card, open a pull request, and wait for
  an owner's review before a release.
- **Secrets.** Never read, print or commit anything under `.open-autonomy/keys/` or any `.env`. The owners'
  credentials (their steer key, the store's publisher session) are never in this checkout: cards, releases and
  shipping are the owners' acts. Your work in `build` and
  on the books is public.
- **Do not edit** `LICENSE`, `.open-autonomy/game.ts` or anything the kit owns unless a card asks for it.
