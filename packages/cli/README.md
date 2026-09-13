# `oa`: Open Autonomy on the command line

Every command is one of the platform's doors, as the SDK speaks them: a project's word, money and sessions to
read; the owner's pause and resume to say; keys to mint. Nothing here runs or upgrades an agent (that is
[`create-open-autonomy`](../kit-hermes/README.md)'s), and nothing here is a door the platform lacks.

```sh
bunx @open-autonomy/cli status open-autonomy-org/hookline      # or: bun add -g @open-autonomy/cli; oa status …
```

```text
oa status   <owner/project>            the word, the money, what is running, the board
oa sessions <owner/project> [-n 30]    the stream, newest first
oa session  <owner/project> <key>      one session's transcript; --follow stays with it while live
oa roadmap  <owner/project>            the board: in progress, planned, proposed, shipped
oa books    <owner/project> [--calls]  the ledger and the owner's bounds; every metered call
oa pause    <owner/project> [-r why]   the owner's word: pause the scheduled work
oa resume   <owner/project> [-r why]   the owner's word: run
oa key mint <owner/project> [--scopes steer] [--models a,b] [--repo dir] [--out file]
oa key rotate <owner/project> [--grace seconds]

  --platform <url>   the deployment (or OPEN_AUTONOMY_URL); open-autonomy.org by default
  --key <file|token> a key (or OPEN_AUTONOMY_KEY); found under ~/.config/open-autonomy/<owner>/<project>/ when absent
  --json             the platform's records, unrendered
```

## What needs a key

A read needs no key for what the owner opened to everyone (the `dashboard:` block of the project's
`.open-autonomy/config.yaml`: a preset, then a role per panel). A panel closed to the public answers `not open to
this view`; the project's own key opens it, and `oa` reads `~/.config/open-autonomy/<owner>/<project>/{steer,agent,treasurer}.env`
in that order when no `--key` is given, the layout the kit's valves already use.

Pause and resume need a key with the `steer` scope. An agent's key deliberately lacks it, so an agent can never
pause itself; the owner mints one:

```sh
oa key mint open-autonomy-org/hookline --scopes steer      # from a checkout of the project
```

The platform names a claim for the day; `oa` writes it to `.open-autonomy-claim` in the checkout (or `--repo`);
land it the way the repository lands anything; run the command again and the key is written to
`~/.config/open-autonomy/open-autonomy-org/hookline/steer.env`, never printed. The word itself:

```sh
oa pause open-autonomy-org/hookline --reason "holiday"
```

records the owner's request on the platform and waits for the project's own automation to answer (the kit's
reporter pauses the scheduled jobs and reports back within seconds); the project's pages say "Pause requested"
until then and "Paused by the owner", with the reason, after. `oa resume` is the same word the other way.

## Made of

[`@open-autonomy/sdk`](../sdk/README.md) for every door; [commander](https://github.com/tj/commander.js) for the
commands and their help; [@clack/prompts](https://github.com/bombshell-dev/clack) for the spinner while the
automation answers and the note that carries a claim; [picocolors](https://github.com/alexeyraspopov/picocolors)
for the palette, which follows the terminal (`NO_COLOR` and a pipe turn it off). `--json` prints the platform's
records for anything that wants to script over them.
