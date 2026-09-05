# Vision

notes-api is built by its own agent, in the open. This document says why the project exists and what it
holds to; the agent reads it before it reads the roadmap, and the project's page shows its opening paragraph.

## Why

A notes service small enough to read in one sitting and complete enough to run: create, list, read, delete
and search notes over HTTP, with a test that starts the server for every endpoint it adds. It is the second
Open Autonomy cookbook, and the one that is a service rather than a tool.

## What we hold to

- **The roadmap is the promise.** `ROADMAP.yml` says what will be built and in what order.
- **One endpoint, one test.** Every item is one route and the test that starts the server and probes it.
- **No dependencies.** bun's own server and test runner, nothing installed.
