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
| `reviewer` | the arc's one independent review, started by the board |
| `auditor` | finds process drift every hour, and never fixes it |
| `box-maintainer` | keeps one machine healthy; one instance per machine |

## What every profile keeps

- **Hub and spoke.** Workers talk only to the manager, the manager only to the account manager, and only the account
  manager with the principal.
- **The record is the organization's record repository**, written under its own law: rulings, designs, decisions.
  Lasting decisions go in the product repository's `docs/adr/`.
- **Review is the board's.** The dispatcher starts an arc's one review when every task is closed and its PRs are open.
  No profile requests, starts or runs one.
- **Credentials stay in the organization's custody.** Read them where a door needs them; never print or copy them.
- **Commit after every step and push**, so nothing sits only on one machine.
