# ADR 0003: The owner's running/paused word travels through the SDK

Status: Proposed. Accepted only upon independent constitution review and merge of this record and
its implementation.

## Context and sources

An operator stop on September 11, 2026 (Hookline and Evidence Desk paused for the owner) was done
through the machine's service manager, because the platform and the SDK had no word for it. The
SDK's own README calls the platform "shows, not steers", the constitution says the platform never
drives an agent, and the only owner-side control the wire carries is the roadmap push on a
`steer`-scoped key. The platform's `paused` flag on the books means a funded balance ran out, not
an operator's act.

Source of authorization: the owner's coding conversation, September 11, 2026, after that stop:
"the sdk is supposed to be for handling the two way communication for both control and
reporting"; "the sdk is what plugs into the 'arbitrary shape of automation' instead of requiring
us to reach directly into the automation itself ... as long as it 'implements the interface' of
the sdk, we can operate it"; "this is not imposing any top down concept of HOW the automation
should work ... a few points of integration that are at 'exactly the right level of
abstraction'"; "the spine of what is 'happening' is the 'tasks' and 'sessions' when it comes to
reporting ... the abstractions on open autonomy are very simple and straightforward. For instance
it could just be 'running' vs 'paused'." The conversation has no public permalink; these
quotations record its scope, not a claim of independent approval. Everything past the shape they
name (the wire's field names, the kit's pause scope, the page's wording) is this author's
extrapolation, marked below.

What exists (source audit, same day): the events wire publishes sessions, updates, tasks, the
agent's setup and the project's documents; the roadmap push is the one owner-side door; the valve
forwards the narration routes and public reads of the account; the Hermes kit's reporter reads
native state through Supercode's SDK, which can list, pause and resume the harness's own jobs.

## Decision

The SDK is the interface an automation implements, in both directions. Reporting's spine stays
tasks and sessions; control is one word, the operating state, `running` or `paused`.

- **The owner requests.** `POST /v1/agent/state { state, reason? }` on a `steer`-scoped key
  records the owner's desired state for the key's account: who, when, why. The platform holds it
  exactly as it holds the owner's roadmap revision. It applies nothing and reaches into nothing.
- **The automation reads and applies.** It reads `GET /v1/accounts/:account/state` (a public
  read, so the valve forwards it) and applies the word through its own machinery, whatever that
  is. The platform prescribes no method: not cron, not queues, not interruption.
- **The automation reports what is true.** It publishes `org.open-autonomy.agent.state`
  `{ state, note? }` on the events wire (the `narrate` scope), and only when the state is true of
  it. An automation that never reports has not implemented control; the page says so by showing
  a request with no answer.
- **Two records, never merged.** The desired state is the owner's word; the observed state is the
  automation's. The page shows both when they differ ("pause requested, still running") and the
  one word when they agree. Reporting alone never implies controllability.
- **Default.** With no request ever made, the desired state is `running`; with no report ever
  made, the observed state is unknown, not `running`.

Extrapolation, this author's: the Hermes kit implements `paused` as *the scheduled runs stop*:
the reporter pauses each enabled job through the harness's own schedule, remembers which, lets a
run in flight finish, and reports `paused` once no job is enabled and no run is live; `running`
resumes exactly the jobs it paused, so a job the owner disabled on their own stays disabled.
Conversations on a channel still answer; a person talking to the project is not the funded work.
The kit records that scope in its README so an owner knows what their word does.

## Alternatives and tradeoffs

- **A committed `paused:` in `.open-autonomy/config.yaml`.** The owner's committed word is the
  constitution's authority, and a sync already carries the config. Rejected as the sole door: a
  ten-minute sync is not an operator's lever, and it would make the repository's history the
  audit trail of every pause. The steer key is minted only by proof of repository control, so the
  authority is the same; the record stays on the platform beside the roadmap revisions.
- **A richer control vocabulary** (drain, interrupt, per-job, send a message, request a decision).
  Rejected for now: each would impose a concept the automation must have. The owner ruled the
  abstractions simple; the two-record shape leaves room for more words later without changing it.
- **The platform driving the harness** (a Supercode call from the worker). Rejected: it reaches
  around the interface and would make the platform a controller, which the constitution forbids.
- **Stopping the service manager**, as was done. It works, and remains the operator's fallback,
  but it is invisible on the page, unreported, and needs the machine.

## Consequences

- The backend gains one small record per account and two routes; the events wire gains one type.
- The SDK gains `state`, `requestState` and `reportState`; the valve forwards the state read.
- The kit's reporter gains the control step and a `paused_jobs` entry in its state file. An
  installed reporter older than this change reads a `not_forwarded` refusal from its valve and
  logs once; the owner's request waits, visibly unanswered, until the install is upgraded.
- The page's header shows the operating state when it is anything other than agreed `running`.
- Nothing here changes metering, credentials, the account tree or the balance hard-stop.

## Constitution review

- *The platform shows; it does not steer. They never drive an agent.* Preserved: the platform
  originates nothing and applies nothing. It records the owner's word and shows the automation's
  answer, the same relation it already has to the owner's roadmap push. The one who drives is the
  owner; the one who applies is the automation.
- *Only the SDK is real.* Preserved and extended: the observed state arrives through the SDK from
  whatever substrate the project runs; the platform reads no harness file to learn it.
- *Authority comes from the repository, not from a key.* Preserved: a `steer` key is minted by
  the claim file at HEAD; pausing narrows the committed schedule and resuming restores it; the key
  widens nothing.
- *Every spend is metered; the ledger's settled cents are the only cost.* Untouched.
- *No automated tests.* The change is verified by hand in the world: a steer key's request, the
  reporter's pause of the twin's jobs, the report, the page, and the resume.
- *Out of scope: not an agent framework.* Preserved: the platform names one word and no method.

This record cannot amend the constitution and does not need to.
