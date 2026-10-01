---
name: drafts
description: How the account manager files draft work: a card held from dispatch, blocked by its own message to the manager until the manager's reply promotes it.
version: 1.0.0
---

# Drafts

How the account manager turns a decision of its principal into draft work. A draft is a card that cannot start until the manager
answers the account manager's message about it. The manager's answer is the promotion; everything after it
(when the card starts, merge order, which session works it) is the manager's sequencing.

`<home>` below is the board's home (`--root`), and `<manager>` is the manager's session address (the board's
`managers` entry).

## Filing a draft

Every draft comes from a line of the principal's that decided something. Never file one on your own initiative.

1. **Write the card, held.** It must not dispatch in the moment before its block exists:

   ```sh
   supercode workflow create "<title>" --no-start --body "$(cat <<'CARD'
   <what the work is, in one paragraph>

   ## Acceptance
   - [ ] <an outcome someone can see, one per line>

   ## Order and blockers
   - <what must land first, or what this waits on>, because <the design's stated reason>

   ## Design
   <the design's path in the record> (<the part and decisions it implements>)

   ## Sponsor
   <the principal>
     - source: <the principal's message id> "<their line, word for word>"
   CARD
   )" --root <home>
   ```

   - **The design is linked, never copied.** The record's design while it is a design; the product repository's
     `docs/adr/<NNNN>-…` once it has shipped.
   - **The sponsor is the principal**, with the line that asked for the work as its evidence. A client principal is
     named only through a proven identity link; otherwise the section reads `Requested by (unverified): <name>` and
     the sponsor stays inherited.
   - **The order carries its reasons,** so the manager can tell whether a blocker still holds.

2. **Send the manager the draft's own message.** It is new mail from your main session, never a reply to anything:

   ```sh
   supercode message send <manager> --subject "draft: <title>" \
     "draft: <title> (<card id>), from <the principal's message id> \"<their line>\""
   ```

   Its message id is the one the card waits on.

3. **Ask for the block on that message.** Only the manager blocks a card; the request mails it:

   ```sh
   supercode workflow request-state <card id> --state block --waiting-on <message id> \
     --reason "draft: it waits for the manager's answer to <message id>" --root <home>
   ```

   The card stays `todo` and not `ready` while the block holds, and its dispatch stays held until the manager starts it.

## While it is a draft

- **The manager asks its questions as comments on the card.** Read them with `supercode workflow show <card id>
  --root <home>` whenever you follow delivery.
- **Answer with new mail to the manager naming the card and the comment,** from the record where you can. Never reply to
  the draft's own message: a reply in its thread ends the block, and only the manager's reply may.
- **A question only the principal can answer** goes to the principal (a real blocker, at once; otherwise in the
  digest), and their answer goes to the manager word for word, with its id.

## When the manager answers

- **Its reply in the draft's thread is the promotion.** The block ends when it lands; the card is the manager's from
  there.
- **Sequencing is the manager's.** When a sequencing choice contradicts the reason the design gives for its order, the
  manager brings it to your thread; answer it from the design, and bring the principal only what the design does not
  settle.
- **Follow the card to done** and report it to the principal in the digest.
