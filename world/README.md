# The world: Open Autonomy with no keys anywhere

`world/` is a [volter-world](https://github.com/volter-ai/twin) world: the whole product running on your
machine against local twins of GitHub and the model gateway. No account, no credential, no cloud, no
spend. The agent develops here; the deployed worker is the last mile a maintainer reviews.

```bash
export TWINS_ROOT=/path/to/twin        # until the twin packages are published
bun world/run.ts up                    # twins + the real worker, then seed (repo, funding, the agent's key)
bun world/run.ts env -- curl -s "$PLATFORM_URL/v1/funding"   # anything, inside the world
bun world/run.ts agent                 # one build-roadmap run of the real Hermes against it
bun world/run.ts verify                # the audit: the books, then the twin — never the agent's prose
bun world/run.ts down --purge          # forget it
bun world/run.ts check                 # the gate: up → seed → agent → verify → down (what CI runs)
```

## What is real and what is a twin

Real: `platform/`'s worker (under `wrangler dev`, its Durable Objects holding the books), the `hermes`
binary, git, and the skill the agent runs. Twins: GitHub (REST plane and the git wire) and the model
gateway (the `openai` twin, serving `handlers/openai.json`). Every model call is metered on the local
books exactly as in production, because it is the same worker.

The agent's key is minted **the adopter way**, inside the world: the platform issues a challenge, the
seed commits the claim file to the repository on the twin, the platform reads it back and mints. The key
lands in the world's data directory and is worthless anywhere else.

## The two moves

- **State** is created through the vendors' own doors (`seed.ts`): the repository is pushed to the twin's
  git wire, the account is funded through the platform's admin route, the key through the mint route.
- **Behaviour** is `handlers/openai.json`, ordered first-match rules keyed on the request's own features.
  Its first rule is the failure class that killed a real run: a request whose output cap is under 16384
  gets `finish_reason: length` and no text, which Hermes retries four times and then fails. So a platform
  that clamps the agent's output cap cannot pass `check`, and `verify` also refuses a run where that
  handler matched at all.

Rules never key on call counts: the platform meters Hermes's housekeeping calls too, and their number is
not contractual.

## Files

| File | What it is |
|---|---|
| `world.json` | the logical world: two twins and the platform service. `${TWINS_ROOT}`/`${WORLD_DIR}` are substituted into an ignored generated copy under `.volter/`, so no developer's paths are committed |
| `platform.ts` | the real worker as a world service: `wrangler dev` with its upstreams pointed at the twins the world injected |
| `handlers/openai.json` | the model's side of a run |
| `seed.ts` `agent.ts` `verify.ts` | the post-up steps, each run with the world's env |
| `run.ts` | the runner: `up`, `seed`, `agent`, `verify`, `check`, `down`, `env -- <cmd>` |

## Receipts

`agent.ts` narrates its run to the platform on the standing key the way the reporter does in production
(started, then finished), so the receipt path — the CloudEvents intake, its redaction, and the project
page's health line — is under the world too. `verify.ts` reads the receipt and the page, never the prose.

## What it does not cover yet

The agent's own containers (`container/`), the landing workflow and auto-merge (the twin has no Actions,
so the agent lands on its branch and `verify` asserts `main` is untouched), and the cron scheduler firing
on its own (Hermes reads the host clock, which the world clock does not reach). Those are proven live,
or not yet.

Discord delivery has a twin now (`@volter/twin-discord`: the REST v10 surface and the gateway websocket
a real bot connects through), but this world does not run it yet, for two reasons worth stating. The
world runs Hermes one-shot, and delivery happens in the gateway's cron lane, which the world does not
start. And `discord.py` hardcodes its base URL and builds its own HTTP session, so it ignores the
world's proxy: reaching the twin from an unmodified Hermes needs the reflect front (DNS plus the
session CA). Both are the same piece of work, tracked as a roadmap item.
