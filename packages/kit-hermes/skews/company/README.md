# __PROJECT__

[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/__ACCOUNT__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

This is a company's install: one board that runs one of the organization's lanes across every project, with cards
tagged by project. `home/` is its agents, in Supercode's native folder: the organization's layer at its root, and a profile for each
job under `home/profiles/`. It runs one lane, named by `lane:` in `.open-autonomy/config.yaml` (`home/lanes.yaml`): the
product lane (account manager, manager, coders, reviewer, auditor, box maintainer, strategy; its board
`home/workflow.yaml`) or the go-to-market lane (GTM manager, coders, reviewer, GTM auditor, blind walker; its board
`home/workflow.gtm.yaml`). `.open-autonomy/` is its connection to the platform; its start runs the agents and the board, and nothing
else does. `bun .open-autonomy/usage.ts --publish` is the owner's usage statement: each project's usage and the
organization's overhead (its sessions serving no card) as its own line.

Made with the Open Autonomy IR kit, company skew (docs/decisions/0017); `create-open-autonomy check .` says whether the
kit's files are current.
