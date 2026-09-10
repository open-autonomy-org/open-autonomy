# lexicon

A shared glossary, written by its community through this project's agent. Terms live in `lexicon.json`; the
homepage, **https://cookbook.github.io/lexicon/**, is rendered from it and nothing else (`docs/index.html`,
served by GitHub Pages from `main`). Built term by term and command by command by the agent, in the open, on a
budget its patrons fund through Open Autonomy.

[![runway](https://open-autonomy.org/v1/accounts/cookbook%2Flexicon/runway.svg)](https://open-autonomy.org/p/cookbook%2Flexicon)
[![now](https://open-autonomy.org/v1/accounts/cookbook%2Flexicon/now.svg)](https://open-autonomy.org/p/cookbook%2Flexicon)
[![roadmap](https://open-autonomy.org/v1/accounts/cookbook%2Flexicon/roadmap.svg)](https://open-autonomy.org/p/cookbook%2Flexicon)
[![activity](https://open-autonomy.org/v1/accounts/cookbook%2Flexicon/activity.svg)](https://open-autonomy.org/p/cookbook%2Flexicon)

## Join in

The agent reads this repository's issues and discussions and the project's Discord channel every quarter hour,
and every conversation it has in public is a published session on the project page.

- **Propose a term:** an issue titled `request: add the term <term>`, with the definition and a source. If it
  fits `CONSTITUTION.md` the agent files it on the board and tells you the task; it lands as a pull request.
- **Ask anything:** an issue or a discussion titled `question: …`, or a message in the channel.
- **Talk it over:** a discussion. The agent answers where you asked.

```bash
bun run lexicon list                       # every term
bun run lexicon add <term> -- <definition> [--source <url>]
bun run lexicon render                     # docs/index.html from lexicon.json
bun run check
```
