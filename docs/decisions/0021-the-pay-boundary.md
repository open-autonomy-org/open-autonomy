# ADR 0021: The pay boundary is the treasurer's own executor

Status: Proposed; accepted only after independent constitution review and merge.

## Context and sources

The constitution says "a treasurer's key alone may pay". Card `t_80d67235` asks for a stronger guarantee. In every
install, the developer profile and every other non-treasurer profile must be unable to read the paying key
(`treasurer.env`) or the treasurer's valve credential, and unable to pay through the valve.

- Measured on the live open-autonomy install (manager evidence `m-6e061306`): every process runs as one macOS user and
  none uses `--as`, so the developer profile can read `~/.config/open-autonomy/treasurer.env`.
- The valve's caller credential ([#846](https://github.com/open-autonomy-org/open-autonomy/pull/846)) closes
  the pay port to other loopback callers. The credential still sits in the treasurer profile's `.env`, which the
  same user can read.
- Read from the code (manager evidence `m-8da1d5ad`, not measured): container mode as built ran every profile as one
  user on one `/opt/data` volume. The treasurer's `.env` was therefore readable from the developer's shell.
- The manager ruled (D85) that no new macOS user is created, since that is an admin act on the owner's machine. The
  boundary is the kit's container mode, and the live install moves to it.

## Decision

**Where the pay authority is.** It has two parts. `treasurer.env` is the paying key, held in the host's credential
directory and read only by the host's valve. The pay port's caller credential is minted on every start and given
to the valve and to the treasurer alone. Paying takes both: the valve holds the key, and the port answers only a
request that presents the credential.

**Container mode: the treasurer's own executor.** A project's runtime runs two executors from one image:

- `oa-<project>` runs every profile except the treasurer. It mounts the agent's home (`/opt/data`) and checkout. Its home
  has no `profiles/treasurer`, its environment has no `OPEN_AUTONOMY_PAY_URL`, and it never holds the credential.
- `oa-<project>-treasurer` runs the treasurer alone. It mounts its own home volume (`oa-<project>-treasurer`) at
  `/opt/data`, and the agent's home volume at `/opt/board` for the shared board only. It has no checkout. The credential
  is written only into its treasurer profile's `.env`.

No host credential directory or Docker socket is mounted into either executor, so neither can reach the other's
volume. The developer's executor reaches the valve's pay port over the network, but it has no credential to present.

**What crosses is data.** The board is Hermes's `kanban.db`, shared through the agent's volume:

- The developer files a purchase request as a task assigned to `treasurer`. On its side, Hermes skips an assignee
  that is no profile of the home, because such a lane is served elsewhere.
- In the treasurer's executor, a kit process runs Hermes's own dispatch tick, spawning only the treasurer lane.
  A claim names its host, so neither dispatcher reaps the other's workers.
- Every treasurer task runs in the treasurer's own workspace and logs into the treasurer's own home, whatever
  workspace the request names. A worktree there would run the developer's Git hooks. A log on the board's volume
  would put the treasurer's transcript, including a card's number, where the developer reads.
- A request cannot choose the treasurer's model or provider.

**What the treasurer is comes from the host.** Its persona and its profile setup (`.open-autonomy/agent.json`) come
from the host's own copy of the kit, the runtime release cut from a landed revision. They never come from the
developer's checkout. The treasurer's model setup names the endpoint and the credential the treasurer presents, so
a checkout the developer can rewrite would otherwise hand the developer the credential.

**Bare mode is not a boundary, so it serves no pay port.** All bare processes run as one OS user, so nothing in a
bare start can keep a profile away from the key. A bare start serves `treasurer.env` only with `--rehearsal`, which
means a World whose keys are twins. The World's launcher passes it.

**Every other mode.**
- A fleet opens no treasurer door, as before (`fleet.ts`).
- A container install whose harness is not Hermes (Codex, run by the orchestrator) gets the same treasurer executor.
  There the treasurer is Hermes's own worker on Hermes's own tick, whatever the project picked:
  - Under the orchestrator the board is still Hermes's `kanban.db`.
  - The orchestrator's dispatcher skips a profile that is no lane of its home.
  - To the orchestrator, a card claimed by Hermes's tick with no session of its own is "another implementation's
    claim", which it leaves to the claim's expiry (`board/dispatch.mjs`). Hermes's heartbeat keeps that claim current.
  - The orchestrator's own worker command would open its own home's board, not the shared one.
- A runtime cut before this decision has no treasurer executor. Its start serves no pay port and names the step
  that adds one: `create-open-autonomy runtime`.

## Alternatives and tradeoffs

- **A separate macOS user for the agent (`--as`).** This is an admin act on the owner's Mac, refused in D85. It also
  leaves every profile, the treasurer included, as one user.
- **Seatbelt (`sandbox-exec`) around the bare developer.** The developer needs Docker for its World. Any Docker or
  colima VM that the same user runs, and that mounts the user's home, reads `treasurer.env` outside the sandbox. So
  does launchd, through `launchctl submit`. The escape surface is the whole user account.
- **The treasurer in its own executor, with the developer bare on the host.** The bare developer reads the host's
  credential directory and holds the Docker socket into every container.
- **A relay through the host between two separate boards.** This changes the treasurer's protocol and the World
  scenario. Sharing Hermes's board as data, with a single-lane dispatcher, keeps both unchanged.
- **One executor with a second container user for the treasurer.** The developer's dispatcher would spawn the
  treasurer's worker, and it cannot change user under `no-new-privileges`.

Costs:
- A second container, 768 MiB by default.
- The treasurer's sessions stay in its own volume, and the agent's reporter does not publish them.
- The treasurer persona follows the runtime release, not each landed main.
- The treasurer's dispatcher replaces three of Hermes's functions in its own process: workspace, worktree and log
  directory. They are pinned to the image's Hermes (`container/hermes.pin`).
- In a project whose harness is Codex, the treasurer alone runs on Hermes. Its model is unchanged. The owner's pick
  still holds for every profile that can reach no pay authority.

## Where the evidence stops

These are measured: one user on the live install (`m-6e061306`), and the caller credential refusing other callers
(#846). Everything else above is design, read from Hermes's dispatcher at the pinned version:
- Hermes skips a non-profile assignee.
- A claim names its host, and crash detection checks only claims from its own host.
- The dispatch lock is shared beside `kanban.db`.
- Under the orchestrator, another implementation's claim is left to its expiry (orchestrator 0.5.1
  `board/dispatch.mjs`). Hookline's board is Hermes's sqlite `kanban.db`. A Codex-harness install has not been
  measured with the treasurer's executor.

The card's run measures the boundary on the live install, from the developer's executor.

Not covered:
- A misled treasurer. It is a model reading text the developer wrote, so a request can try to talk it into paying or
  into printing its credential. The owner's bounds on the rails limit what it can pay.
- A crafted SQLite file that the developer leaves as the board.

## Consequences

- `container/executor.ts` gains `up|status|down treasurer`, and `create-open-autonomy runtime` writes both services
  and the treasurer's volume. The release carries the treasurer's persona.
- `container.ts` seats the treasurer, and `container-treasurer.ts` holds its home and dispatcher. The agent's home
  is prepared without the treasurer.
- `start.ts` serves no pay port without `--rehearsal`.
- Amends [ADR 0001](0001-runtime-boundary.md) (one executor per installation becomes two for a paying project) and
  the container guide. Supersedes nothing.

## Constitution review (author analysis; independent verdict required)

- **A treasurer's key alone may pay; nothing in a public agent's reach is a secret that matters.** The paying key and
  its credential leave the developer's reach in every install that pays. Bare mode stops paying instead of
  pretending to be a boundary.
- **Every spend is metered on public books.** Nothing changes about the rails. The treasurer still pays through the
  valve onto the same books.
- **The kit renders its brain for the harness the owner picks and never implements one.** The treasurer's
  dispatcher is Hermes's own tick, scoped to one lane. It adds no scheduler of its own. A project that picks Codex
  keeps it for every profile that cannot pay. The treasurer runs as the stock Hermes worker that dispatcher spawns,
  which is a harness, not one the kit implements. This departure from the owner's pick is the author's design, and the
  independent review weighs it.
- **No automated tests; nothing develops against a real API.** The proof is a manual reading on the live install,
  taken from the developer's executor, plus the World's rehearsal.
