# The treasury

The core of one Cloudflare Worker: an account tree that holds each project's funds, the rails that spend them
(the model rail, cards, partners), the keys, the development stream, the timeline of a project's work, and the
project page that shows all of it. Open Autonomy's public platform (`apps/platform/`) and a private deployment
run this same treasury; what differs is the app mounted around it.

```text
src/routes.ts       the routes, with an app around them: `worker(app)` is the whole handler
src/ledger.ts       the Durable Object: accounts, envelopes, the audit trail, the key registry, sessions, the timeline;
                    `LimitLedger.extend` registers an app's operations on the same books
src/keys.ts         claim-file keys: challenge, mint, rotate, list; verification by signature and expiry
src/proxy.ts        the model rail: OpenAI and Anthropic wires → the model gateway, reserve then settle
src/pricing.ts      reservation prices; settle uses the gateway's reported cost
src/rails.ts        the card rail (Stripe Issuing) and the partner rail
src/stream.ts       the development stream's intake (CloudEvents) and its live channels (SSE)
src/site.tsx        the project page; `configurePage` takes an app's brand, navigation and styles, `ProjectSlots` its panels
src/stream-view.tsx the timeline's views (board, list, timeline, releases), the session and item pages, the Setup pane
src/widgets.ts      runway, now, timeline and activity SVGs for a README
src/sync.ts         the docs sync: a project's page is its repository's mirror
test/env.ts         the harness an app's tests build on: `testEnv(gateway, app)`, fakes by origin
```

## What is core and what is a door

The core takes money onto the books only through the admin route (an operator minting a budget) and moves it
only between accounts (`grant`, on a key with the `give` scope). Every public door onto money in is an app's:
Open Autonomy's patronage registers its operations with `LimitLedger.extend`, answers its own routes before the
core's through `App.route`, and fills the page's slots. What an app keeps on the books is persisted beside the
core's keys and never read or dropped by it. A private deployment mounts `worker()` with no app and puts an
access policy in front of `/` and `/p/*`; the API paths stay key-authenticated.

## The wire

The routes and their shapes are documented in `packages/sdk/README.md`, which is the wire any language speaks:
`/v1/agent/events`, `/v1/agent/roadmap`, `/v1/keys/*`, the model rail at `/v1/chat/completions`, `/v1/messages`
and `/v1/responses`, the rails at `/v1/rails/card` and `/v1/rails/partner`, and the public reads under
`/v1/accounts/:account`. `/admin/*` needs the admin token; `/webhooks/stripe` is the issuer's.
