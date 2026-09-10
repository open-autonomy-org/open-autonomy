# The rehearsal

Every project the kit makes gets one: its own world, its brain running in it on a scripted model, and stories driven
through it. It answers "does this project's method work" the way the world answers "does the product work", and it is
where a change to a door, a skill, a job or the books is proven before anything real sees it.

**Nothing in a rehearsal calls a real API.** The vendors are twins, the model is the project's scripted brain (the
model twin serving a scenario), the seats are dry, and the custody the doors read is written by the world. A story
that needs a real credential is not a story.

```text
.open-autonomy/rehearsal/    the kit's, kept current by `create-open-autonomy upgrade` — never edited in place
  run.ts                     the front door: up | fresh | down | seed | stack | story | stories | say | hermes | env | url
  seed.ts                    the project on the GitHub twin, its account funded, its keys minted the adopter way
  platform.ts                the backend copy: the real worker on the twins (the model rail on the model twin)
  actions.ts                 GitHub Actions played by the world (the landing convention: pull request, ci, delete)
  stack.ts                   the brain: the kit's start script on the world clone, from a clean environment
  story.ts                   one story, act by act, with the brain's monitors ticked after each act
  lib.ts                     where the world's state lives, the twins' CLIs, the project's hooks
rehearsal/                   the project's own — seeded once by `create`, yours to write from there: the starter is
                             the GitHub and Discord twins, a scripted PM whose one beat plans every new issue as a
                             sourced outcome and lands the plan, one story (an issue → `job pm` → the roadmap on main),
                             and a `roadmap` condition reading that roadmap through the twin's API
  env                        settings, never secrets: REHEARSAL_WORLD, WORLD_STATE_ROOT, TWINS_ROOT, OPEN_AUTONOMY_ROOT,
                             REHEARSAL_CLIENT_REPO, REHEARSAL_BRANCH_PREFIX, REHEARSAL_JIRA_PROJECT, REHEARSAL_ASSIGNEE,
                             REHEARSAL_CLIENT, REHEARSAL_VALVE_PORT, WORLD_HERMES_BIN ($HOME expands; the shell's export wins)
  world.json                 the twins this project's channels need (${TWIN:github}, ${KIT_DIR}, ${SCENARIO}, ${DATA});
                             a service of the project's own under ${REHEARSAL_DIR}
  model/scenario.ts|.py      the scripted brain: prints the scenario document the model twin serves
  stories/*.jsonl            one story per shape of the method
  hooks.ts                   custody, seed, acts, conditions, stackEnv, models, hermesBin, ticks — what the kit cannot know
```

A brain on the owner's Codex subscription (`provider: openai-codex`) is pointed at the model twin's Responses door by the
stack. `REHEARSAL_MODEL=real bun .open-autonomy/rehearsal/run.ts up` is the dress rehearsal: the brain thinks on the
computer's own Codex login while every vendor is still a twin and the seats stay dry; a story's exact words are the
scripted brain's, so a real one is judged by reading what it did, not by the runner's verdict.

## Running it

```bash
bun .open-autonomy/rehearsal/run.ts up          # the twins, the backend copy, the seed, the brain
bun .open-autonomy/rehearsal/run.ts stories     # every story: one line each, verdict and seconds
bun .open-autonomy/rehearsal/run.ts fresh       # start over (a restart is `fresh`, never down-then-up)
```

A story takes seconds to a couple of minutes: the scripted brain answers immediately, and the runner ticks the
monitors itself rather than waiting on their schedule. Budget a wait in a story accordingly (`"budget": 90`), never
for a real model's pace.

**A project that is a directory of a larger repository** (a cookbook in a product's tree) is seeded as a repository of
its own: one commit holding that directory's tree at HEAD, on top of the world's main when the world already has one.
Its `.open-autonomy/` and `rehearsal/` are its own; the tree around it never enters the world.

**A restart is `fresh`.** A world's down-then-up is a new instance: the twins' vendor roots outlive it but the
instance's blob store does not, so the GitHub twin keeps refs whose objects are gone and every later push fails.
Worlds are cheap.

## The rules the machinery enforces

- **A wake names its own procedure.** A job's prompt carries a token (`WAKE: CHANNEL`) the skill text never contains;
  a scenario keyed on a procedure's name alone matches every session.
- **A monitor's line leads with its state** (`ready|PROJ-1|…`), so a scenario reads the changed line of a diff and
  never a stale line of the listing that follows.
- **A door prints its own verdict word first**, never the vendor's spelling. A vendor that spells a state two ways
  cannot then break a rehearsal, and the scripted brain and the real one read the same thing.
- **A task comment never carries a pull request's address**: Hermes reads one as the task's own open pull request and
  holds its worker back.
- `run.ts up` refuses a scenario marker that also occurs in the skill or soul text, and names any marker no door
  prints. Both failures are otherwise invisible until a story stalls.
