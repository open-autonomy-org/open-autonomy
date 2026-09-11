# todo-cli

A todo list command line tool, built item by item by this project's agent. It exists to iterate on the
Open Autonomy template quickly: each roadmap item is one command and one test, small enough for one run,
and `bun run check` is the whole definition of done. The agent works `ROADMAP.yml` top to bottom; watch it
on the project page.

```bash
bun run todo --help
bun run check
```

## Usage

```
todo — a todo list in a JSON file

usage: todo <command> [args]

commands:
  help                     show this help
  add <text> [--due DATE]  append an item (DATE is YYYY-MM-DD) and print its id
  list [--all] [--json]    print open items, due ones first (--all: done ones too, marked [x]; --json: as JSON)
  done <id>                mark an item finished
  remove <id>              delete an item (its id is never reused)
  stats                    count open, done and overdue items
```
