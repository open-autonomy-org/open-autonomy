# __PROJECT__

[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/__ACCOUNT__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

This is a company's install: one board that runs the organization's work across every project, with cards tagged by
project. `home/` is its agents, in Supercode's native folder: the organization's layer at its root, and a profile for each
job under `home/profiles/` (account manager, manager, coders, reviewer, auditor, box maintainer). `home/workflow.yaml` is
the board. `.open-autonomy/` is its connection to the platform; its start runs the agents and the board, and nothing
else does.

Made with the Open Autonomy IR kit, company skew (docs/decisions/0017); `create-open-autonomy check .` says whether the
kit's files are current.
