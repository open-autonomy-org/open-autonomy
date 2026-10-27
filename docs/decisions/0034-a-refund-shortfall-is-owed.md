# 0034. A refund shortfall is owed

Status: proposed by VO-3761 (t_daffcfd0) after its independent review, revisable by later cards. Money: the owner reads
this diff before it ships on the Release.

## Context

A store's sale mints its net into the project's books (ADR 0032), and a refund of that sale reverses it once per order
(`POST /v1/sales/refund`). The refund takes the sale's net from the sale's own envelope, then from the project's other
free money. What is already spent, or set aside for a card, is not taken back: the refund recorded that part as its
`shortfall_usd_cents` and nothing more. The review found two faults:

- The refund looked up its sale only in the books' flows feed, which keeps its last 200 entries, and its idempotency
  key in a list of the last 500. An older sale's refund, and even a completed refund's retry, answered `no_sale`
  (404), which the store's reversal delivery treats as terminal.
- A shortfall had no liability and no collection path. A refund could answer `ok` with nothing taken and a 440-cent
  shortfall, the project kept the spending capacity the buyer's money had given it, and the reversal was marked
  applied.

## Decision

1. **A sale and its refund are each kept under their own key**, written with the books' state in one transaction:
   `salerecord:sale:<seller>:<order>` when the sale is minted, and `refundrecord:refund:<seller>:<order>` when it is
   refunded. A refund finds its sale, and a retry finds its completed refund, however long ago either happened. The
   flows feed and the key list stay bounded; they are no longer the only record.
2. **What a refund cannot take back is owed.** Its shortfall adds to the account's `refund_owed_usd_cents`. Money already
   spent or set aside for a card is left where it is: cards in flight keep their budgets.
3. **The game's own next sales settle what is owed, first.** A sale's mint into an account that owes refunds takes the
   owed part out of the new envelope before anything may spend it, and records a `refund` flow to `@refunds` noting that
   it settles an earlier refund. Only sales income settles: a refund reverses a sale, and a game's sales are "not
   patronage" (ADR 0032), so a patron's gift, a funder's grant or coupon, Open Autonomy's matching bonus and a
   grants-pool grant never pay a buyer's refund back. ADR 0032's "patronage, grants and the other skews are
   unchanged" holds. Money given for a purpose (an earmarked envelope) is left to it, as a refund leaves it.
4. **Until it is settled, what is owed is held.** The account can neither spend, grant nor set aside for a card the
   owed amount, so money freed later (a released reservation, a done card's remainder) stays held rather than
   becoming spendable while the debt stands. Holding takes nothing: a game with no further sales keeps its other money
   in its envelopes, and only its spendable amount stands below the debt until sales settle it.
5. **The books show it.** The funding snapshot carries `refund_owed_usd_cents` while anything is owed, beside
   `reserved_usd_cents`, and `spendable_usd_cents` excludes it.

## Consequences

A project that refunds more than it can cover goes on running its cards, and its next income repays the buyer's side
first, visibly. Nothing moves money to a buyer: the store's payment processor already refunded the buyer; these books
record what the project owes back for it. Settling does not reverse cards or release their envelopes; an owner who
wants that withdraws the card's budget as before.
