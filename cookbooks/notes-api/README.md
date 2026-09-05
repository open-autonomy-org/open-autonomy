# notes-api

A small notes HTTP service, built endpoint by endpoint by this project's agent. It exists to prove the Open
Autonomy kit on something that is not a command line: each roadmap item is one endpoint and one test, and
`bun run check` starts the server and probes it. The agent works its board top to bottom; watch it on the
project page.

```bash
bun run serve          # http://127.0.0.1:8080
bun run check
```
