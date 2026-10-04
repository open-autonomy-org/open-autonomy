# Records register

The organization's inventory of its records and their retention schedule: every document, ledger and log it keeps, with
who owns it, who writes it, where its original is, how sensitive it is, and how long it is kept. It follows the frame of
ISO 15489-1:2016 (records management) and ISO/IEC 27001:2022 Annex A 5.9 and A 5.12 (information asset inventory and
classification), with the fields of the UK National Archives' Information Asset Register. It is an inventory, not a
claim of certification.

**Register a record before using it.** A new document, ledger or log gets its entry here, or in the volume for its
repository, before anything reads or writes it: its owner and original named, the fields below filled. The entry changes
when its owner, access, retention or original changes. A copy is registered as a copy of its asset. Retiring an original
keeps its history and names its successor. A record's owner keeps its entry; the manager reconciles the register; the
auditor counts what is unregistered each round. Work and findings belong on the board; this register is not a task list.

`tools/records-check.mjs` holds the rule: the record repository's pre-commit refuses a commit that adds a record with no
entry, and stubs the entry (fields `TBD`) for the writer to complete. `records.json` says which files are records here
and which roots make up the estate the auditor counts. Both are written by `create-open-autonomy records init`.

## Volumes

Entries are table rows whose first cell names the path in backticks. `records-register/<owner>--<repo>.md` holds one
repository's entries by their path inside it; any other volume (for example `records-register/operations.md`) holds
records outside a repository by absolute path, `~/` for the home. An entry naming a folder is a series and registers
every file under that folder (a log directory, an evidence folder, a mailbox). One original per path: a
checkout, worktree, export or hosted view is a copy of it, never a second original.

| Asset / original path | Purpose | Owner | Writers | Copies | Format | Classification | Access | Retention | Depends on / replaces | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|

- **Owner:** the one role accountable for the record. Where none is declared, the manager is its interim steward, said so.
- **Writers:** who may change it. **Copies:** where else it is kept, each a copy of this original.
- **Classification** (below), **Access:** who may read it, as required, distinguished from what is observed.
- **Retention** (a code below). **Depends on / replaces:** what reads it, what it supersedes.
- **Evidence:** where the entry's claims come from (a file at a commit, a decision).

## Classification

- **Public:** explicitly published.
- **Internal:** working documentation and synthetic technical material; readable by the organization's private
  repositories' members.
- **Confidential:** accounts, commercial and legal material, mail, transcripts, recordings and operational details;
  readable by the named people and agents doing that work.
- **Restricted:** credential custody and anything carrying a claimable token; readable by its custodian and the named
  service that consumes it.

An entry here makes nothing public. The register itself is confidential: it names where sensitive things are.

## Retention schedule

A code is a disposition, not a statutory period; nothing here authorizes a purge. An incident, a customer obligation, an
open card or a legal hold overrides any disposal.

| Code | Trigger, period and disposition |
|---|---|
| H | Historical decisions, dated measurements and accepted evidence: kept in their original and its history; no expiry. A numbered decision is never rewritten. |
| C | Current documentation and configuration: kept while used, updated in place; history kept when replaced. |
| B | The board, its archive and runtime history: kept through open work and its acceptance; ended cards kept for provenance. |
| E | Evidence (recordings, clips, stills, receipts, findings): kept with the card that owns it, with its exact commits, failed rounds included. |
| L | Operational logs: kept while a diagnosis or a card needs them; what is evidence is preserved before rollover. |
| S | Restricted custody: kept while required; rotated or revoked through its service; never copied into git or a recording. |
| T | Retiring: kept until its retirement has removed every live read and write; its history kept, its successor named. |
| Q | Reconstructible cache, cursor or lock: kept while its producer uses it; removed only by its lifecycle's own cleanup. |

An organization agrees numerical periods with each record's owner and writes them into the entries; the register never
invents one.

## Duplicates and orphans

| Finding | Evidence | Disposition and owning card |
|---|---|---|
