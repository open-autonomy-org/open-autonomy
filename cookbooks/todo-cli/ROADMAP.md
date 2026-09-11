# todo-cli roadmap

Sourced working notes maintained by the Hermes PM scrum. Imported historical intentions await reconciliation; existing tasks, owners and holds remain intact.

## add: todo add appends an item and prints its id

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `add`. This is not evidence of current priority or completion.

Completion:
- `todo add "buy milk"` appends {id, text, done:false, created} to the store and prints the new id.
- Ids are small integers that never repeat within a store, even after removals.
- Manually add two items to a disposable store and inspect ids 1 and 2 and the stored text.

## domain: the project owns its domain name

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `domain`. This is not evidence of current priority or completion.

Completion:
- `todo-cli.example` is registered for the project: a single-use card minted through the platform's card rail, within the owner's bound and merchant category, pays the registrar once, and the purchase shows on the audit trail and on this item's page with the merchant.
- `docs/DOMAIN.md` records the domain, the registrar and the amount, and manual inspection confirms the file names the domain.

## list: todo list prints open items with their ids

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `list`. This is not evidence of current priority or completion.

Completion:
- `todo list` prints one line per open item as `<id>  <text>`, oldest first, and `nothing to do` when empty.
- Manually inspect both the empty store and a store with two items.

## done: todo done marks an item finished

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `done`. This is not evidence of current priority or completion.

Completion:
- `todo done <id>` sets done:true; `list` hides done items unless `--all`, which shows them with a `[x]` prefix.
- An unknown id exits 1 with `no such item: <id>`.
- Manually inspect marking, hiding, --all, and the unknown id.

## remove: todo remove deletes an item

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `remove`. This is not evidence of current priority or completion.

Completion:
- `todo remove <id>` deletes the item; a later `add` does not reuse its id.
- Manually inspect removal and the non-reuse of ids.

## json: todo list --json prints the items as JSON

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `json`. This is not evidence of current priority or completion.

Completion:
- `todo list --json` prints the open items (all with --all) as a JSON array of {id, text, done, created}.
- Manually parse the output and inspect the shape.

## due: items can carry a due date

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `due`. This is not evidence of current priority or completion.

Completion:
- `todo add "pay rent" --due 2026-10-01` stores due as an ISO date; `list` shows `(due 2026-10-01)` and sorts due items first by date.
- Overdue items (due before today) show `OVERDUE` in `list`; manual verification pins today with $TODO_TODAY.

## stats: todo stats counts the store

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `stats`. This is not evidence of current priority or completion.

Completion:
- `todo stats` prints `open <n>  done <n>  overdue <n>` and manual verification compares the counts with a synthetic store.

## readme-usage: the README's usage section is the help text

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `readme-usage`. This is not evidence of current priority or completion.

Completion:
- README.md contains a `## Usage` section whose fenced block equals `todo --help` output, and manual verification compares them.

## Questions and scrum notes

No scrum has reconciled this import yet. Record decisions, human commitments, release review gates and evidence here.
