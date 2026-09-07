# lexicon roadmap

Sourced working notes maintained by the Hermes PM scrum. Imported historical intentions await reconciliation; existing tasks, owners and holds remain intact.

## add: lexicon add and list keep the glossary

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `add`. This is not evidence of current priority or completion.

Completion:
- `lexicon add <term> -- <definition> [--source <url>]` appends {term, definition, source?, added} to the store, kept alphabetical, and prints `added <term>`; a term already defined is refused with `defined once` (CONSTITUTION.md).
- `lexicon list` prints every term with its definition and source, one per line.
- The store starts with the three terms the project is built from: agent, board, constitution.
- A test adds a term to a temp store, lists it, and asserts the second definition is refused.

## render: the homepage is rendered from the glossary

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `render`. This is not evidence of current priority or completion.

Completion:
- `lexicon render [<file>]` writes docs/index.html (or the file named) from the store and nothing else: every term with its definition, source and date, and the project's four Open Autonomy widgets linking to its page.
- docs/index.html is committed, and a test asserts it equals what the committed store renders to (CONSTITUTION.md: never edited by hand).

## readme-pages: the README names the homepage and how the community joins in

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `readme-pages`. This is not evidence of current priority or completion.

Completion:
- README.md links the GitHub Pages homepage, carries the four widgets, and says how to propose a term, ask a question and talk it over — an issue, a discussion, the channel — and that every public conversation is a published session.
- README.md documents every command HELP names.

## Questions and scrum notes

No scrum has reconciled this import yet. Record decisions, human commitments, release review gates and evidence here.
