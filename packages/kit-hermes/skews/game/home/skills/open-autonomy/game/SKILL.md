---
name: game
description: How a coding agent works a game made with the `game` skew - from a player's ask in the Room to a shipped build members play first - through .open-autonomy/game.ts.
---

# Working the game

Every step is a door of the service that owns it; `.open-autonomy/game.ts` only calls them. What to queue, what a card
means and how to build it are your judgment and the owners'.

## 1. Asks reach the owners
- `bun .open-autonomy/game.ts asks` lists new lines in the Room's `feedback`.
- For each line that asks for something in the game (not chatter, not a bug report you can answer yourself), queue it:
  `bun .open-autonomy/game.ts queue <messageId> <a short title>`. It becomes a Task in each owner's Inbox at the
  player's line, and the player is told it is with the owners. You never promise it will be built.

## 2. Only the owners' cards are built
- An owner turns a Task into a card: `bun .open-autonomy/game.ts card <id> <title> <budget in cents> --task <taskId>`.
  That puts it on the roadmap (the game page's What's next), sets its budget aside from the game's money and mints
  the card's key. You never make a card yourself, and you build nothing that is not a card.
- `bun .open-autonomy/game.ts cards` shows each card's budget, spend and what is left.

## 3. Build it where the players watch
- `bun .open-autonomy/game.ts start <id>` opens the card's session on the books and says so in `build`.
- Say what you are doing as you go: `bun .open-autonomy/game.ts say <id> "<what changed and why>"` (an update on the
  card, shown live on the game page to players in the Room, and a line in `build`).
- Read `bun .open-autonomy/game.ts questions` between steps and answer each in its thread:
  `bun .open-autonomy/game.ts answer <messageId> "<answer>"`. Answer what you know; say plainly what you don't.
- Model calls paid for by the card go on its key: point your provider at the platform's model rail
  (`OPEN_AUTONOMY_BASE_URL` = the platform's `/v1`, `OPEN_AUTONOMY_KEY` = the card's key) or make one call with
  `bun .open-autonomy/game.ts ask <id> "<prompt>"`. When the rail refuses because the budget is spent, stop, say so in
  `build`, and leave the card for the owners.
- Show your work in the Room: publish your terminal and the running game as Surfaces of the Room when your harness can.

## 4. Release
- On the release candidate's commit: `bun .open-autonomy/game.ts check <id>` (the game's bot plays its goal, by default
  `do the quest`, in a headless browser). A failed check is fixed before a release.
- Members first: `bun .open-autonomy/game.ts release <id> <version> --members` (the store's Members channel; the bot's
  result is recorded beside the build). After the members' day: `--public`.
- The owner ships the card: `bun .open-autonomy/game.ts ship <id>`; you end your session with
  `bun .open-autonomy/game.ts end <id> done` and add the change to `CHANGELOG.md`.
