# ADR 0001: Separate runtime placement from Codex authentication

Status: Accepted only upon independent constitution approval and merge of this record and implementation; proposed until both occur.

## Context and sources

Open Autonomy already has a credential valve, a reporter using the Supercode and Open Autonomy SDKs,
and native Hermes. Calling all host behavior a “Codex sidecar” conflated their responsibilities.
[PR 585](https://github.com/open-autonomy-org/open-autonomy/pull/585) removed container host startup,
returned reporting to the container and restored copied Codex logins. Its `CLAUDE.md` instruction was
then cited to close [PR 593](https://github.com/open-autonomy-org/open-autonomy/pull/593).
These are observed changes, not evidence that the owner personally approved each architectural choice.
[PR 594](https://github.com/open-autonomy-org/open-autonomy/pull/594) proposed a broad restoration;
this decision replaces that proposal and the conflicting instruction, not an earlier accepted ADR.

Source of authorization: the owner's coding conversation, September 10–11, 2026, after reviewing
that conflict. The agreed answer was “Keep OA’s existing valve and reporter. Remove unnecessary
orchestration around them,” with host services/container Hermes, local components for bare runs and
no saved project Codex login. The owner then directed “okay yea so make it happen.” The conversation
has no public permalink available to this author; these quotations record its scope, not a claim of
independent approval. [PR 596](https://github.com/open-autonomy-org/open-autonomy/pull/596) established
the constitution review process this proposal follows.

## Decision

- Keep the existing valve for scoped development connections and the existing reporter for publication.
  The reporter reads native Hermes through Supercode's SDK and publishes through OA's SDK.
- In container mode, run those services from a trusted host installation. Only Hermes and its tools
  run in the prepared executor. World owns container creation, resources and shutdown; the existing
  start entrypoint owns its child processes and the gateway execution connection. The machine's
  service manager handles restarts. No Docker socket or host credential store enters the executor.
- Bare mode uses the existing local start entrypoint, valve, reporter and Hermes. It needs no container
  startup layer. Bare mode alone provides no filesystem isolation: use synthetic credentials for
  rehearsals, or an OS user boundary protecting the host's credentials for an autonomous installation.
  Sharing a machine does not authorize exposing its real Codex login or project secrets to agents.
- For an explicitly selected Codex subscription, keep Hermes's native `openai-codex` provider and
  forward through the existing valve. The installed Codex owns authentication storage and refresh;
  acquire transient access through its app-server protocol. Do not read, import or save the CLI login
  into an OA/project store. A new acquisition observes the current computer account. Both deployment
  modes use this connection; a twin model bypasses real authentication completely.
- Scope agent credentials to stand-ins and the configured project connections. Do not fall back to
  old imported Codex credentials on failure. Setup verifies the selected computer login and actual
  network/permission boundary before activation; account changes are not diagnosed from a timeout.

## Alternatives and consequences

Importing the CLI login into Hermes is smaller initially, but leaves a separate session which can
outlive a computer account switch and exposes refresh credentials in the agent home. Running all
services inside Docker restores the wrong trust boundary. Reverting a whole previous PR would also
restore unrelated configuration and public SDK surface. None is required for this decision.

The kit needs a small container execution adapter because the gateway's process lifetime must end
when its host connection closes. It is not a scheduler or second agent orchestrator. Container setup
prepares the checkout and verifies Git routes; startup fetches committed configuration and waits for
the reporter's actual SDK readiness event. A failed required child stops the stack.

Existing Compose installations need a deliberate setup migration preserving their volumes and active
work. Existing protected Codex copies become unused; never delete or disclose an owner's credentials
as an incidental upgrade. The host runs reviewed installed code, not code an agent can rewrite. Kit
upgrades do not silently replace the active trusted installation. Network reachability must be proven
for the selected Docker host without publishing credential ports to the network.

## Constitution review

- **Nothing in an agent's reach is a secret that matters:** host credential storage and installed code
  stay outside the executor; native profiles carry stand-ins. Bare runs require synthetic credentials
  or an OS identity boundary. This decision does not grant an exception for an unisolated real fleet.
- **Only the SDK is real:** preserve the existing Supercode-to-OA SDK reporting path; add no parallel
  filesystem parser, report schema or platform knowledge of Hermes internals.
- **Every spend is metered on public books / settled cents are the only cost:** platform-funded calls
  still use existing metered rails. The explicitly chosen computer subscription remains the owner's
  allowance and does not spend project funds; no estimated subscription charge is invented.
- **The platform shows; it does not steer:** World and the host service manager run the installation;
  Hermes remains the native scheduler and coordinator. No platform runtime controller is added.
- **Authority comes from the repository, not from a key:** a GitHub account used by an agent does not
  establish independent human authorship. This sourced proposal needs review; instructions and the
  roadmap must not silently supersede it. Human release authorization remains separate from landing.
- **No automated tests / nothing develops against a real API:** manually exercise changed paths in
  a World, keep observations in the PR, and commit no test code. Authentication protocol compatibility
  can be inspected locally without exposing credentials or making a real model request.

The independent reviewer must assess these claims and the actual implementation, including the bare
credential boundary, current-login behavior, container process cleanup and SDK reporting, before merge.
