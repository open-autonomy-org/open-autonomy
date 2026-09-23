# Records of people's acts

This project declares its seams in `.open-autonomy/config.yaml`. Four of them are recorded here, one JSON file per
act, added in a reviewed pull request by the person who acted: the commit is the act and its record. Evidence Desk
reads these folders as populations for the audit.

| Folder | One file per | Fields |
|---|---|---|
| `incidents/` | security incident | `kind: "incident"`, `id`, `detected_at`, `severity` (low, medium, high, critical), `status` (open, contained, resolved, closed), `summary`, `notification` (who was told and when, or why no one needed to be), `review` (cause and follow-ups, when closed) |
| `break-glass/` | change made to production outside the reviewed flow | `kind: "break-glass"`, `id`, `at`, `by`, `change`, `reason`, `reviewed_after` (the pull request that reviewed it afterwards) |
| `credentials/` | credential issued, rotated or revoked | `kind: "credential"`, `id`, `at`, `by`, `custody_name` (never the value), `action` (issued, rotated, revoked), `reason` |
| `escalations/` | escalation that reached a person | `kind: "escalation"`, `id`, `received_at`, `responded_at`, `channel`, `summary` |

Name each file `<date>-<short-id>.json`. Update an incident's file as it progresses; the history of the file is its
timeline. Never put secrets, customer data or personal information in these files: the repository and its sessions are
public.
