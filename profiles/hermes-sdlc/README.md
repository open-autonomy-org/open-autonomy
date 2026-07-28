# hermes-sdlc

A software-delivery loop expressed as `autonomy.ir.v1`, compiled onto a **native Hermes substrate**: Hermes'
own kanban kernel IS the board, its dispatched workers ARE the launched sessions, and its standing profiles
are the orchestrators. `simple-sdlc` is the sibling profile for the `local` substrate; this one is not
portable to it (see `ir.yml`'s `targets:` comment — its doctrine states things that are false on `local`).

| actor | fired as | does |
|---|---|---|
| `pm` | cron (standing) | **Intake + integration.** Decides what ENTERS the board — applying the risk, allowlist and body-deferral fences no kernel has an opinion about — and merges reviewed branches to trunk. It does **not** schedule: the kernel owns eligibility, WIP, leases, timeouts and termination. |
| `draft` | dispatch | Shapes an untriaged request into a verifiable Ready issue. Tracker only, never the working tree. |
| `develop` | dispatch | Implements one Ready issue in its **own git worktree** and produces commit-backed evidence for each AC. |
| `review` | dispatch (auto) | Verifies one proposal and returns a verdict. Opened automatically as a linked child card at the proposal's launch — nobody has to remember to request review. |
| `audit` | dispatch + cron | Conformance auditor of the install. |
| `maintainer` | — | `kind: human`. Gets **no profile**: a person is not something a dispatcher can spawn. Reached through Hermes' own seam — a worker calls `kanban_block(kind="needs_input")` and the card waits for a real operator's `kanban unblock`. |

## The two planes

Kanban owns **dispatch** (board, WIP, leases, worktrees, the review edge). `ztrack` owns **verification**
(issues, acceptance criteria, commit-backed proof). A card is a *run of* an issue, never the issue — which
is why `kanban.db` is disposable and `.volter/tracker/` is not. They meet in exactly two thin places: a
branch name and an exit code. Neither reads the other's storage.

`develop` runs behind a **done-gate**: a Hermes `pre_tool_call` hook refuses `kanban_complete` until
`ztrack check` is green, so "done" is unreachable rather than merely discouraged. Read
`hermes/README.md` in a compiled install for what is gated, what is not, and why.

## Compile

```sh
open-autonomy compile hermes-sdlc hermes <repo>
HERMES_HOME=~/.hermes <hermes-venv>/bin/python <repo>/hermes/install.py
```

The installer prints what it armed, which actors are gated, which are **not** (and what that costs), and the
model every profile inherits. Read its output — it is the honest receipt.
