# __PROJECT__

<!-- The front door (hermes/skills/open-autonomy/front-door). The setup agent replaces each slot below; every
     change that alters what a user sees or does keeps it true. -->

**One line saying what __PROJECT__ is: the same line as the repository description.**

<!-- The product itself, shown: a screenshot, an animated capture or a terminal recording of the real product
     doing its main job, from docs/media/, with alt text. -->

Who it is for and why, in two to four plain lines.

## Quick start

What it needs first, then the shortest real path from nothing to a first success; every command works as
written, on a fresh setup.

```bash
# the first command
```

## What it does

- The main capabilities, a line or two each, shown where showing is clearer.

## Getting help

Where to ask, and where to report a security problem.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md); the license is in [LICENSE](LICENSE).

## Built in the open

[![funding](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/runway.svg)](https://open-autonomy.org/__ACCOUNT__)
[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/__ACCOUNT__)
[![roadmap](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/roadmap.svg)](https://open-autonomy.org/__ACCOUNT__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

__PROJECT__ builds itself, funded through [Open Autonomy](https://open-autonomy.org/__ACCOUNT__), where every
session it works, every cent it spends and everything it ships is public. `CONSTITUTION.md` says what it is and
must remain, `ROADMAP.md` what is planned, `CHANGELOG.md` what shipped, `CONTRIBUTING.md` how code is written
here; `AGENTS.md` and `hermes/` are its agent, `.open-autonomy/` its connection to the platform.

To run the agent, start with the [agent-led setup guide](.open-autonomy/SETUP.md):

```bash
create-open-autonomy setup . --plan             # inspect after agreeing the development connections
bun .open-autonomy/start.ts                    # the valve, the reporter and the agent; container/ for a real setup
```

Each develop agent verifies its feature by using it and reports what it observed; automated tests are banned
(`CONSTITUTION.md`, `CONTRIBUTING.md`). Human release review remains required. Made with the Open Autonomy
Hermes kit; `create-open-autonomy check .` says whether the kit's files are current.
