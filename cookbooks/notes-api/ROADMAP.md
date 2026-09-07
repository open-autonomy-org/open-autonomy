# notes-api roadmap

Sourced working notes maintained by the Hermes PM scrum. Imported historical intentions await reconciliation; existing tasks, owners and holds remain intact.

## health: GET /healthz says the service is up

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `health`. This is not evidence of current priority or completion.

Completion:
- `GET /healthz` answers 200 with `{ok: true}`; a test starts the server on a free port and asserts it.

## create: POST /notes creates a note

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `create`. This is not evidence of current priority or completion.

Completion:
- `POST /notes` with `{text}` answers 201 with `{id, text, created}`; ids are small integers that never repeat; a test creates two notes and asserts ids 1 and 2.

## list: GET /notes lists the notes

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `list`. This is not evidence of current priority or completion.

Completion:
- `GET /notes` answers 200 with every note, oldest first; a test creates two and lists them.

## read: GET /notes/:id reads one note

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `read`. This is not evidence of current priority or completion.

Completion:
- `GET /notes/:id` answers 200 with the note, or 404 `{error: "not_found"}`; a test asserts both.

## remove: DELETE /notes/:id removes a note

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `remove`. This is not evidence of current priority or completion.

Completion:
- `DELETE /notes/:id` answers 204 and the note is gone from the list, or 404 when absent; a test asserts both.

## search: GET /notes?q= searches the notes

Status: historical intention; reconcile with the live board and landed work.
Dispatch: hold

Source: [committed seed](hermes/kanban.seed.json), key `search`. This is not evidence of current priority or completion.

Completion:
- `GET /notes?q=<word>` answers the notes whose text contains the word, case-insensitive; a test asserts a hit and a miss.

## Questions and scrum notes

No scrum has reconciled this import yet. Record decisions, human commitments, release review gates and evidence here.
