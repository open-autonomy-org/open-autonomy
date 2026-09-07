# Agent-led project setup

Read the owner's request and available project context before running setup. The Hermes kit supplies
the development operating defaults. The constitution defines the product; the contributing rules,
agent instructions and runtime describe how it is built. Setup connects its development team to real
services. Application dependencies run against twins during development; their live provisioning
belongs to deployment or customer activation.

The setup agent interprets the brief, recommends defaults, chooses provider-specific steps, and resolves
interruptions with the owner when needed. Keep that judgment in these instructions and the browser
workflow. Deterministic helpers perform bounded operations and check facts: the intended Git target,
command success, credential storage and access. Do not turn this guide into a configuration framework
or treat discovered credentials as decisions.

## Establish the brief and the few choices

For a new project, write its purpose, users, enduring constraints and exclusions into the constitution
from owner direction. Preserve the initial brief and research as source material in the repository,
distinguishing decisions, suggestions and unanswered questions. Cite the actual supplied source or
identify an owner-confirmed setup summary; never invent conversation links. For an existing project,
read and preserve its established constitution and working conventions before proposing changes.
PM owns the sourced roadmap and changelog after handoff. Do not invent a backlog during setup.

Reuse answers already given and present the recommended operating defaults together. Settle only what
is missing and materially affects setup: working name/repository owner, the development host, the model
arrangement and budget, human coordination destination, and owner/release reviewer. Keep the template's
development conventions and native schedules unless the project requires a change. Architecture and
feature questions can remain for PM; credentials or directories found on the machine are availability
evidence, not permission to use them for this project.

Fill the project-owned README, constitution, contributing instructions and verification instructions.
Complete the provisional branding pass in `branding/README.md` before creating integrations. Use the
project name, blurb and icon on its applications; reuse existing project application IDs on a rerun.

The setup CLI creates a missing GitHub repository as public. Establish that this is the agreed target
before running it. A private existing repository does not make published development sessions private.
Keep confidential customer workspaces, human channels and credentials outside the development fleet.

## Select development connections

Run `create-open-autonomy setup . --plan` and reconcile its output with the agreed choices before
running the mutating command. The CLI prepares GitHub repository access, a scoped push key, the platform
connection and owner rules. Its optional development connections are the project's GitHub App, Discord,
and an existing model subscription. Apply the decisions using the existing `--with` and `--without`
options; `--yes` accepts the displayed defaults and is not a substitute for establishing owner authority.

GitHub issues/discussions can be the human coordination channel. Discord is optional, selected only
when agreed, even when a token exists. Do not assume a particular server, channel or application from
the available credential. Follow `hermes/skills/project-communications/SKILL.md` to record the actual
contact agreement, establish the shared team roster and configure native permissions. If the owner
chooses another supported native Hermes channel, the setup agent follows that integration's own setup
instructions and verifies it; this CLI does not provision it. Report unsupported choices explicitly.

Model selection and bounds are the owner's operating choice. Verify an available subscription belongs
to the agreed operator before using it. The platform-funded defaults and optional subscription path
are different arrangements; record the one actually used. Application AI features, if any, are separate
from the model used by Hermes to develop the product.

## Complete credentials with the owner

Use the setup agent's browser skill and the owner's existing signed-in browser sessions for provider
administration and authorization. Complete authorized actions yourself; involve the owner at an actual
human-only step such as a passkey, CAPTCHA, new account or unavailable secret. Do not hand over a list
of portals and stop. Do not extract browser cookies or session tokens. Provider credentials belong in
the setup helper's protected destination or secure prompt, never chat, screenshots or committed files.

| Connection | Setup and credential handoff | Proof before completion |
|---|---|---|
| GitHub repository | Verify the owner and repository; the helper generates and registers a repository-scoped SSH push key | The agent's key can push its branch; main and workflow ownership follow the agreed policy |
| Project GitHub App | The browser agent handles registration and installation; the standalone credential receiver saves the key, then verifies the installation | Through the app/valve, read this repository's issues, PR reviews/checks, workflows and release records |
| Open Autonomy platform | The helper commits a repository-control claim and provisions the developer/treasurer credentials into protected host storage | The project account is correct and the actual reporting/model arrangement works |
| Optional communication provider | Guide the chosen provider's application setup, scopes and installation; use secure credential entry where no callback exists | Read the agreed history, deliver to the agreed destination, and recognize the owner's reply |
| Development model | Reuse the agreed authorized connection or complete the required provider authorization | A call through the installed runtime succeeds under the intended account and bounds |

For Discord specifically, use its developer portal to create/reuse the project application, configure
the needed intents and bot identity, securely enter its token, and authorize the agreed server. Finish
the channel policy and remove temporary setup permissions. Read the communication skill for the native
tool/cron settings and authority checks; a delivered message alone does not prove discovery works.

The shared roster records verified human account IDs and the source of their authority. A setup
operator's login is not automatically the owner or release reviewer. Browser identity, app ownership,
repository access and the human authority agreement must all match. Verify through the installed
connections, not merely the setup operator's broader credentials.

### GitHub credential handoff

The project GitHub App is the normal identity for this template's GitHub API work. Its setup is browser-led,
not a headless registration script. Use the standalone OA credential tool on the runtime host, outside
the development agent's access. It needs no checkout; the kit also bundles the same tool for convenience:

```sh
bun .open-autonomy/sdk/credentials.ts receive --out /protected/project/github-app.json --github-app owner/repo
```

Replace the example destination and repository with the agreed runtime credential directory and account.
The receiver prints a callback URL and state. Author the manifest from the project branding and GitHub's
[documented manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest):
use that callback as redirect_url, and pass the state on the registration URL.
For this template, request issues/discussions write and metadata, pull_requests, contents, checks,
statuses and actions read; no webhook or subscribed events are needed. Use the project page as the app
homepage. Register a private app under the agreed repository owner, then install it on the agreed repository.
The browser agent handles the form and logo upload; the tool does not generate the manifest or navigate.

The callback exchanges GitHub's temporary code and saves the app credential immediately. After installing,
perform the bounded verification operation (the setup CLI also calls it on reruns):

```sh
bun .open-autonomy/sdk/credentials.ts verify-github --out /protected/project/github-app.json --repository owner/repo
```

It discovers the installation with the saved app key and records its ID for the existing valve. On
interruption, reuse the app ID/slug from the non-secret receipt and complete the existing installation;
do not start another creation flow. A saved credential is not proof of installation. If creation was
interrupted before a receipt arrived, inspect the provider's existing apps before deciding what to retry.
The receiver does not overwrite credentials. The setup agent handles recovery using provider evidence.

For providers that display a token, the general receiver without --github-app gives the owner a protected
password input and saves that text directly. Do not read the provider token into the agent's context.
It does not yet import browser downloads, transfer browser-only secrets, or convert a token into every
runtime's provider configuration. Keep those handoff gaps explicit. If the browser and runtime host differ,
use an authorized SSH tunnel to the receiver's loopback port; never expose it as a public secret endpoint.

## Prepare the host and application's world

Use the kit's container deployment for a real fleet and its existing start script and supervisor;
bare mode is for development/debugging. Verify Bun 1.3.10 or newer in the actual service and native
Hermes terminal. Install the project's locked dependencies and run its own check in its verification
environment. A fresh template includes its compiler; an existing project keeps its own working tooling.

Establish the application's local world using this machine's World instructions. Seed vendor state
through the vendor APIs and script judgments/faults with world handlers. Add twins as product
dependencies emerge. A local folder application can begin with synthetic files and no external
application services. Keep the fleet's real repository/model connections separate from synthetic
customer integrations, even when both happen to use the same vendor.

No production credential is needed to prove application behavior locally. Initial setup does not
recommend production provisioning merely because it finds a deployment manifest. At a later authorized
activation, `--with production` selects the CLI's Cloudflare Worker setup. Package publishing requires
the reviewed procedure in `.open-autonomy/PRODUCTION.md`; `--with release` reports that its automation
is not implemented and refuses before collecting a credential. Other deployment targets use their own
documented setup. Optional sponsorship setup is also separate, explicitly selected with `--with sponsors`.

## Verify, resume and hand off

Record non-secret application IDs, completed steps and remaining gaps in the existing
`.open-autonomy/setup.json` notes. Reuse completed connections and verify their current access on a
rerun; a saved completion marker is not proof that a credential remains valid. Initial reruns do not
repeat production setup just because an earlier run selected it.

The Git helper checks the checkout root and configured origin fetch/push URLs against the project
account, then verifies the current GitHub identity, repository access and Git fetch even on a rerun.
These checks do not establish human authority or prove the fleet's scoped push key works. An unexpected
remote, inaccessible repository or failed command stops setup. The setup agent diagnoses the cause and
reconciles the intended checkout; the helper does not rewrite remotes or infer recovery from a failed
lookup. A missing repository can be created only from a checkout without an origin, after a GitHub 404.

Repository policy preparation must also finish its Git operations. Setup preserves existing rulesets
and staged work, never resets an existing owner-rules branch, and checks that the intended CODEOWNERS
file has landed on origin/main before marking that preparation complete. Resolve an interrupted commit
or an outstanding pull request through the normal Git/browser tools, then rerun setup. A matching file
and a named ruleset do not prove effective authority: the setup agent still verifies the agreed humans,
the actual rules and the resulting review gate. Existing stricter rules are not replaced by kit defaults.

Land the project-owned agreement and configuration before activation. Verify the loaded Hermes home,
native schedules, actual human contact path and host restart supervision. Rehearse ordinary-member
versus owner authority, interruption and recovery in the world. When GitHub is the chosen contact path,
PM must post the human request there and read the reply; a locally saved cron report is insufficient.
Live test messages require owner authorization. Record genuine source-coverage gaps instead of claiming
that a connected bot sees every thread. Consult native cron status, doctor, runs and incidents.

Run the first PM scrum with the brief, research and setup evidence available. PM reconciles the generic
starter intention into a sourced initial roadmap and queues only ready work. The historical kanban seed
does not dispatch work on startup. Observe a bounded task through implementation, verification, review,
landing and subsequent PM reconciliation before claiming the development loop works. The actual first
release still needs candidate-specific human review; later production provisioning is not an initial
development-setup blocker.
