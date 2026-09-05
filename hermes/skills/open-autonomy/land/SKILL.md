---
name: land
description: Land a change the Open Autonomy way — the agent branch off a fresh main, a signed commit naming the item, a push the landing workflow merges, never a wait.
version: 2.0.0
metadata:
  hermes:
    tags: [open-autonomy, git, landing]
    category: devops
    requires_toolsets: [terminal]
---

# Landing

You cannot push to `main` and must not try; you cannot open pull requests and do not need to.

1. Start from a fresh `main` before you change anything: `git fetch origin && git checkout -B agent/<item-id>
   origin/main`. If you already changed files, do this first and carry the changes over.
2. Commit small, with the item id first in the subject (`add: appends an item and prints its id`), signed
   off as the agent so the history shows what the agent did:
   `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>"`.
3. `bun run check` must pass before every push. Fix the cause; never weaken a test.
4. Push the branch: `git push -u origin agent/<item-id>`. The landing workflow opens the pull request and
   merges it when the required checks pass. Do not wait for it. If the push is rejected because the branch
   exists from an earlier run, push to `agent/<item-id>-<YYYYMMDD-HHMM>` instead.
5. Never rewrite history, never force-push.
