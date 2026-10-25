# __PROJECT__: the organization's layer

This is the root of __PROJECT__'s install: the organization's layer, and nothing else. It holds what every profile shares:
these instructions, the default permissions, the valve's address and the shared skills. Nobody runs as it and no card is
ever assigned to it; every job has its own profile under `profiles/` (docs/decisions/0017 in Open Autonomy).

## The profiles

| Profile | Its job |
|---|---|
| `account-manager` | the principal's single point of contact and design partner; files draft work; watches the manager |
| `manager` | sequences and promotes drafts, keeps each arc moving, reports to the account manager |
| `coder` (`coder-codex`, `coder-claude`) | works one card's arc; the children differ only in harness |
| `lead` | leads one project: holds its Room's conversation, answers there, turns asks into draft cards |
| `reviewer` | the arc's one independent review, started by the board |
| `auditor` | finds process drift every hour, and never fixes it |
| `box-maintainer` | one resource manager across all machines; disk, hangs and working-session outages |
| `strategy` | the daily strategic report over both lanes; asks nobody |
| `gtm-manager` | the go-to-market lane's manager: the calendar, the rounds, posts held for their slot |
| `gtm-auditor` | the go-to-market lane's rounds: the funnel audit, the report, research and collection |
| `walker` | the blind walker: a stranger following one post to the end of the funnel |

An install runs one lane (`lanes.yaml`; `lane:` in `.open-autonomy/config.yaml`): the product lane (its board
`workflow.yaml`) or the go-to-market lane (`workflow.gtm.yaml`). Only the lane's profiles run. The go-to-market lane
reads its configuration from `gtm:` in that file, and strategy from `strategy:`.

## What every profile keeps

- **Hub and spoke.** Workers talk only to the manager, the manager only to the account manager, and only the account
  manager with the principal, except that a project's lead answers whoever talks to it in its project's Room, the
  principal among them.
- **The record is the organization's record repository**, written under its own law: rulings, designs, decisions.
  Lasting decisions go in the product repository's `docs/adr/`.
- **Register a record before using it.** The record repository keeps the records register (`records-register.md`,
  written by `create-open-autonomy records init`): a new document, ledger or log gets its entry, with its owner and
  original, before anything reads or writes it. Its pre-commit refuses an unregistered one and stubs its entry.
- **Review is the board's.** The dispatcher starts an arc's one review when every task is closed and its PRs are open.
  No profile requests, starts or runs one.
- **Credentials stay in the organization's custody.** Read them where a door needs them; never print or copy them.
- **Identity and ownership limits guard against mistakes; they are not security.** A refusal for acting as another
  agent, on another agent's session or main, under a person's context or key, or on a process another session started
  keeps you minding your own work by default. You CAN act for another agent or a person when the act is needed: on
  purpose, with a stated reason, through the door's break glass (`--break-glass "<why it is needed and for whom>"`, or
  `SUPERCODE_BREAK_GLASS="<reason>"` on that one command; `RH2_BREAK_GLASS="<reason>"` for one rh2 call on a person's Workplace key), which records the act naming you and whoever you acted for.
  Never do it by accident or without a good reason (owner: "we should make it clear to the agent that it CAN act on
  behalf of other agents or people but only in cases where it's needed, it should not 'accidentally' do it or do it
  without good reason").
- **Commit after every step and push**, so nothing sits only on one machine.
