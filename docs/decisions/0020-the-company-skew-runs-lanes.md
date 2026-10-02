# ADR 0020: The company skew runs lanes: product and go-to-market, with strategy above them

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur.

Amends [ADR 0017](0017-the-ir-native-kit.md) (the `company` skew's home now holds two lanes, and the start runs one).
Supersedes nothing.

## Context and sources

**Authorization.** The owner locked the design in Volter's company repository on 2026-10-01: `volter-ai/volter`
`company/rfcs/0027-the-front-office.md` ("okay let's just lock this in, it will evolve with time"), rewritten to RFC 0028
(the frontline on lucarne). The owner's lines it rests on: "what we need is a whole process for front office/gtm that's
just as robust as the product creation. Strategy sits above these two lanes"; "these two should effective run separate
cycles - which obviously meet in the calendar"; "one for gtm and one for produt"; "strategy is not an exemption to never
ask - its product IS the strategic report"; "we do strategy every day". RFC 0027 §12 places the generic lane in this
skew: "Any organization would want these. They read their channels, collectors and doors from the install's
configuration; nothing in the skew names Cadence, Volter's repositories or vendors." The organization's decision 0036
adds two rules for strategy: a decision reaches the owner already independently reviewed, the same reviewer resumed
until it passes; social media research goes through the grok CLI started through supercode.

**What exists** (this repository at 434f94d4, the account-manager arc's branch): the `company` skew's home is one board
(`home/workflow.yaml`) and its profiles (account manager, manager, coders, reviewer, auditor, box maintainer), all
rendered and applied by the start. A home has one board and one manager address (`params.managers`), so a second lane
with its own manager cannot share an install. Supercode's dispatcher starts an arc's one review once its tasks are
closed and a pull request is open on its branch (`sdk/orchestrator/board/dispatch.mjs`, `activatePullRequestReviews`).

## Decision

- **An install runs one lane.** `home/lanes.yaml` names each lane's board file and profiles; `lane:` in the install's
  `.open-autonomy/config.yaml` picks one (the first, `product`, when it names none). The start applies only the lane's
  profiles (their models, settings and jobs) and leaves the others' folders out of the running home; it serves the lane's
  board file as the home's `workflow.yaml`. A mail agent on a profile the lane does not run stops the start.
  *(One lane per install is this record's reading of "one for gtm and one for produt": a home has one manager address,
  so an organization running both lanes runs two installs of this skew, which meet in the calendar.)*
- **The product lane** is the board and profiles that were, plus `strategy`.
- **The go-to-market lane** (`workflow.gtm.yaml`) is the product lane's card machine and statuses, unchanged (no kernel
  change, RFC 0027 §11.1), with its own role prompts (`prompts/gtm/`) and profiles:
  - `gtm-manager`, a mail agent the install declares, whose own session is the board's manager (`params.managers`): the
    board grants the manager's verbs to that session alone, so its profile's job is only a clock: every 30 minutes a
    job with no model turn runs `scripts/clock.sh`, which sends the tick to that session through Supercode's session
    service. *(Measured in the GTM World: a job's own session can neither act as the manager nor see the manager's live
    session from its own config home, so it cannot wake it with `message send`.)* The tick: the rounds kept (each created held, its interval set, then started), the calendar's
    slots counted from the cards until
    the organization's calendar runs, the low buffer raised, reviewed posts blocked on their slot's live session, the
    release hold copied from strategy's report, the meeting's decisions turned into ranked cards;
  - `gtm-auditor`, which runs the rounds as recurring cards: the funnel audit, the report and research and collection;
  - the `coder` family as implementers, and the `reviewer`, whose bar for a post is the `post-review` skill;
  - `walker`, the blind walker, started by the reviewer through supercode with a post's rendered address and a test
    identity, nothing else.
  - **A post card's materials are a branch and pull request in the install's repository**, so the dispatcher starts its
    one review as it does an arc's. The card names each changeset's content hash in the lane's World, where an arc names
    its PR head. After the pass the manager blocks the card on a message to its slot's live session; the hand's
    keystroke posts, the live URL is written back, and only then is the pull request merged. *(The pull request as the
    review's trigger is this record's choice: it keeps the dispatcher as it is.)*
  - **Nothing in the skew posts, likes, follows or sends.** A post is a person's own keystroke.
- **The lane's configuration is the install's.** `gtm:` in `config.yaml` names the files the lane reads (channels,
  checklist, panel, funnel map, collectors, release hold), where each day's audit, report, research notes and meeting are
  kept (`days`), the CRM's path, the World posts are drafted in, the live session's address, the walker's test identity,
  the calendar's horizon and buffer floor, and strategy's reports. Nothing in the skew names a vendor or a repository.
- **Strategy** is a profile of the product lane, ported from the self-build skew's `strategy` skill and rewritten to RFC
  0027 §14: a daily job after the day ends, reading every source of the day at first hand, writing one strategic report
  in three parts into the organization's record (what happened inside, what moved outside, what we now do: targets, the
  share between the lanes, the roadmap's ranking, a ruling on every ask, the release hold), asking nobody. Its report has
  an independent judge of another model family (`strategy.judge`), whose verdict stands in the report. Its numbered
  decisions pass an independent reviewer resumed until it passes. Its configuration is `strategy:` in `config.yaml`
  (the record's daily folder, the go-to-market installs it reads, the CRM, the cursors' file, the judge's command).
  The self-build skew's `strategy` skill is unchanged.
- **The skew's constitution says it in its lane form.** Its invariant "One install, one board. The organization's work
  runs on one board" becomes "One lane per install, one board per lane": an install runs one lane on its one board, and
  an organization running both lanes runs two installs, which meet in the calendar. The template changes with this
  record; an install that has rendered it (Volter's two) restates the line for its own lane. This changes a
  constitution, so it lands only with the constitution review this record already requires.

## Consequences

- A `company` install that names no lane runs the product lane, with `strategy` added; its jobs need `strategy:` in its
  configuration before the first report.
- A go-to-market install has no account manager of its own: its manager's account manager is the product install's,
  named in its configuration.
- The rounds' day files and the CRM hold no handles: cards and reports name a person only by CRM row id.
- Not in this record: the frontline (RFC 0028), which is the go-to-market install's own profile; the collectors and the
  CRM, which are the install's; the organization's calendar (Volter RFC 0023), which replaces the manager's slot count
  when it runs.
