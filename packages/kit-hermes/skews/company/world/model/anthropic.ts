#!/usr/bin/env bun
// The scripted model the mail agents' Claude sessions talk to in the review World (the Anthropic twin): each proof row's
// act is a turn of the account manager's main session or of a thread session, keyed on the mail it was handed, run as a
// Bash call through supercode's own doors. The twin reads this file on every request, so a rule is authored while the
// World runs. Handlers key on the conversation's own text; the first match wins.
// The machine's mail name: a mail agent's address is sc:<machine>:agent:<name>.
const { MACHINE } = await import('../lib.ts');
const card = await import('./card.ts');
const bash = (command: string, description: string) => ({ toolUse: { name: 'Bash', input: { command, description } } });
/** The id of the newest message in this session's mailbox whose body says `phrase`. */
const idOf = (phrase: string) => `$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("${phrase}"))] | sort_by(.created_at_ms) | last.id')`;
const handlers = [
  // After any command, the turn ends.
  { id: 'after-command', on: { lastMessageHasToolResult: true }, respond: { text: 'Done.' } },
  // RFC 0021 row 6: the board mails the manager the reviewer's verdict; the manager accepts the arc at the reviewed head.
  { id: 'manager-accepts', on: { userTextIncludes: 'Request done for' }, respond: bash([
    `body=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("Request done for"))] | sort_by(.created_at_ms) | last.body')`,
    `card=$(printf '%s' "$body" | grep -o 'Request done for t_[0-9a-f]*' | head -1 | grep -o 't_[0-9a-f]*')`,
    `head=$(printf '%s' "$body" | grep 'Reviewed PR head:' | head -1 | grep -o '[0-9a-f]\\{40\\}' | head -1)`,
    `supercode workflow complete "$card" --reviewed-sha "$head" --summary "Accepted on the reviewer's verdict at $head" --root "$HOME"`,
  ].join(' && '), 'Accept the reviewed arc') },
  // The board-card story (model/card.ts), after the manager's acceptance (its mail carries the card's title): the
  // card's reviewer first, since the review's prompt also carries the title.
  // The adoption story (operators/native.ts): the manager adopts the outside session its mail names onto the held card.
  { id: 'manager-adopts', on: { userTextIncludes: card.ADOPT_PHRASE }, respond: bash(card.managerAdopts(process.env.VO_AGENT_HOME!), 'Adopt the session') },
  // The owner asks the manager to pause a card (world/owner.ts send manager "Pause card t_…: why"); the manager pauses it.
  { id: 'manager-pauses', on: { userTextIncludes: card.PAUSE_PHRASE }, respond: bash(card.managerPauses(process.env.VO_AGENT_HOME!), 'Pause the card') },
  // The owner asks the manager to comment on a card (world/owner.ts send manager "Comment on card t_…: text").
  { id: 'manager-comments', on: { userTextIncludes: card.COMMENT_PHRASE }, respond: bash(card.managerComments(process.env.VO_AGENT_HOME!), 'Comment on the card') },
  ...[card.CARD_TITLE, card.NATIVE_TITLE].flatMap((title, i) => [
    { id: `card-reviewer${i ? '-native' : ''}`, on: { userTextIncludes: card.REVIEWER_PROMPT, anyTextIncludes: title }, respond: bash(card.reviewer(process.env.VO_AGENT_HOME!), 'Record the review') },
    { id: `card-coder${i ? '-native' : ''}`, on: { anyTextIncludes: title }, respond: bash(card.coder(process.env.VO_AGENT_HOME!), 'Work the card') },
  ]),
  // RFC 0022 row 6: the box maintainer's instance the install opened on another enrolled machine declares itself that
  // machine's box-maintainer, as its first message asks.
  { id: 'maintainer-declares', on: { userTextIncludes: "First declare yourself this machine's box-maintainer" }, respond: bash(
    `"\${SUPERCODE_BIN:-supercode}" agent declare box-maintainer --main "sc:machine-b:claude-code:$CLAUDE_CODE_SESSION_ID" --folder "$PWD"`, 'Declare this machine\'s box maintainer') },
  // Row 9: a plain DM reaches main as a root; main answers it in place.
  { id: 'dm-answer', on: { userTextIncludes: 'state of the billing design' }, respond: bash(`supercode message reply ${idOf('state of the billing design')} "Billing: the design is locked in the record; the draft for its first slice is with the manager."`, 'Answer the DM') },
  // Rows 1 and 7: a design dialogue is moved to a thread at once.
  { id: 'delegate-design', on: { userTextIncludes: 'design the export feature' }, respond: bash(`supercode message delegate ${idOf('design the export feature')}`, 'Move the dialogue to a thread') },
  // A delegated session's first turn: answer its thread's root.
  // Its thread is the one its first message names (a channel root, or a line typed into main's terminal).
  { id: 'thread-first-answer', on: { userTextIncludes: 'holding its thread' }, respond: bash(`supercode message reply $(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("holding its thread"))] | last.body' | grep -o 'holding its thread [^ .]*' | head -1 | cut -d' ' -f4) "Export: CSV first, then the API; the thread holds the design from here."`, 'Answer in the thread') },
  // Row 2: a reply in the thread wakes its session, which answers it.
  { id: 'thread-reply', on: { userTextIncludes: 'also consider SSO' }, respond: bash(`supercode message reply ${idOf('also consider SSO')} "SSO noted: export runs as the signed-in user."`, 'Answer the reply') },
  // Row 3: a reply to a closed thread resumes its session, which answers with its context.
  { id: 'thread-resumed', on: { userTextIncludes: 'after the break' }, respond: bash(`supercode message reply ${idOf('after the break')} "Resumed: export is CSV first, then the API, signed-in user for SSO."`, 'Answer after resuming') },
  // Row 6: a line the owner types into a thread session's terminal; the session answers in place.
  { id: 'typed-in-thread', on: { userTextIncludes: 'typed straight into the thread' }, respond: { text: 'Noted here; main has your line as CC.' } },
  // Row 4: main writes into a thread about another thread's overlap; the thread's session and the owner both see it.
  { id: 'overlap-into-thread', on: { userTextIncludes: 'overlap with billing' }, respond: bash(`supercode message reply $(supercode message threads --agent account-manager --json | jq -r '[.[] | select((.root // "") | tostring | contains("export"))] | first.id // empty') "Overlap from the billing thread: export must include invoice ids."`, 'Write into the export thread') },
  // Row 10: the owner locks a design; the account manager files the draft held, sends the manager its own message about
  // it, and blocks the card on that message (the drafts skill). The design is linked, the owner is the sponsor.
  { id: 'draft-file', on: { userTextIncludes: 'design: file the work' }, respond: bash([
    `src=${idOf('I lock the audit export design')}`,
    `card=$(supercode workflow create "Audit export" --no-start --root "$HOME" --body "Export the audit log as CSV.\n\n## Acceptance\n- [ ] An admin downloads the audit log as CSV\n\n## Order and blockers\n- none, because the design names none\n\n## Design\ncompany/rfcs/0099-audit-export.md (decisions 1-3)\n\n## Sponsor\nthe owner\n  - source: $src “I lock the audit export design”" | grep -o 't_[0-9a-f]*' | head -1)`,
    `msg=$(supercode message send sc:${MACHINE}:agent:manager --subject "draft: Audit export" "draft: Audit export ($card), from $src “I lock the audit export design”" | grep -o 'm-[0-9a-f]*' | head -1)`,
    `supercode workflow block "$card" "draft: it waits for the manager's answer to $msg" --waiting-on "$msg" --root "$HOME"`,
  ].join(' && '), 'File the draft') },
  // Row 11: the manager asks about the draft as a card comment; the card stays blocked.
  { id: 'draft-question', on: { userTextIncludes: 'draft: Audit export' }, respond: bash(`card=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | startswith("draft: Audit export"))] | sort_by(.created_at_ms) | last.body' | grep -o 't_[0-9a-f]*' | head -1) && supercode workflow comment "$card" "Manager: which project is primary for the audit export?" --root "$HOME"`, 'Ask about the draft on its card') },
  // The account manager answers the comment with new mail to the manager naming the card, from the record.
  { id: 'draft-answer', on: { userTextIncludes: 'answer the manager on the audit export draft' }, respond: bash(`card=$(supercode workflow list --root "$HOME" --json | jq -r '[.[] | select(.title == "Audit export")] | last.id') && supercode message send sc:${MACHINE}:agent:manager --subject "answer: Audit export" "answer: $card, comment 'which project is primary': volter-org, per the design's decision 1."`, 'Answer the manager') },
  // Row 12: the manager takes the draft forward: its reply to the draft's own message ends the block.
  { id: 'draft-promote', on: { userTextIncludes: 'answer: t_' }, respond: bash(`supercode message reply $(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | startswith("draft: Audit export"))] | sort_by(.created_at_ms) | last.id') "Taken forward: it goes after the billing slice."`, 'Promote the draft') },
  // Row 14: the owner writes to the manager directly; the manager acts on it (the account manager has it as CC).
  // ... and relays it to the account manager paraphrased (RFC 0022 row 3: the auditor finds it against the source).
  { id: 'owner-to-manager', on: { userTextIncludes: 'Manager, pause the reporter rework' }, respond: bash(`supercode message send sc:${MACHINE}:agent:account-manager --subject "relay" "Relaying the owner ($(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("pause the reporter rework"))] | sort_by(.created_at_ms) | last.id')): reporter work is on hold for now."`, 'Act and relay') },
  // Row 15: the owner gives an order through the account manager, which passes it on word for word with the line's id.
  { id: 'order-relay', on: { userTextIncludes: 'Tell the manager: ship the billing slice first' }, respond: bash(`u=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.kind == "user" and (.body | contains("ship the billing slice first")))] | sort_by(.created_at_ms) | last.id') && supercode message send sc:${MACHINE}:agent:manager --subject "the owner's order" "The owner ($u), word for word: “Tell the manager: ship the billing slice first.”"`, 'Relay the order word for word') },
  // Row 5: a thread session asks the manager; the manager's reply lands back in that exchange.
  { id: 'thread-asks-manager', on: { userTextIncludes: 'ask the manager when export can start' }, respond: bash(`supercode message send sc:${MACHINE}:agent:manager --subject "export start" "When can the export work start?"`, 'Ask the manager') },
  { id: 'manager-answers-thread', on: { userTextIncludes: 'When can the export work start?' }, respond: bash(`supercode message reply ${idOf('When can the export work start?')} "After the billing slice lands."`, 'Answer the thread') },
  // RFC 0022 rows 4-5: the machine-health pack's alarm wakes the maintainer with the reading; it reads and decides, and
  // kills a runaway by its exact PID, only the World's own marked one.
  { id: 'health-alarm', on: { userTextIncludes: '[Machine health]' }, respond: bash(`body=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | startswith("[Machine health]"))] | sort_by(.created_at_ms) | last.body'); said="Read: the reading stands (top -l 1: $(top -l 1 -n 0 | grep PhysMem | cut -c1-60)); nothing here is mine to kill"; pid=$(printf '%s\\n' "$body" | grep 'process.cpu' | grep -o 'pid [0-9]*' | head -1 | cut -d' ' -f2); if [ -n "$pid" ]; then cmd=$(ps -p "$pid" -o command= 2>/dev/null); case "$cmd" in *vorg-runaway*) kill "$pid" && said="Killed pid $pid ($cmd) by its exact PID: the World's runaway";; *) said="$said; pid $pid ($cmd) is not this machine's runaway: left it";; esac; fi; supercode message reply ${idOf('[Machine health]')} "$said."`, 'Read and decide') },
  // Row 18: in a thread, the owner asks about a decided matter from another topic; the thread answers from the record (the
  // agent's threads, which every session of it reads: decision 23) without asking main.
  { id: 'thread-from-record', on: { userTextIncludes: 'what did we decide on billing' }, respond: bash(`said=$(supercode message threads --agent account-manager --json | jq -r '[.[] | select((.root // "") | tostring | contains("billing"))] | first.id') && answer=$(supercode message thread "$said" --json | jq -r '[.[].envelope | select((.body // "") | startswith("Billing:"))] | last.body') && supercode message reply ${idOf('what did we decide on billing')} "From the billing thread ($said): $answer"`, 'Answer from the record') },
  // Row 19: the owner asks about another topic's undecided state; the thread asks main (To), and main answers from its CC
  // picture; the thread then answers the owner.
  { id: 'main-answers-thread', on: { userTextIncludes: 'Main: where does the pricing topic stand?' }, respond: bash(`supercode message reply ${idOf('Main: where does the pricing topic stand?')} "Pricing is undecided: the owner has not chosen between seats and usage."`, 'Answer from the CC picture') },
  { id: 'thread-asks-main', on: { userTextIncludes: 'where does the pricing topic stand' }, respond: bash(`supercode message send sc:${MACHINE}:agent:account-manager --subject "pricing" "Main: where does the pricing topic stand?"`, 'Ask main') },
  { id: 'thread-relays-main', on: { userTextIncludes: 'Pricing is undecided' }, respond: bash(`supercode message reply ${idOf('where does the pricing topic stand')} "Main says pricing is undecided: seats or usage is still yours to choose."`, 'Answer the owner') },
  // Row 16: a call is a thread: main delegates it at once (the call has nothing to answer yet).
  { id: 'call-delegate', on: { userTextIncludes: 'A call started' }, respond: bash(`supercode message delegate ${idOf('A call started')}`, 'Delegate the call') },
  // Row 24: the call's thread session answers what its voice forwards; the voice speaks the reply in the call.
  { id: 'call-answer', on: { userTextIncludes: 'Your voice interface is forwarding a request' }, respond: bash(`supercode message reply ${idOf('Your voice interface is forwarding a request')} "We landed on CSV first, then the API. It is recorded as this thread's first answer."`, 'Answer the call') },
  { id: 'housekeeping', on: {}, respond: { text: 'Ready.' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'GENERATED by world/model/anthropic.ts', handlers }, null, 2)}\n`);
