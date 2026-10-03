# What __PROJECT__ is and must remain

Say, in one paragraph, what this organization is for, in its owner's words. Changing this file is the owner's act.

## Invariants

- **One lane per install, one board per lane.** This install runs one of the organization's lanes (`lane:` in
  `.open-autonomy/config.yaml`; the product lane when it names none) on its one board, every card tagged with its
  primary project. An organization that runs both lanes runs two installs, which meet in the calendar.
- **Every job its own profile.** The root is the organization's layer only; nobody runs as it and no card is assigned to
  it.
- **Hub and spoke.** Workers talk to the manager, the manager to the account manager, the account manager with the
  principal.
- **Review is the board's.** Each arc gets one independent review, started by the dispatcher.
- **Unknown is not zero.** A measure not collected is reported as not collected.
