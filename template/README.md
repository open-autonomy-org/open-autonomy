# The template: a project's agent, checked in

This is the product. A Hermes home any project drops into its repository as `hermes/`, plus the container
stack that runs it without holding a secret, plus the tool that mints its key. Applied to a repository, it
gives that project an agent that works its `ROADMAP.yml` top to bottom, month after month, paid for by the
project's sponsors through the Open Autonomy platform — and readable by anyone, because it is all in git.

```text
template/home/        the Hermes home: SOUL, the build-roadmap skill, the schedule seed, config, hooks
template/container/   how it runs: two containers (the agent, the key sidecar), a pinned Hermes
template/sidecar/     the key sidecar: holds the standing key, forwards model calls, narrates runs as receipts
template/mint-key.ts  mint the project's standing key the adopter way (a claim file, no admin token)
template/apply.ts     copy home/ into a repository's hermes/, and check it has not drifted
```

## Adopt it

```bash
# 1. the home, into your repository
bun template/apply.ts /path/to/your/repo         # writes your-repo/hermes/ ; commit it
# 2. the rules the agent reads first, and the roadmap it works
#    your-repo/AGENTS.md  — how your project is checked and where it is verified
#    your-repo/ROADMAP.yml — items with acceptance lines the agent can make true
# 3. the key: prove control of the repository, get a standing key, no account needed
cd /path/to/your/repo && bun /path/to/open-autonomy/template/mint-key.ts   # → ~/.config/open-autonomy/agent.env
# 4. run it
export DOCKER_CONTEXT=<a docker host>            # a VM of its own is best; see "The host" below
docker compose -f /path/to/open-autonomy/template/container/compose.yml up -d --build
```

Your project's page appears at `https://open-autonomy.org/p/OWNER/REPO`, rendering your `docs/VISION.md`,
`ROADMAP.yml`, `CHANGELOG.md` and `hermes/`, with each run a receipt. The key spends nothing until the
account has a balance, and stops at zero.

## What the agent can and cannot do

Every run's turns are published live, so the agent's environment holds nothing whose leak matters:

- **Model calls** go to the sidecar, which holds the standing key and forwards them. The agent's own `.env`
  says `OPEN_AUTONOMY_KEY=sidecar`. The key file lives on the host at `~/.config/open-autonomy/agent.env`
  and is re-read when it changes, so a rotated key needs no restart.
- **Pushes** sign through an ssh-agent forwarded from the host, holding one repository-scoped deploy key.
  The agent pushes `agent/<item>` branches and cannot push to `main`, open a pull request, cut a tag, or
  dispatch a workflow. A landing workflow opens its pull request and auto-merge lands it on green checks.
- **Receipts** are Hermes's own outbound webhooks (`hooks.outbound` in `config.yaml`), pushed to the sidecar,
  which translates them into the platform's receipts. A scheduled run is narrated; a chat is not.
- **Delivery** uses the one token in the agent's reach, a Discord bot token, which can only post as the bot.

## The host

The stack needs three things outside the containers, none of them in the agent's reach:

- `~/.config/open-autonomy/agent.env` — the standing key, from `mint-key.ts`.
- An ssh-agent holding only the deploy key, forwarded into the Docker host. On macOS with colima:
  `SSH_AUTH_SOCK=~/.config/open-autonomy/agent.sock colima start <profile> --ssh-agent`, with a launchd
  agent running `ssh-agent -a ~/.config/open-autonomy/agent.sock` and `ssh-add`ing the key at start.
- The pinned Hermes image: `template/container/build-hermes.sh` builds it from `hermes.pin`.

Then the two volumes: `oa-home` seeded once from your `hermes/` (a `home-sync` step re-applies the tracked
files on every start, so the repository stays the source of what the agent is) and `oa-repo`, a clone made
with the deploy key. `docker exec -u $UID oa-agent hermes cron run build-roadmap` runs the job now;
`docker logs -f oa-sidecar` shows what it is narrating.

## Upgrading

The template is the source; an applied `hermes/` is never edited in place. `bun template/apply.ts` re-applies,
`bun template/apply.ts --check` fails when an applied home has drifted. Open Autonomy's own `hermes/` and every
`cookbook/*/hermes/` are checked that way in CI.
