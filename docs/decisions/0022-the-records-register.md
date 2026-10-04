# 0022: The records register is a standard part of a company install

- Status: proposed (card t_4007dd5b, task c55; carried from the records arc t_6d5ad5f5). Revisable by any later card.
- Date: 2026-10-04

## Context

Volter's owner, 2026-10-02: "let's lock it in so that it's a standard part - I think that's important that it all has
a registry - consider how many docs we have just sitting around".

Volter already keeps a register (its record repository's `company/records-register.md` and volumes): ISO 15489-1:2016
and ISO/IEC 27001:2022 Annex A 5.9/5.12, the UK National Archives' Information Asset Register fields, a four-level
classification and retention codes, and the rule "register a new ledger before using it". It is kept by hand, with no
check, and session transcripts, relay ledgers and many ad-hoc documents went unregistered. Open Autonomy's company skew
had none of it.

## Decision

1. **The kit ships the register.** `packages/kit-hermes/records/` holds a generic template (the register's frame: its
   fields, classification, retention codes and the register-before-use rule, nothing organization-specific),
   `records.json` (which files are records, where the register is, the estate's roots), and one dependency-free check,
   `records-check.mjs`.
2. **It lives in the organization's record repository**, where the company skew already says the record is.
   `create-open-autonomy records init <record repository>` writes the template only where it is missing, and the check
   always: the check is the kit's file there and is refreshed by each init. An existing register is kept and read in
   place (`records.json` names its paths).
3. **A record is registered before it is used, at commit.** The record repository's pre-commit runs the check on the
   files a commit adds. One with no entry is refused. The check also stubs the entry (`TBD` fields) in the
   repository's volume and stages it, and refuses until the writer completes it. Where the repository already has a
   pre-commit, init puts the check first in it.
4. **Entries are Markdown table rows** whose first cell is the path in backticks, in one volume per repository
   (`<owner>--<repo>.md`, paths inside the repository) or in a volume of absolute paths for records outside one. A path
   ending in `/` is a series and registers every file under it (a log folder, an evidence folder, a mailbox). This is
   the shape Volter's register already has, so it is checked as it stands.
5. **The auditor counts what is unregistered every round.** `create-open-autonomy records estate <record repository>`
   walks the roots `records.json` declares (every repository checkout, home and state directory of the install). For
   each root it gives its record count and every record with no entry or a stub. A root of the install missing from
   the list is itself a finding.
6. **The manager reconciles.** A record's owner keeps its entry. The manager sends each unregistered record to an arc
   that registers it or retires it as a duplicate or orphan, and adds a new root when one appears. These are rules in
   the skew's manager and auditor profiles and in the home's shared rules.

## Consequences

- A company install upgraded to this kit carries the rules. Its record repository gets the register on one
  `records init`. The estate reads zero only when every record is registered or retired.
- Which files count as records is a pattern list (`include`/`exclude` in `records.json`): documents, data and ledgers
  by extension, without code, dependency locks and build output. An organization widens or narrows it there.
- The check reads every volume on each commit. That is a few hundred Markdown files for Volter, so it stays fast and
  has no dependency beyond Node and git.
- The register's classification, retention codes and ownership law are the frame Volter adopted (its manager decision
  D16). An organization keeps or replaces them in its own register file.
