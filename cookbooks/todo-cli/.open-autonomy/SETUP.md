# Agent-led project setup

Read the owner's request and available project context before running setup. The Hermes kit supplies
the development operating defaults. The constitution defines the product; the contributing rules,
agent instructions and runtime describe how it is built. Setup connects its development team to real
services. Application dependencies run against twins during development; their live provisioning
belongs to deployment or customer activation.

Complete setup before starting Hermes. The setup agent establishes the product agreement, verified human
roster, communication policy, operating configuration and required development connections. Resolve missing
setup requirements here; do not start the fleet so PM can finish them. PM begins product planning from the
established project, not from the setup agent's working notes.

The setup agent interprets the brief, recommends defaults, chooses provider-specific steps, and resolves
interruptions with the owner when needed. Keep that judgment in these instructions and the browser
workflow. Deterministic helpers perform bounded operations and check facts: the intended Git target,
command success, credential storage and access. Do not turn this guide into a configuration framework
or treat discovered credentials as decisions.

## Orient before presenting setup

Open Autonomy follows GitHub's organization structure: an OA organization is the GitHub organization,
and each project is a repository in that organization. An organization can contain multiple projects.
Use the existing `account: organization/repository` identity; do not invent a separate OA organization
name or registration flow. New project setup requires an organization-owned repository. For a personal
repository, establish the intended organization and an owner-agreed creation or transfer before
provisioning. Never transfer a repository, remap an existing project's funds or rewrite its credentials
as an automatic migration. Existing runtime accounts are not changed by this setup requirement.

Start with read-only discovery of the supplied conversation and the intended project directory. Determine
whether this is a new project, an adoption or a resumption. If the directory exists, read its applicable
agent instructions, constitution, README, kit identity, operating configuration, team roster,
communication policy, branding and existing setup record. Inspect Git status and the configured target
without exposing credential-bearing URLs. Preserve unrelated work and reuse recorded application IDs.
Inspect credential presence and access through the protected helpers, never by printing secret files.

Verify the GitHub organization's login and numeric ID through its API. Read its public profile and
relevant existing projects' committed setup and communication policies to discover the organization's
established server/workspace, human contacts and operating conventions. Follow the source links and
verify the intended provider space in the signed-in browser before using it. Record the verified
organization ID and source links with connection identifiers in the existing setup record; keep human
authority in the project roster. A matching display name or mere organization membership is not an
authority grant. Missing or contradictory evidence is a specific discovery gap, not a reason to create
a duplicate organization, server or workspace. Reconcile repository renames or transfers against GitHub
identity and the existing account before making dependent changes.

Separate what the owner already agreed, what is independently verified, what is merely recorded and
what remains missing. Check current provider access before marking a connection complete; a saved step,
local login or existing container is only a clue. If evidence conflicts, identify the specific mismatch
and reconcile it before dependent changes. If the intended directory or account is unknown, ask for that
target instead of assuming the current repository is the new project. Do not provision anything during
orientation or restart an existing fleet merely to discover its state.

Use this inventory to tailor the opening below: show existing work, the unresolved items and the next
action. Reuse earlier answers instead of presenting every default again. Initial orientation need not
wait for every remote check to finish: label those checks pending and update them as evidence arrives.
Keep the inventory in the conversation; durable decisions and connection progress belong in the existing
project documents and setup record, not a new orientation report.

## Present a guided setup

Make the conversation feel like a guided setup. Use the compact ASCII cards below in fenced `text`
blocks, with ordinary prose for explanations and one focused question outside the card when an answer
is needed. Keep cards roughly 60 columns wide, wrapping long values. Put clickable links outside the
block. Use a card at a stage change, a meaningful result or a human handoff; routine tool activity needs
only a short update. Do not repeat the whole checklist with every message.

Use these six stages as navigation: Brief, Identity, Models, Connections, Verify, Activate. They describe
the conversation, not a rigid execution order: connections may be needed to discover models. Show the
current stage and actual next action, without invented percentages, timers or checks. `[x]` means verified
complete, `[>]` means in progress, `[ ]` means pending, and `[!]` means blocked. Label a declined optional
connection `Off` instead of leaving it looking unfinished. Proposed values stay visibly proposed until
agreed; a discovered login is not a selected model arrangement.

These examples illustrate the format, not decisions for the current project. Replace their names,
values and outcomes with the owner's context and observed facts. The agent renders the conversation;
the CLI remains the bounded helper. Do not add a wizard engine, presentation configuration, transcript
file or extra approval gates. Reuse prior answers, accept free-text corrections, and continue authorized
work without asking the owner to press Next. If the chat supplies a question UI, put the focused question
there once, keeping enough context in it to answer without rereading the card.

**Opening: lead with the Open Autonomy logo, then reflect the brief.** Use the ASCII open-loop mark
below, with its gap at the upper right, once at the start of setup. Its depth and shading were rendered
from the Open Autonomy SVG using [Three.js AsciiEffect](https://threejs.org/docs/pages/AsciiEffect.html).
Reuse this literal text; setup does not install a renderer or generate the logo on each run. This is the
setup's Open Autonomy identity; the new project's own branding is prepared separately. Follow it with the proposed starter
and a short route through setup. For this example, the owner has already established the product constraints:

```text
             #@%%%%%%=
         @@@%+=========*#
       @@%================ #
     @@#=========::===== :@==+
    %%======            @+=====
   %%=====.              =======
  +%=====.                ======     OPEN AUTONOMY
  ##=====                 #=====:
  ##=====                 #=====.    Project setup
  **=====                %======
   *======              @======-
    +=======          @+=======
     ===========+#*+=========
       ====================:
         ================
              .-==-

+----------------------------------------------------------+
| OPEN AUTONOMY / PROJECT SETUP                             |
| Brief                                                    |
+----------------------------------------------------------+
  Product   Local SOC2 readiness for firms and clients
  Data      An owned folder: JSON, CSV, Markdown, evidence
  AI        Customers can use their own local coding agents
  Starter   Hermes (recommended; the available kit)

  [>] Brief       [ ] Identity     [ ] Models
  [ ] Connections [ ] Verify       [ ] Activate

  Next: settle the working name and repository owner.
```

When resuming, keep the opening logo and replace the fresh-start card with the discovered state. For
example, where the product agreement is sourced and the repository read has succeeded, but the app
registration is only recorded and the model arrangement is undecided:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Resuming / Connections                    |
+----------------------------------------------------------+
  [x] Existing product agreement and repository verified
  [>] Rechecking the recorded project GitHub App
  [ ] Model arrangement still needs a choice
  [ ] Activation remains pending

  Keeping the agreed name, owner and contact destination.
  Next: verify app access, then present the model options.
```

**Choices: separate recommendations, established answers and missing facts.** Ask only for what is still
needed, with recommended defaults together. For example, after public development is already agreed:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Identity                                 |
+----------------------------------------------------------+
  Working name  Evidence Desk              Proposed
  Organization  <github-organization>      Needed
  Repository    evidence-desk              Proposed
  Visibility    Public source + dev logs   Agreed
  Fleet host    Not selected               Needed
  Contact       Existing org space         Discover first
  Reviewer      You                        Agreed

  Next: choose the GitHub organization and fleet host.
```

For the Models stage, use the same format to show the verified subscription option and suitable live
catalog models, their exact IDs and relevant limits. State which uses subscription allowance and which
uses metered project funds. If only a login file is found, display `Login found; access unverified`.
If catalog access is unavailable, display that gap and the action to resolve it. Show budget proposals
separately from the verified balance; follow the model-choice and funding procedure below.

**Working: report an observed result and the action underway.** For example, after the agreed repository
and branding exist, while the browser agent is registering the project application:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Connections                              |
+----------------------------------------------------------+
  [x] GitHub repository and owner access verified
  [x] Provisional project name, blurb and icon prepared
  [>] Registering Evidence Desk's GitHub App
  [ ] Install on the project repository and verify access
  Off Discord (GitHub selected for coordination)

  Working in your signed-in browser. No action needed yet.
```

**Human handoff: name the precise action and where to take it.** Give the short advance notice described
under [expected human checkpoints](#expected-human-checkpoints) before a likely challenge. Use the
waiting-for-you card only when the browser reaches an actual human-only step. For a passkey challenge
observed during registration:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Connections / Your action                |
+----------------------------------------------------------+
  [!] GitHub is waiting for your passkey confirmation

  Where   The GitHub verification dialog in Chrome
  Action  Complete the passkey prompt there
  Next    I will resume registration after it clears
```

For a secret-entry handoff, identify the protected credential receiver's input instead. Never ask for
credentials in chat or include them in a card, screenshot or link. Display only safe provider names and
public identifiers; callback codes, state values and credential-bearing URLs do not belong in the card.
Verify completion in the provider before advancing, rather than treating a reply of "done" as proof.

**Interruption: show what survived and what is required to resume.** For example, when the saved app
registration exists but the selected host has no corresponding credential file:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Connections / Paused                     |
+----------------------------------------------------------+
  [x] Existing project app registration verified
  [!] Its credential is missing from the selected host
  [ ] Fleet activation

  Next: reconcile the credential location or recover access.
  Setup is incomplete. Hermes has not started.
```

Explain the concrete recovery action in prose; continue independent work where possible. On resumption,
recheck the relevant connection and update this card instead of restarting the questionnaire.

**Completion: distinguish prepared setup from proven operation.** Before startup, show `Ready to activate`
only when the checks below are complete. Continue with already authorized activation. Show the following
outcome only after observing every listed result; otherwise keep the outstanding item visible:

```text
+----------------------------------------------------------+
| PROJECT SETUP / Autonomous development running            |
+----------------------------------------------------------+
  [x] Project agreement and configuration landed
  [x] Connections, model access and required funding verified
  [x] Hermes, schedules and host supervision verified
  [x] PM contacted you and read your reply on GitHub
  [x] First bounded task landed and PM reconciled it

  Planning       PM maintains ROADMAP.md and CHANGELOG.md
  Human contact  GitHub issues
  Releases       Candidate-specific human review required
```

Follow the completion card with links to the real repository, development stream and agreed contact
destination. A helper exit, saved setup marker or successful startup alone never warrants this card.

## Establish the brief and the few choices

For a new project, write its purpose, users, enduring constraints and exclusions into the constitution
from owner direction. Keep accessible source references beside those decisions in the existing project
documents; do not create a separate brief, research dump, rehearsal log or handoff document. When a supplied
conversation has no accessible reference, identify the setup summary and establish the owner's agreement
before activation, reusing direction already given. An agent-written summary alone is not evidence of owner
approval. For an existing project,
read and preserve its established constitution and working conventions before proposing changes.
PM owns the sourced roadmap and changelog after handoff. Do not invent a backlog during setup.

Reuse answers already given and present the recommended operating defaults together. Settle only what
is missing and materially affects setup: working name/repository owner, the development host, the model
arrangement and budget, human coordination destination, and owner/release reviewer. Keep the template's
development conventions and native schedules unless the project requires a change. Architecture and
feature questions can remain for PM; credentials or directories found on the machine are availability
evidence, not permission to use them for this project.

Use a lowercase runtime slug such as `audit-desk` for `--project`: letters and digits separated by
hyphens, at most 64 characters. It names Docker images, the Compose project and default credential
storage. The display name in `branding/brand.json` can be `AuditDesk` or another human-facing name.
For an older install with an incompatible slug, reconcile its kit identity and existing host resources
before rerunning setup; do not silently rename its containers, volumes or credential directory.

Fill the project-owned README, constitution, contributing instructions and verification instructions.
Complete the provisional branding pass in `branding/README.md` before creating integrations. Use the
project name, blurb and icon on its applications; reuse existing project application IDs on a rerun.
Maintain durable documentation in place. The helper's setup record holds connection IDs and progress for
resuming setup; it is not a product brief, research store or planning surface for PM.

The setup CLI creates a missing GitHub repository as public. Establish that this is the agreed target
before running it. A private existing repository does not make published development sessions private.
Keep confidential customer workspaces, human channels and credentials outside the development fleet.
The current Hermes kit requires `main` as the default branch for its runtime, maintenance and landing.
For an existing repository using another default, agree and complete a migration before setup or select
a compatible starter; setup refuses that target before changing Git, policy or credentials.

## Select development connections

Before registering an App or collecting credentials, trace the chosen runtime's Git, model,
communication and reporting paths. Establish where authentication lives and the permissions each
path needs. In particular, choose Git authentication from the agreed runtime:

| Runtime | Fleet Git authentication | Project App Contents permission |
| --- | --- | --- |
| Local Codex with a host sidecar | Project App through the host valve | Write |
| Managed container | Repository-scoped SSH deploy key | Read |

Request those permissions during the initial App registration. Local setup does not create an
additional SSH deploy key. Reuse existing project integrations; if the runtime changes, reverify the
affected paths and installed grants before activation. A completed registration is not proof that the
selected runtime can use it. This is setup-agent judgment using the existing configuration, not another
configuration file or user questionnaire.

Recommend reuse of the organization's established communication space when available: for example,
one Discord server or Slack workspace can serve several projects. Show the discovered space and its
source, then propose the new project's own branded application/bot and a project channel or category.
Reuse any existing project bot and channels on resumption. Choose the number of channels from the
project's needs and the organization's existing conventions; do not clone every sibling's channels or
rename the organization's shared spaces after the new project. An agreed shared server is not a shared
project credential: each project's bot, permissions, funds, planning and release authority remain scoped
to that project. Use provider-native installation and permission rules; Slack and other platforms are
not provisioned by the Discord helper.

The setup agent records the agreed server/workspace, project channels, source coverage and human contact
practice in the existing project communication skill, with public provider IDs and discovery sources in
the existing setup record. Keep the organization-level directory in its existing public profile or
established documentation when it has one; do not introduce another registry or copy sibling project
policies wholesale. Reuse organization defaults as recommendations, not silent authority grants. The
project owner selects its enabled connections and reviewer. Shared space does not authorize access to
another project's private channels or to confidential human spaces.

Run `create-open-autonomy setup . --plan` and reconcile its output with the agreed choices before
running the mutating command. The CLI prepares GitHub repository access, the selected Git authentication, the platform
connection and owner rules. Its selectable development connections are the project's GitHub App, Discord,
and an existing model subscription. The project App is required for local Codex Git. Apply the decisions using the existing `--with` and `--without`
options; `--yes` accepts the displayed defaults and is not a substitute for establishing owner authority.

If no shared organization space is established, GitHub issues/discussions are a sufficient recommended
human coordination channel. Discord is optional, selected only
when agreed, even when a token exists. Do not assume a particular server, channel or application from
the available credential. Follow `hermes/skills/project-communications/SKILL.md` to record the actual
contact agreement, establish the shared team roster and configure native permissions. If the owner
chooses another supported native Hermes channel, the setup agent follows that integration's own setup
instructions and verifies it; this CLI does not provision it. Report unsupported choices explicitly.

The setup AI actively offers the development model choice. Run the installed `codex login status`
as the intended operator; verify ChatGPT sign-in and model access through Codex itself without reading
its auth files. File presence alone is not proof, and an API-key login is a different funding choice. Alongside that option, present suitable models from the configured Open Autonomy platform's live
catalog, explaining subscription allowance versus metered project funds and the limits of each. Ask the
owner which arrangement and model to use, or honor an already explicit choice. Do not silently pick
platform funding because the helper defaults subscription enrollment to `no`; that default only prevents
unattended enrollment. Apply the agreement with `--with subscription` (local Codex) or
`--without subscription` (Open Autonomy models).

Present model funding and fleet location together, using the guided setup format:

```text
  MODELS + FLEET
  ────────────────────────────────────────────────────────
  Local Codex     Uses your installed Codex and ChatGPT allowance
                  Runs here; this computer must stay awake
                  Activation pending the isolated runtime
  Open Autonomy   Uses the project's funded model allowance
                  Runs here or on an agreed, verified host

  Readiness: distinguish an available login from a working fleet
  Next: confirm the arrangement and available model
```

Adapt that recommendation to actual discovery. Never recommend a server the user has not got, assume
Docker is running because its CLI exists, or offer remote hosting under the local Codex choice.
Open Autonomy funding for a host is a separate metered spend requiring an available provider and agreed
budget; the platform is not itself a hosting service. Product hosting is a later, separate decision.
Verify a nonempty server version from the selected local Docker context before attempting a container
build. Reuse an existing working local context; CLI availability alone does not verify the connection.

Local Codex uses the host/container arrangement below. It keeps Hermes, its workspace
and every agent tool inside the container. A host sidecar connects the installed Codex, external
services and reporting, with model, GitHub App and platform authentication retained by the host.
Native messaging uses the same explicit `channels.env` settings as the managed runtime; its
project bot credential is available to Hermes for delivery, as described in the container guide. A successful isolated executor test
does not complete this integration. The vendored
`.open-autonomy/sdk/codex-bridge.ts` provides a restricted native stdio bridge with pinned model
and environment checks. The vendored `.open-autonomy/sdk/codex-host.ts` starts one installed Codex process per
Hermes session, with native container MCP configuration and separate worker context.
`.open-autonomy/local-runtime.ts` supervises the host bridge, loopback valves and reporter alongside
a prepared container gateway. Before starting Hermes, it checks the container's resolved origin fetch
and push URLs against the project valve and requires authenticated Git read and write advertisements.
This check changes no refs and rejects a missing mapping or read-only installation. It then fetches
`main`, preserves a dirty checkout and native runtime state, and loads Hermes configuration and the
reporter policy from the fetched commit. A clean checkout advances to that commit. The host reads only
the explicitly prepared `channels.env` for messaging settings and writes those settings and current host
routes into the native home environment so cron workers see them too. It waits for
the reader, forwards native restart
requests and stops the gateway when its host connection ends. The container image has an explicit
`local` target with the native executor and Hermes stdio adapter; the default remains the managed stack.
Before installing the persistent service, verify the project App Git connection below and the selected
communication connection. Then verify the complete fleet loop. Use ordinary Docker networking as described in
[the container guide](../container/README.md#local-host-connection): the container reaches the existing
authenticated host bridge, and the native executor is published only on host loopback. Setup verifies
that path in the selected Docker context before Hermes starts.
Run the existing reporter on the host with `--container <id> --project <container checkout>
--state-file <host cursor file>` and `HERMES_HOME=<container home>`. Its Supercode reader executes inside
the container over Docker stdio; filtering, publishing and the cursor stay on the host. Verify public
transcripts, privacy exclusions and restart continuity against the platform before activation.
Do not run the fleet as the operator,
offer bare execution as a substitute, or silently switch an agreed local choice to project-funded models.

An agreed local choice can be prepared using Hermes's existing `codex_app_server` transport. The setup
agent edits both `hermes/config.yaml` and `hermes/profiles/treasurer/config.yaml` before applying the helper;
these settings record the choice and do not authorize activation:

```yaml
model:
  default: <exact model verified in local Codex>
  provider: local-codex
custom_providers:
  - name: local-codex
    base_url: http://127.0.0.1:1/v1
    api_key: local-codex
    api_mode: codex_app_server
```

This selects Hermes’s existing [Codex app-server](https://learn.chatgpt.com/docs/app-server) transport, not a new server. The non-secret key and unused loopback
address satisfy Hermes's provider resolver without invoking its OAuth importer; the transport launches
`codex app-server` over stdio. A mistaken HTTP path fails locally instead of spending through another
provider. Preserve unrelated config and use `terminal.backend: local` with `home_mode: auto` or `real`.
The pinned Hermes app-server runtime inherits Codex's model and permissions; it does not pass the Hermes
model field to `thread/start`. Configure and verify the agreed model in Codex's project configuration,
and keep both Hermes model labels consistent with it. Do not change the operator's global model default.

The runtime integration must establish the native Hermes MCP callback inside the container and verify
skills, Kanban access and project communication tools there. Configure Codex's native stdio MCP server
with `environment_id = "remote"` and `required = true`, invoking the container's Hermes Python with
`-m agent.transports.hermes_tools_mcp_server` from its installation directory. A remote shell environment
does not relocate an MCP server whose environment is still the default `local`; `required` prevents
a turn from proceeding when the server cannot initialize.

Give that MCP process the session's explicit container `HERMES_HOME`. PM profiles need `kanban` in
their top-level `toolsets`; a Discord platform toolset alone does not enable the MCP kanban tools.
For workers, preserve the dispatcher's task, run, board/database, workspace and claim context in the
container callback. Verify a completion changes the assigned task and run, and refuses a foreign task;
an empty board or a successful protocol handshake alone is insufficient.

Set `security.allow_lazy_installs: false` in the container profiles and install agreed optional
dependencies when building the image. The pinned Hermes MCP server discovers optional tools during
startup, which can otherwise trigger package installation and exceed its native 15-second thread-start
wait. Increasing Codex's MCP startup timeout alone does not extend that Hermes wait. Check a missing
required server produces no model turn. A YAML field or a remote shell endpoint alone does not establish
the boundary: inspect all tool paths, including plugins, hooks and MCP tools.
Once the container supplies that boundary, the host runner can set the bridge's `externalSandbox: true`
to use Codex's native `externalSandbox` policy with restricted network access. Keep the container's
restrictions in place; an additional nested Linux namespace sandbox may be unavailable inside it.
The container client cannot choose or override this host policy.
Do not migrate agent tools onto the host, import credentials, mount/copy `~/.codex` into a container, or
add an OAuth proxy. Codex itself retains responsibility for login and refresh. Auxiliary model tools
need an explicitly agreed connection or must be disabled; do not infer permission to use another
discovered key.

Setup's `--with subscription` validates this configuration and local ChatGPT login before provisioning,
then checks `initialize`, `account/read` and `model/list` through the installed CLI. It uses project-scoped
SQLite state under the operator's Open Autonomy state directory.

> **Codex startup warning:** the installed Codex CLI can pause while preparing or indexing its local
> database, especially with an existing session history. This work happens inside Codex, before its
> app-server handshake completes. Setup waits up to three minutes; this is a wait limit, not a guarantee
> that indexing will finish within it. A timeout alone does not mean the login is broken. Inspect
> Codex startup/database progress before restarting it or requesting another sign-in.

The probe sends no model
turn or tool request, returns only the account type and agreed model, and never rewrites global choices
or exports authentication. An explicit Codex environments.toml configuration must be reconciled before this probe;
setup does not replace it. The ordinary start script rejects `--local-codex` or a local Codex profile;
that entrypoint is not the isolated host service. Before activating the host service, prove container execution, denial of host files and credentials, and failure
without host fallback when the executor disconnects. Then prove `initialize`, `account/read` and one
bounded turn through native Hermes with the operator's actual Codex, followed by PM and worker tools
and host-side reporting. A successful CLI login status or a synthetic-provider test with a clean Codex
home is not that proof; a timeout leaves activation incomplete and needs local diagnosis.
Existing `codex-valve` fleets are legacy installations, not evidence of local Codex readiness: migrate
only after the isolated runtime is verified for the project. Old secret files are never imported or
deleted by this selection.

Read `GET /v1/catalog` through an authorized standalone platform valve as described below; `GET /v1/models`
lists only the current key's bounds, not the platform's available choices. If no authorized platform
connection exists yet, establish that connection with the existing key tool and standalone valve before
finalizing the model choice. Initial key bounds are provisional, not proof of availability or permission to
spend. If catalog access fails, report the unavailable lookup and resolve it rather than presenting the
template's default as a verified catalog. This discovery does not require starting Hermes or funding a
model call. A missing or unusable subscription should be stated plainly when offering the platform options.

After applying the helper, reconcile `hermes/config.yaml` with the agreed provider and exact model;
the helper's seeded provider defaults are not the owner's model selection. For platform-funded profiles,
set the project policy and mint credentials with the agreed model bounds before the bounded connection check.
The key tool reads the project's nonempty `models` list unless `--models` supplies an explicit key bound.
If the project permits any model with an empty list, choose the key's allowed models explicitly before
minting. Keep those key bounds and the native Hermes model configuration consistent with the agreement.
The platform-funded defaults and optional subscription path
are different arrangements; record the one actually used. Application AI features, if any, are separate
from the model used by Hermes to develop the product.

Spending limits and minted credentials do not supply money. For platform-funded development, inspect
the project's usable balance on the configured platform before activation. If it is insufficient, complete
the owner's agreed funding through the existing project funding page, coupon redemption or `/give` flow;
`/give` transfers credits already held by an authorized funder. Do not promise or assume a grant, transfer
someone else's funds, or treat a proposed budget as payment authorization. Verify the credit reached this
project and covers the chosen model before the bounded connection check. A declined funding step leaves
platform-funded activation incomplete. An agreed subscription uses its operator's allowance instead;
any remaining platform-funded profiles or product calls still require their own usable project balance.

## Expected human checkpoints

Prepare the owner immediately before a provider action that may require their attention. These are
anticipated interruption points, not guaranteed prompts on every setup or proof that a connection works.
Reuse the signed-in browser; a previous successful challenge does not guarantee the next action is clear.

| Before this action | What may interrupt it | Prepare and resume |
|---|---|---|
| Submit a GitHub App manifest or change protected app settings | GitHub account re-authentication, such as a passkey or two-factor prompt | Start the credential receiver before manifest submission. After authentication, inspect the returned page: GitHub may have lost the manifest and returned to a blank personal-app form. Restore the agreed organization and manifest only after checking that the app was not already created. |
| Click **Create** for a new Discord application | A CAPTCHA before the application is created | Tell the owner to keep Chrome visible. After completion, verify the application name and ID; a click or a dismissed dialog is not proof of creation. |
| Click **Authorise** to add the Discord bot to the server | A separate CAPTCHA, even if application creation just passed one | Confirm the agreed server and permissions first. After the challenge, verify Discord's installation success and target server before advancing. |
| Generate or reset a Discord bot token | Account verification and a one-time secret display | Prepare protected page capture before generating the token; after human verification, transfer the displayed field directly into storage. Use the protected input only when capture is unavailable or unauthorized. Never return the token through ordinary agent tools or screenshots. Reuse a saved credential; resetting an existing token is rotation, not a routine retry. |

For example, immediately before the Discord server authorization click:

```text
  NEXT / Discord server installation
  The next click may open another CAPTCHA, separate from app creation.
  Keep the Discord tab in Chrome visible; I will pause if it appears.
```

This heads-up is information, not another approval gate for an already authorized setup action. If the
owner says they are away, defer that browser step and continue independent work. When a challenge
appears, identify the exact tab and action promptly, leave it visible, and pause automation on that
provider. Never solve or bypass a CAPTCHA or human authentication step. Do not navigate away while
waiting or announce success from an owner's "done" alone: inspect the provider result first.

If the prompt was missed or expired, check for a completed application or installation before retrying.
Reuse its identifiers and saved credentials. Reopen only the unfinished step, give the heads-up again,
and show the owner the fresh prompt. If a credential receiver expired, restart it before resubmitting
the manifest with its current callback and state; never repeat app creation blindly. Keep non-secret
progress in the existing setup record, not a separate rehearsal document.

## Complete credentials with the owner

Use the setup agent's browser skill and the owner's existing signed-in browser sessions for provider
administration and authorization. Complete authorized actions yourself; involve the owner at an actual
human-only step such as a passkey, CAPTCHA, new account or unavailable secret. Do not hand over a list
of portals and stop. Do not extract browser cookies or session tokens. Provider credentials belong in
the setup helper's protected destination or secure prompt, never chat, screenshots or committed files.
The setup CLI checks its credential directory before writing setup state, including on reruns. It must
be outside every Git repository and outside the new project's directory even before Git initialization;
symlink aliases do not bypass this boundary. An ignored directory inside the project is not suitable.
The platform key tool also checks --out before minting or rotation and creates that file's parent
directory with owner-only permissions. Existing credential files must be regular files, not symbolic or hard links.

| Connection | Setup and credential handoff | Proof before completion |
|---|---|---|
| GitHub repository | Verify the owner and repository; the helper generates and registers a repository-scoped SSH push key | The agent's key can push its branch; main and workflow ownership follow the agreed policy |
| Project GitHub App | The browser agent handles registration and installation; the standalone credential receiver only saves the key; verify access through the running valve | Through the app/valve, read this repository's issues, PR reviews/checks, workflows and release records |
| Open Autonomy platform | The key tool prepares a repository-control claim; the setup agent lands it through normal Git/PR tools, then reruns setup to provision developer/treasurer credentials into protected host storage | The project account is correct and the actual reporting/model arrangement works |
| Optional communication provider | Guide the chosen provider's application setup, scopes and installation; use protected page capture for displayed credentials, or secure entry when capture is unavailable | Read the agreed history, deliver to the agreed destination, and recognize the owner's reply |
| Development model | Reuse the agreed authorized connection or complete the required provider authorization | A call through the installed runtime succeeds under the intended account and bounds |

Verify these connections before starting Hermes. Use the existing vendored SDK valve CLI directly in the
prepared runtime, supplying the selected `--key`, `--github-app` credential-file
arguments; this starts only the valve. In a container, use a one-off command with the entrypoint overridden,
keeping its ports inside the runtime network with no published ports. The valve listens on all interfaces;
its placeholder bearer is not an access boundary. Make the checks from inside that protected environment.
Use actual repository reads and a bounded model request under the agreed funding arrangement; a health
response alone is insufficient. Stop the temporary valve before the normal stack takes its ports.
The setup agent verifies the scoped push key and selected communication provider through their native
tools as well. Reporter delivery and the loaded Hermes configuration are checked on the final startup;
those checks do not require PM to finish credentials or policy.

When key minting reports a pending claim, land the prepared `.open-autonomy-claim` on the repository's
default branch through its existing contribution and review process, then rerun the same command or setup.
Reuse an existing claim branch/PR and preserve unrelated work. The key tool neither commits nor pushes;
a claim on a feature branch alone cannot authorize minting. A still-valid landed claim is reused even from
a stale checkout. If review outlasts the claim's validity, reconcile the refreshed claim in the same PR.

For Discord specifically, use its developer portal to create/reuse the project application, configure
the needed intents and bot identity, and authorize the agreed server. Arrange the agreed public channels
with the browser/native tools, reusing their existing structure. Receive the token with the standalone
credential tool into discord.token in the runtime credential directory, then set the existing native
DISCORD_HOME_CHANNEL variable to the agreed destination when running setup. An established destination
in channels.env is reused on reruns. The helper verifies that exact channel; it never chooses the first
server, creates channels, changes application branding, or grants participation permissions.

Finish the channel policy and remove any temporary setup permissions. The helper preserves existing
native allowlists in channels.env and never rewrites cron delivery. Use the communication skill and
native Hermes tools to configure access, history tools and each job's delivery according to the owner
agreement. A delivered message alone does not prove discovery works. Declining a setup step does not
disconnect an established provider; an agreed removal uses native configuration and lifecycle tools.

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
For this template, request issues/discussions write and metadata, pull_requests, checks, statuses and
actions read. Contents is read for a managed deployment using its SSH deploy key, or write for the
local host runtime using the project App for HTTPS Git. Existing App installations need the owner to
accept that permission change; setup must not assume a read-only installation can push. No webhook or
subscribed events are needed. Use the project page as the app
homepage. Register a private app under the agreed repository owner, then install it on the agreed repository.
The browser agent handles the form and logo upload; the tool does not generate the manifest or navigate.

For the local host runtime, keep the canonical GitHub origin and configure Git's native URL rewriting
inside the container, as `hermes` with `HOME` set to its runtime home. Substitute the actual account and
GitHub valve port (the base valve port plus three):

```sh
git config --global --add url.http://host.docker.internal:8790/OWNER/REPO.insteadOf https://github.com/OWNER/REPO
git config --global --add url.http://host.docker.internal:8790/OWNER/REPO.insteadOf git@github.com:OWNER/REPO
git config --global --add url.http://host.docker.internal:8790/OWNER/REPO.insteadOf ssh://git@github.com/OWNER/REPO
```

Inspect existing mappings first; reuse matching entries and reconcile an old port instead of accumulating
settings. These mappings contain no credential and apply to Git in normal and worker checkouts. The host
valve injects the repository-scoped App installation token. Do not forward the owner's general SSH agent
or copy a token into a Git URL. Verify clone/fetch and a bounded branch push through this route in the
World, then verify the agreed live connection before activation. A twin Git push proves transport and
repository state; production permission approval is a separate setup check. After the first authenticated request,
the valve’s `/healthz` reports the token’s Contents permission without revealing the token. Restart
the valve after an approved permission change so the next request mints a token with that grant.

The callback exchanges GitHub's temporary code and saves the app credential immediately. That is the
end of the credential helper's responsibility. The browser agent installs the existing app, then verifies
an actual repository read through the standalone valve before starting Hermes. The valve discovers a missing
installation ID when it uses the app key; credentials that already include the ID remain supported.
A health endpoint or a saved credential alone does not prove repository access.

On interruption, reuse the app ID/slug from the non-secret receipt and complete the existing installation;
do not start another creation flow. If creation was interrupted before a receipt arrived, inspect the
provider's existing apps before deciding what to retry. The receiver does not overwrite credentials.
The setup agent handles recovery using provider evidence. No manifest generation, browser navigation,
installation, Git operation, policy decision or runtime configuration belongs in the credential saver.

### Displayed credentials

When the agreed integration displays its new credential on a page, use the standalone helper's capture
command to transfer that one field directly into protected storage. The SDK README documents the command
and supported browser-controller interface. Reuse the browser skill's existing normal-Chrome connection
and bound task tab; do not launch a second browser or scrape the token with ordinary eval/snapshot tools.
Confirm the project app and exact page first, then identify the single field within its credential-labeled
section from safe DOM structure, without reading its value or snapshotting its container. A unique Copy
button is not enough: provider pages also have copyable app IDs and permission calculators. Capture accepts an input value or a leaf text
element; it returns only a saved-path receipt and keeps the credential outside agent context and logs.
The helper does not navigate, click Reveal/Reset, solve challenges, or choose which integration to trust.
Immediately verify the saved credential through the provider’s native connection check, including the
expected app identity and agreed resource access. A saved-path receipt proves only that a field was
stored. Keep the provider page open until this check succeeds; do not reload, navigate away or record
credential success first. On rejection, reconcile the chosen field while the actual credential may still
be displayed. Preserve the rejected capture in protected storage; never overwrite it silently or start
with another token reset. Regeneration is recovery only after the original credential is unavailable.

Honor the active browser policy. Authorization to capture the agreed app's displayed credential is
limited to that protected transfer, never browser session tokens or cookies. If an active policy forbids
even protected transfer and existing owner authorization does not cover it, explain the exact restriction;
do not silently route around it. Where supported and authorized, displayed credentials are an automated
handoff, not another manual setup checkpoint.

If capture fails, inspect safe page metadata and credential presence before retrying. Do not regenerate
a token or repeat app creation. The general receiver without --github-app remains the fallback: it gives
the owner a protected password input and saves that text directly. Browser downloads are not imported,
and the helper does not configure the runtime. Page capture currently requires the browser controller
and credential receiver on the same host. For a remote runtime, use the manual receiver through an
authorized SSH tunnel; never expose it as a public secret endpoint.

## Prepare the host and application's world

For Open Autonomy models, use the kit's container deployment and its existing start script and
supervisor. For local Codex, the setup agent prepares the host service using the existing runtime:

1. Build the Dockerfile's `local` target. Prepare a project-specific container, Docker volumes for
   `/work/project` and `/opt/data`, and the verified loopback-only executor connection. Keep host
   credentials and host filesystem mounts out of the container.
2. Initialize the checkout's canonical Git origin and the native project valve mappings above, as
   `hermes`. The runtime authenticates the fetch and loads committed configuration on its first start.
3. Install the committed `.open-autonomy/` code and its dependencies in operator-owned host storage,
   outside the agent-writable checkout. Keep the installed revision identifiable. Use the existing
   protected project credential directory; do not recreate connections.
4. The host service imports `startLocalRuntime` from that installed `local-runtime.ts`, supplying the
   container ID, loopback executor URL, host state directory, credential directory, project config path,
   and chosen valve port. Await its `exited` promise. Exit 75 requests a whole-stack restart; SIGTERM
   and SIGINT close the stack. Supervise this using the machine's existing World/service conventions.
   A printed command or a healthy executor alone does not establish a working service.
5. Verify the native gateway, scoped Git, selected messaging connection, one bounded subscription turn,
   PM/worker tools and reporting. Record the service location and verified results in the existing setup
   record; preserve any remaining gaps. Keep human release review in place.

This is agent-led host preparation, not another provisioner or configuration schema. The ordinary
managed entrypoint and bare execution cannot substitute for this service. Verify Bun 1.3.10 or newer in the actual service and native
Hermes terminal. Install the project's locked dependencies and run its own check in its verification
environment. A fresh template includes its compiler; an existing project keeps its own working tooling.

Establish the application's local world using this machine's World instructions. Seed vendor state
through the vendor APIs and script judgments/faults with world handlers. Add twins as product
dependencies emerge. A local folder application can begin with synthetic files and no external
application services. Keep the fleet's real repository/model connections separate from synthetic
customer integrations, even when both happen to use the same vendor.
For a product that operates on user-owned folders, the development checkout and the customer's data
folder are different boundaries. Verify with synthetic workspaces; optional customer Git or storage sync
does not authorize the fleet to read those accounts or require their credentials during development setup.

No production credential is needed to prove application behavior locally. Initial setup does not
recommend production provisioning merely because it finds a deployment manifest. At a later authorized
activation, `--with production` selects the CLI's Cloudflare Worker setup. Package publishing requires
the reviewed procedure in `.open-autonomy/PRODUCTION.md`; `--with release` reports that its automation
is not implemented and refuses before collecting a credential. Other deployment targets use their own
documented setup. Optional sponsorship setup is also separate, explicitly selected with `--with sponsors`.

## Verify, resume and hand off

Record non-secret application IDs, completed setup steps and remaining setup gaps in the existing
`.open-autonomy/setup.json` notes. Reuse completed connections and verify their current access on a
rerun; a saved completion marker is not proof that a credential remains valid. Initial reruns do not
repeat production setup just because an earlier run selected it.
If a completed credential step has missing files in the selected directory, setup stops before changing
its record or issuing replacements. Reconcile the intended host/directory and restore credentials or
prepare an explicit recovery using the provider's evidence. File presence still does not prove access.
Startup requires the developer's agent.env before it starts services or writes the runtime home;
a treasurer credential alone cannot activate the fleet.

The Git helper checks the checkout root and configured origin fetch/push URLs against the project
account, then verifies the current GitHub identity, repository access and Git fetch even on a rerun.
These checks do not establish human authority or prove the fleet's selected Git credential works. An unexpected
remote, inaccessible repository or failed command stops setup. The setup agent diagnoses the cause and
reconciles the intended checkout; the helper does not rewrite remotes or infer recovery from a failed
lookup. A missing repository can be created only from a checkout without an origin, after a GitHub 404.
For managed deployments, setup also checks on reruns that the deploy key remains registered with write access. A revoked,
disabled or read-only key requires the setup agent to reconcile the intended access; setup does not
restore a revoked registration or expand existing permissions automatically.

Repository policy preparation must also finish its Git operations. Setup preserves existing rulesets
and staged work, prepares a missing CODEOWNERS without committing or pushing, and checks that the intended
file has landed on origin/main before marking that preparation complete. Resolve an interrupted commit
or an outstanding pull request through the normal Git/browser tools, then rerun setup. Reuse an existing
owner-rules branch/PR, based on the fetched default branch; do not include unrelated feature commits.
The helper recognizes a landed owner-rules branch even if local main has not caught up; it does not create,
reset or push a branch. Reconcile local main through normal Git tools before activation. A matching file
and a named ruleset do not prove effective authority: the setup agent still verifies the agreed humans,
the actual rules and the resulting review gate. Existing stricter rules are not replaced by kit defaults.

Before exercising landing, enable the repository's native auto-merge setting (`gh repo edit --enable-auto-merge`)
and verify that its Actions settings permit the landing workflow to create pull requests. Inspect
`repos/<owner>/<repo>/actions/permissions/workflow` through `gh api`; the GitHub setting named
`can_approve_pull_request_reviews` governs Actions creating and approving PRs. Configure the agreed setting
through the owner's repository administration, preserving other workflow permissions and organization policy.
The landing workflow never submits approvals: required human reviews and existing protection still apply.
If organization policy prevents these settings, resolve that with the owner before claiming landing works.
The workflow arms native auto-merge so a required review can arrive after its run has finished.

Land the completed project-owned agreement and configuration before starting Hermes. Start it as the final
setup action, then verify the loaded home, native schedules, actual human contact path and host restart
supervision. A failed startup check remains the setup agent's responsibility; repair it before handing
over autonomous operation. Rehearse ordinary-member
versus owner authority, interruption and recovery in the world. When GitHub is the chosen contact path,
PM must post the human request there and read the reply; a locally saved cron report is insufficient.
Live test messages require owner authorization. Record genuine source-coverage gaps instead of claiming
that a connected bot sees every thread. Consult native cron status, doctor, runs and incidents.

PM starts with the established constitution, roster, communication policy and operating configuration,
plus the project's ordinary source history. It does not need setup notes or the setup agent's chat.
Future product scope, architecture and release proposals are PM work; unfinished setup is not. PM reconciles the generic
starter intention into a sourced initial roadmap and queues only ready work. The historical kanban seed
does not dispatch work on startup. Observe a bounded task through implementation, verification, review,
landing and subsequent PM reconciliation before claiming the development loop works. The actual first
release still needs candidate-specific human review. Local applications and packages follow the artifact
procedure in `.open-autonomy/PRODUCTION.md`; a missing live-service address does not prevent their release
planning. Later production provisioning is not an initial development-setup blocker.
