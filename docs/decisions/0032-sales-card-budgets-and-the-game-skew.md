# 0032. Sales on the books, a card's own budget and key, and the game skew

Status: proposed by VO-3760 (videogame.ai's local game loop), revisable by later cards.

## Context

A game sold through a store takes money in as sales, not patronage: the owner's line on the card, "we should not think
about the subscriptions and the one time backing as 'donations' they should be considered pre orders or some kind of
product subscription". Its owners fund individual cards from that money, and an agent working a card must spend only
that card's budget. Any coding agent at the computer works the game (the owner: "don't rely on hermes").

## Decision

1. **A sale is a mint with provenance, and only an enrolled seller mints it.** A sale is money in, so a seller is a
   money rail the operator enrolls through its own door: `POST /admin/accounts/:account/seller-key {seller}` mints a
   `sell` key bound to that project and that seller; no project key mints one. `POST /v1/sales` on it records
   `{order, product, gross, fee}` as the key's seller and mints the net, idempotent per seller order. The books show it as a sale with all three figures; the money is the project's unrestricted balance.
2. **A card's budget is the owner's own money set aside.** `POST /v1/agent/allocate` (steer) moves free unrestricted
   money into an `{type: 'item'}` envelope for a roadmap item that is not done (an `allocate` flow; the total is
   unchanged). Marking the item done releases the remainder, as before.
3. **A card's key spends only the card's budget.** `POST /v1/keys/item` (steer) mints a spend-and-narrate key bound to
   the item. The registry holds the binding, and the ledger's reservation draws only that item's envelopes for it, so
   the key is refused, naming the card, once the budget is spent. It narrates only its card's updates and sessions.
   Card keys are limited per card (two), not by the account's three slots.
4. **The `game` skew** of create-open-autonomy is runtime-neutral: on the IR kit's engine with no `hermes/` and no
   harness named, it ships `AGENTS.md`, a `game` skill and `.open-autonomy/game.ts`, the doors an agent and the owners
   use (asks from the Room's `feedback` into owners' Inbox Tasks, cards with budgets and keys, progress and answers in
   `build`, metered calls on the card's key, the bot's check, members-first then public releases, shipping).
5. `GET /v1/accounts/:account/flows` serves the books' money movements behind the books panel; an item's view carries
   its budget (set aside, spent, left, released).

## Consequences

Patronage, grants and the other skews are unchanged. A sale's refund does not yet reverse it. The skew's release
door calls a store's folder uploader named in the game's configuration.
