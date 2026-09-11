# Open Autonomy — working notes

## What this repo is

Open Autonomy in four pieces — the platform, the starter kits, the cookbooks, and this install's own
boilerplate — and itself an Open Autonomy project. **Every spend is metered on public books.**

- `packages/backend/` — the core of the Cloudflare Worker: the account tree, the rails (the model rail live; cards and
  partners), the key registry, the development stream (sessions, updates, items), the timeline, a project's page,
  the widgets, the docs sync. `apps/platform/` mounts it with patronage around it (Sponsors, Polar, grant credits,
  coupons, explore); `apps/self-host/` mounts it bare: the deployment anyone copies to run their own, private or not. Deploys and admin ops go through GitHub only, from human-cut tags (`deploy-v*` for `deploy.yml`, `release-v*`
  for `release.yml`, `admin.yml` dispatched `--ref` the latest deploy tag), each gated by the `production`
  environment's reviewer; the environment admits no branch, so the agent's `main` never runs with a secret. No
  machine holds a deploy or admin token.
- `packages/sdk/` — `@open-autonomy/sdk`: the roadmap codec, the stream client, the key helpers; its README
  is the wire any language can speak.
- `packages/kit-hermes/` — `create-open-autonomy`: the Hermes kit. `create`, `adopt`, `check`, `upgrade`. A
  generated repository is self-contained (the SDK is vendored into it).
- `cookbooks/` — complete autonomous projects, made with a kit plus their own code (`lexicon`: a community desk over
  the GitHub twin's issues and discussions and the Discord twin, a GitHub Pages homepage). `todo-cli` is the one the
  world runs.
- `world/` — the front of the world: the kit's own rehearsal (`.open-autonomy/rehearsal/`, carried by every cookbook)
  run in a cookbook, with the platform from this tree on the twins (`cookbooks/<name>/rehearsal/`: the world, the
  scripted brain, the stories, the hooks). An environment to drive, never a gate.
- `hermes/`, `.open-autonomy/`, `container/` — our own use: the kit applied to this repository, running bare on
  this Mac under launchd. It develops the product, and it is not special. Runtime state is git-ignored.
  `container/` is the kit's default for a real deployment (one image, one compose file; Docker or Podman): the
  agent cannot reach its keys there. This Mac runs both agents bare for fast debugging, an accepted trade here.

## Working agreement

- Nothing pushes to `main`, including maintainers: the `main-protected` ruleset has no bypass actors. Push a
  `land/<topic>` branch; `land.yml` opens its pull request and merges it. No check stands between a branch and main.
- Live proof is the proof: the deployed worker and the rendered site, not local tests alone.
- Everything the agent can see may be published live. Nothing in its reach may be a secret that matters.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, the balance hard-stop, the account tree) get the higher bar:
  fail a review you cannot confidently verify. Never rotate `AGENT_PROXY_HMAC_SECRET`: it invalidates every key.
- Nothing here develops against a real API: the cookbook and the platform run only in the world. Two agents spend
  on the real platform: our own (its model on the owner's Codex subscription; its narration and rails on its platform
  key) and Hookline's (`open-autonomy-org/hookline`, the first real project made with the kit, on the platform's model
  rail with its own grant and bounds), each bare on this Mac as a launchd agent (org.open-autonomy.agent and
  org.open-autonomy.hookline in the user's LaunchAgents: the kit's start script from the agent's own checkout under the
  open-autonomy state directory in .local/state, its home beside it, its secrets in the open-autonomy and
  open-autonomy-hookline config directories, the valves on 8787 and 8987, the pinned Hermes installed once under that
  state directory). Hookline's agent is its own GitHub App, `hookline-agent`, installed on its repository alone, whose
  key the valve holds (github-app.json beside its keys; the desk's door on 8990), and its own Discord bot, `Hookline`, in
  the `#hookline` channel; ours is the `Open Autonomy` bot, coordinating in public `#development`, with `#general`,
  the `#help` forum and `#announcements` serving the community. The project communication skill records the
  destinations and public-only access boundary; confidential human spaces and DMs are outside this fleet.
  The cookbooks and the world run on `zai/glm-5.3-flash`;
  our own agent runs on `openai/gpt-5.6-sol` (its keys allow both), because the product's own development has to
  work well. `GET /v1/catalog` with any key lists what the gateway offers.
- `bun run check` = the whole check under a thirty-second budget (typechecks, the smoke tests, the kit's drift check,
  the docs check); the pre-commit hook runs it. `bun scripts/check-supply-chain.ts` = lockfile integrity + audit.
- **Bare is plain Hermes; the container forwards.** A brain on the owner's Codex subscription is Hermes's own
  `openai-codex` provider. Bare on a computer it runs on that computer's login (the Codex CLI's, adopted into the
  home's store on the first start) and the start script does nothing else: no sidecar, no host half, no valve on the
  bare path. Only where the login must stay out of the agent (the container) or the model is a twin (a world) does the
  start script forward the provider, through the valve or to the twin. Anything that re-routes the bare path or adds
  a host-side orchestrator is removed, not repaired.
- **Thirty seconds, total, forever.** Every test and check together finish in under thirty seconds or they are
  cut; a test guards a constitution invariant (money, keys, authority) or is not written. Behavior is verified by
  driving the running product and the world one action at a time. No gate over the world, nothing waiting on an
  agent.
- **Money in is GitHub Sponsors, Polar and grant credits**, side by side, all onto the same books (Polar is the
  merchant of record for direct patronage; grant credits are held by funders and by the org's grants account,
  and given to projects); **cards out are Stripe Issuing**. Nothing else takes or moves money.
- On this Mac the world's state lives on the SSD: `WORLD_STATE_ROOT=/Volumes/PeakSSD/volter-work/open-autonomy`
  before any `bun world/run.ts` verb (the internal disk has no headroom; the runtime admits a world against the
  root's free space). The world runs the cookbook's agent bare, as the kit's start script starts it on a laptop:
  no Docker, no isolation (nothing the world's agent reaches is worth protecting), the pinned Hermes installed once
  under that root. Each live agent has its own home (`HOME` too, so two gateways on one bot token never share a lock)
  and its own Discord bot: Open Autonomy and Hookline. Their project conversations follow each install's
  communication agreement.
- **The world is where this runs without keys.** `bun world/run.ts up` brings the twins (the published `@volter/twin-*`
  packages in the cookbook's `.open-autonomy/node_modules`; `TWINS_ROOT` names a checkout when developing the twins),
  the real platform and the cookbook's agent up, in seconds; drive it through its page and doors (`bun
  world/run.ts hermes kanban list`, `hermes cron run pm`) or run a story (`bun world/run.ts stories`), then `fresh`.
- Our own agent runs that same world from its own checkout to verify a change (`bun world/run.ts up`, then its doors
  and curl; the world's agent takes the valve ports 18787/18788, beside the real ones). It is that world's operator,
  never a second agent inside it.

## What a human does, and nothing else

The projects build themselves: they land to `main`, review their own handoffs, and ask when a human must act. A
human owns two acts, both irreversible: reading a money or auth diff before it ships (unsure means not shipped), and
shipping from a tag — `deploy-v<date>` on a commit they read, `release-v<kit version>` for the kit — then approving
the run on its page. `apps/platform/DEPLOY.md` says how; all development PRs, including `.github/` changes, merge automatically after independent agent
review. Human approval is reserved for release. Anything else a person finds themselves doing for a project is a task for the kit, not
a habit to keep. Owner-gated, standing: a Polar organization; the first real patron.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/healthz`, `/`; the workers.dev URL is the same worker).
- README widgets: `/v1/accounts/:account/{runway,now,roadmap,activity}.svg` (Camo-safe SVG).
- A project page shows what its substrate publishes through the SDK — the sessions, the roadmap, the board, the
  agent's setup, the project's documents (what it is, what shipped) — and reads from its repository only its
  metadata, a README cover and `.open-autonomy/config.yaml` for the owner's bounds (re-synced every ten minutes;
  `admin.yml` → `sync` forces it). Hermes and its board are a starter the kit makes, not shapes the platform knows.
- `CONSTITUTION.md` is what this project is and must remain; `CONTRIBUTING.md` how its code is written.
