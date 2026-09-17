# __PROJECT__

[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/__ACCOUNT__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

This is an organization's repository: its projects are its executors. Its Hermes agent gathers every
project once a day, posts a memo with the agenda into the organization's channel, records the meeting's
outcomes here, and carries each outcome down to the project it touches as a request in that project's
intake. `hermes/` is the agent; `.open-autonomy/` is its connection to the platform, with
`organization.projects` naming what it gathers.

Made with the Open Autonomy Hermes kit, manage-organization skew; `create-open-autonomy check .` says
whether the kit's files are current.
