import { ACCOUNT } from '../lib.ts';
#!/usr/bin/env bun
// The scripted model for the review World: what the OpenAI twin answers each profile's scheduled wake, so the jobs run
// and their output can be read. The proof rows' acts (a root, a delegate, a draft, a reply) are the reviewer's, driven
// through the sessions' panes and supercode's doors; this script does not stand in for them. Handlers key on the
// conversation's own text; the first match wins.
// The machine's mail name: a mail agent's address is sc:<machine>:agent:<name>.
const { MACHINE } = await import('../lib.ts');
const card = await import('./card.ts');
const handlers = [
  // After a command, the job's turn ends.
  { id: 'after-command', on: { lastMessageIsToolResult: true }, respond: { text: 'Done.' } },
  // The board-card story (model/card.ts): its reviewer first, since the review's prompt also carries the card's title.
  ...[card.CARD_TITLE, card.NATIVE_TITLE].flatMap((title, i) => [
    { id: `card-reviewer${i ? '-native' : ''}`, on: { userTextIncludes: card.REVIEWER_PROMPT, anyTextIncludes: title }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd: card.reviewer(process.env.VO_AGENT_HOME!) } } } },
    { id: `card-coder${i ? '-native' : ''}`, on: { anyTextIncludes: title }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd: card.coder(process.env.VO_AGENT_HOME!) } } } },
  ]),
  // Row 13: the manager's tick reports to the account manager (its mailbox), never to the principal.
  { id: 'manager-tick', on: { userTextIncludes: 'MANAGER TICK' }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd: `"\${SUPERCODE_BIN:-supercode}" message send sc:${MACHINE}:agent:account-manager --subject "tick" "Tick: the board read; one draft promoted (Audit export); no arc idle; no real blocker for the principal."` } } } },
  // RFC 0021 rows 2 and 6: a coder works a card on the install's repository: commits on the card's branch, pushes it, and
  // opens its PR on the GitHub twin; the board then starts the arc's one review on its own.
  // RFC 0021 row 6: the board's review runs the reviewer profile; it records its verdict (request-state done with its
  // evidence), and the card's creator or the manager accepts the arc.
  { id: 'reviewer-verdict', on: { anyTextIncludes: 'You are the independent reviewer of card' }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd:
    `head=$(curl -s -H 'authorization: Bearer world-bot' "$GITHUB_TWIN_URL/repos/${ACCOUNT}/pulls?state=open" | jq -r '.[0].head.sha') && "\${SUPERCODE_BIN:-supercode}" workflow request-state "$HERMES_KANBAN_TASK" --state done --reason "the review passed" --evidence "verdict: pass by the reviewer profile; PR head read whole against main" --reviewed-sha "$head" --root "${process.env.VO_AGENT_HOME}"`,
  } } } },
  { id: 'coder-review-demo', on: { anyTextIncludes: 'Audit export (review demo)' }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd: [
    'cd "$HERMES_KANBAN_WORKSPACE" && git checkout -q -B "$HERMES_KANBAN_BRANCH"',
    'echo "Audit export: CSV first, then the API." > AUDIT.md && git add AUDIT.md && git -c user.name=coder -c user.email=coder@example.test commit -q -m "audit export"',
    'git push -q origin HEAD',
    `curl -s -X POST -H 'authorization: Bearer world-bot' -H 'content-type: application/json' "$GITHUB_TWIN_URL/repos/${ACCOUNT}/pulls" -d "{\\"title\\":\\"Audit export\\",\\"head\\":\\"$HERMES_KANBAN_BRANCH\\",\\"base\\":\\"main\\"}" | head -c 300`,
  ].join(' && ') } } } },
  { id: 'am-digest', on: { userTextIncludes: 'DIGEST.' }, respond: { text: 'Digest: nothing reached done since the last one; nothing is blocked; nothing needs your word.' } },
  // RFC 0022 rows 1-3: the auditor's round reads the hour's mail in full (here, the account manager's main mailbox) and
  // sends the account manager each finding with its act, rule and source: an owner line with no answer, draft, ruling or
  // "not doing" (a lost request), and a relay of an owner line that is not word for word.
  { id: 'audit-round', on: { userTextIncludes: 'AUDIT ROUND.' }, respond: { toolCalls: { name: 'exec_command', arguments: { cmd: [
    `mail=$HOME/.config/supercode/mail; am=$(jq -r .main_session $mail/agents/account-manager.json); to=sc:${MACHINE}:agent:account-manager`,
    `box=$("\${SUPERCODE_BIN:-supercode}" message inbox --session "$am" --json --all)`,
    // lost requests: the owner's lines to the account manager that nothing answers
    `printf '%s' "$box" | jq -r '[.[].envelope] as $all | $all[] | select(.kind == "user" and ((.from | tostring) | contains("operator:owner"))) | select(.id as $id | (($all | map(.in_reply_to) | index($id)) or ($all | map(.body) | any(contains($id)))) | not) | (.id + " " + .body)' | while read -r id body; do "\${SUPERCODE_BIN:-supercode}" message send "$to" --subject "finding: lost request" "Finding (lost request): the owner's line $id has no answer, draft, ruling or not-doing. Rule: RFC 0022 decision 4, all the mail. Source: $id \"$body\"."; done`,
    // relays: a message from the manager that relays the owner without the owner's words
    `printf '%s' "$box" | jq -r '.[].envelope | select(.body | startswith("Relaying the owner")) | (.id + " " + .body)' | while read -r id body; do src=$(echo "$body" | grep -o '(m-[0-9a-f]*)' | tr -d '()'); "\${SUPERCODE_BIN:-supercode}" message send "$to" --subject "finding: relay" "Finding (relay not verbatim): $id relays $src as \"$body\", not the owner's words. Rule: RFC 0022 decision 4, relays; RFC 0020 decision 20. Source: $src, $id."; done`,
  ].join('\n') } } } },
  { id: 'box-pass', on: { userTextIncludes: 'HOURLY PASS.' }, respond: { text: 'Hourly pass: disk, processes and the ledger read; nothing to act on.' } },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'GENERATED by world/model/scenario.ts', extractors: {}, handlers }, null, 2)}\n`);
