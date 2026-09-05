# __PROJECT__

[![funding](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/runway.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![now](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/now.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![roadmap](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/roadmap.svg)](https://open-autonomy.org/p/__ACCOUNT_ENC__)
[![activity](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/activity.svg)](https://open-autonomy.org/v1/accounts/__ACCOUNT_ENC__/calls)

This project builds itself. Its agent, a checked-in Hermes home under `hermes/`, works its board top to
bottom, funded through [Open Autonomy](https://open-autonomy.org/p/__ACCOUNT_ENC__), where
every session it works, every cent it spends and everything it ships is public.

- `CONSTITUTION.md` says what the project is and must remain; the agent's board says what gets built, in order; `CONTRIBUTING.md` is how code is written here, the bar every change is reviewed against.
- `AGENTS.md` is the agent's rules for this repository; `hermes/` is the agent.
- `.open-autonomy/` is the project's connection to the platform: its config, the reporter that publishes
  the agent's sessions, and the record of the kit that made this repository.
- `.open-autonomy/start.ts` starts it: the valve that holds the project's keys, the reporter, the Hermes gateway;
  `container/` runs the same script as a container's entrypoint, for a real setup.

```bash
bun run check                                  # the project's own definition of green
bun .open-autonomy/mint-key.ts                 # prove control of this repository, get the project's key
bun .open-autonomy/start.ts                    # the agent, here, as you (container/README.md for the container)
```

Made with the Open Autonomy Hermes kit; `create-open-autonomy check .` says whether the kit's files are current.
