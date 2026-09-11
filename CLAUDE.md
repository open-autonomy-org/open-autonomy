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
- `cookbooks/todo-cli/` — the canonical reference project, made with the kit: CLI development plus community,
  setup, team and release scenarios. Its `cookbooks/todo-cli/examples/notes-http.ts` is a focused HTTP service without another kit copy.
  Verify fresh installation in a disposable generated project.
- `world/` — OA's ordinary World scenario: its opening data, model handlers and manual operators around
  the real platform and unmodified cookbook. World owns every service's lifecycle; follow [the guide](world/README.md).
- `hermes/`, `.open-autonomy/`, `container/` — our own use: the kit applied to this repository, running bare on
  this Mac under launchd. It develops the product, and it is not special. Runtime state is git-ignored.
  `container/` is the kit's default for a real deployment (one World-managed executor): the
  agent cannot reach its keys there. This Mac runs both agents bare for fast debugging, an accepted trade here.

Architecture decisions follow the ADR process in `CONTRIBUTING.md`. This file does not replace
accepted decision records; conflicting directions require a sourced proposal and constitution review.

## Working agreement

- Nothing pushes to `main`, including maintainers: the `main-protected` ruleset has no bypass actors. Push a
  `land/<topic>` branch; `land.yml` opens its pull request and merges it. Independent agent approval of the current head is required before automatic merge.
- Verify the feature manually through the World; deployment remains a separate human-reviewed release.
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
- **Runtime responsibilities are separate.** Follow [ADR 0001](docs/decisions/0001-runtime-boundary.md).
  The existing valve and reporter stay on the host; container mode runs native Hermes inside the World
  executor. Bare mode uses the same local components without container orchestration. The installed
  Codex owns its current login; OA never saves a separate project login. Do not infer removal of
  reporting or a changed credential boundary from a decision about Codex forwarding.
- **No automated tests.** Follow `CONSTITUTION.md` and `CONTRIBUTING.md`: manual feature usage only;
  never run test suites or test hooks and never commit permanent test code.
- **Money in is GitHub Sponsors, Polar and grant credits**, side by side, all onto the same books (Polar is the
  merchant of record for direct patronage; grant credits are held by funders and by the org's grants account,
  and given to projects); **cards out are Stripe Issuing**. Nothing else takes or moves money.
- **Verify in the World.** Follow [world/README.md](world/README.md). Keep instance state outside the checkout,
  on a disk with headroom. Reuse the installed pinned Hermes and warm dependency cache. Prepare the scenario
  and use ordinary `volter-world up`, `attach`, `doctor`, `tail`, and `down --purge`. All vendor credentials
  are synthetic; World owns the agent service, its readiness and cleanup. Do not recreate a rehearsal runner.
- You operate this World to verify the product; you are never a second agent inside its cookbook.

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
