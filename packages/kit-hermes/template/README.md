# __PROJECT__

[![funding](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/runway.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![roadmap](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/roadmap.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

This project builds itself. Its Hermes PM reconciles `ROADMAP.md` and queues work for the fleet,
funded through [Open Autonomy](https://open-autonomy.org/p/__ACCOUNT_ENC__), where
every session it works, every cent it spends and everything it ships is public.

- `CONSTITUTION.md` says what the project is and must remain; `ROADMAP.md` holds sourced plans and outstanding outcomes, and the board holds fleet execution; `CONTRIBUTING.md` is how code is written here, the bar every change is reviewed against.
- `AGENTS.md` is the agent's rules for this repository; `hermes/` is the agent.
- `.open-autonomy/` is the project's connection to the platform: its config, the reporter that publishes
  the agent's sessions, and the record of the kit that made this repository.
- `.open-autonomy/start.ts` starts it: the valve that holds the project's keys, the reporter, the Hermes gateway;
  `container/` runs the same script as a container's entrypoint, for a real setup.

```bash
create-open-autonomy setup . --plan             # inspect after agreeing the development connections
bun install                                    # first setup: install dependencies and commit the generated lockfile
bun run check                                  # the project's own definition of green; inside its world when configured
```

Start with the [agent-led setup guide](.open-autonomy/SETUP.md): establish the project brief, accept or
adjust the operating defaults, and complete real development connections through guided browser setup.
Application dependencies use the local world; their live credentials wait until deployment or activation.
Human release review remains required. The setup command alone does not complete activation.

Made with the Open Autonomy Hermes kit; `create-open-autonomy check .` says whether the kit's files are current.

The setup agent prepares a provisional project identity in [branding](branding/README.md): a name,
short blurb and reusable icon for project integrations. Existing branding and application IDs are preserved.
