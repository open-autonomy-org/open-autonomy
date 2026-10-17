# ADR 0019: A seam may name the routine its act runs through; members carry their Volter identity; the owner's acts wait for the Release

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur.

## Context and sources

**Authorization.** The owner locked the design in runhuman-2 `apps/rh2/docs/adr/0038-routines-offerings-and-human-work.md`
(RFC 0017, Volter's company repository). The lines it rests on: "we should have a depth of specifically for human
actions in open autonomy (possible, not necessarily mandated) that makes evidence desk easy"; "make all processes, even
human ones, fully within the orchestration/autonomation"; and this project's own ruling that nothing is routed to the
owner but the Release ("no approvals, pages to open or waits"). Its §11 and changes O1 and O2 are this record's.

**What exists.** ADR 0008: people act at declared seams `{id, scope, door, record}` through three doors; chat is
never a door; Open Autonomy declares and runs nothing. The Team codec holds `github` and `discord`. The soc2 template's
people record their acts in pull requests to the Evidence Desk workspace, reminded by issues. The owner is contacted
once per release, on the Release pull request (`maintain.ts ship`, its `Owner does`).

## Decision

1. **A seam may name a `routine`** (`sdk/seams.ts`): `routine:<org>/<name>`, or the bare name of a routine in the
   project's linked Volter workspace. It is optional; `door` and `record` stay required. Open Autonomy still runs
   nothing: whoever files the act (Evidence Desk) runs it there, and the act's record is what the seam says.
2. **The `member` seam scope**: every roster member, each for their own act (acknowledging the policies on joining).
   It decides nothing for anyone else, so it is the one seam scope no roster entry holds by name.
3. **`volter: { subject }` on a member** (`sdk/team.ts`), recorded only from the member's own sign-in: signed in with
   Volter on the platform, they open `/team/volter` and are shown a link (a day-long token the platform signs, naming
   the GitHub account and Volter subject Volter's identity token gave). An owner pastes it into their Team entry; the
   platform verifies it and refuses it for any other GitHub account than the entry's. Later edits keep it while the
   GitHub account is the same. A subject is never typed into a roster.
4. **The soc2 template names routines** for the acts people owe in a Volter workspace: `policy-approval` (owner,
   `approve-policy`) and `onboarding` (member, `acknowledge-policies`), both through the `platform-key` door: the
   answer is given under the person's own Volter sign-in, a key no agent holds.
5. **Acts the owner owes wait for the Release.** Evidence Desk holds them and lists them on the open Release pull
   request once its release is requested; PM's `Owner does` names them. Acts other members owe go when due.

## Consequences

- Evidence Desk can file a seam's act as a run and collect its answer, attributed through `volter.subject`.
- A seam without a routine is unchanged; a project that never links a workspace sees nothing new.
