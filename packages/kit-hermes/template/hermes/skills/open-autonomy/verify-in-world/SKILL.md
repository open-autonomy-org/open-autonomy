---
name: verify-in-world
description: Verify an acceptance line against the project's own world (its volter twin world) as its operator — never production, never a second agent.
version: 2.0.0
metadata:
  hermes:
    tags: [open-autonomy, verification, world]
    category: devops
    requires_toolsets: [terminal]
---

# Verifying in the world

You cannot reach the project's production and must not try. `AGENTS.md` says where the project is verified:
its checks, and its local or twinned surfaces.

- A green unit test is not proof that a surface works. Where an acceptance line names a surface, exercise
  the surface and read what came back.
- Where the project keeps a volter world, you are that world's operator: bring it up, exercise each
  acceptance line against it with `curl` and by reading the responses, tear it down. You are never a second
  agent inside it: never start another Hermes.
- If a line needs a deploy, a dashboard or the owner, stop and say exactly what is missing. Deploying is a
  maintainer's reviewed step; say so rather than claiming a live site.
