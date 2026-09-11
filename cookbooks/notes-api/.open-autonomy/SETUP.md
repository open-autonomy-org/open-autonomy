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

Automated tests are banned by the project constitution. Do not create or run them, including indirectly
through check commands or hooks, and never commit test code to main. During setup, inspect any verification
command before running it. Each develop agent demonstrates its feature through REPL-style manual usage
without permanent test code and records observations in its handoff. This rule also applies to setup
rehearsals; use interactive operation, not automated scenario runners.

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

  Planning       Strategy sets scope; PM manages delivery and CHANGELOG.md
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
PM manages the sourced roadmap and changelog after handoff and always captures explicit authorized
requests. Strategy develops scope under the owner's mandate. Do not invent a backlog during setup.

Establish strategy activation and authority separately in the existing project-communications skill.
Recommend on-demand strategy preparing proposals for human decision unless the owner's instructions
already establish another arrangement. Offer native recurring discussions/research or event triggers
only when useful to that project; a schedule does not grant scope authority. An autonomous mandate
states its objective and bounds (for example competitive parity and constitutional boundaries); collaborative strategy
names the agreed decision-makers and channel. Reuse the verified roster, selected integrations and
existing answers. Projects driven by explicit requests still have on-demand strategy available.

Create or update a native strategy cron job only for an agreed schedule, loading skills: [strategy].
On-demand strategy runs in a separate native session loading the same skill; it needs no idle recurring
job, extra service, profile/model configuration or policy parser. Verify the actual installed skill and
agreed activation. Check that PM can capture an authorized request without invoking strategy, and that
an ordinary suggestion or an empty board does not become autonomous new scope.

Reuse answers already given and present the recommended operating defaults together. Settle only what
is missing and materially affects setup: working name/repository owner, the development host, the model
arrangement and budget, human coordination destination, and owner/release reviewer. Keep the template's
development conventions and native schedules unless the project requires a change. Architecture and
feature questions can remain for strategy under its mandate; credentials or directories found on the machine are availability
evidence, not permission to use them for this project.

Use a lowercase runtime slug such as `audit-desk` for `--project`: letters and digits separated by
hyphens, at most 64 characters. It names Docker images, the World executor and default credential
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
path needs. The managed executor uses the host project GitHub App valve for Git and community access,
with Contents: write installed for this repository. Bare development can retain its repository-scoped
SSH deploy key and a read-only Contents grant for the community App. Reuse existing project integrations; a
completed registration is not proof that the fleet can use it. This is setup-agent judgment using the existing
configuration, not another configuration file or user questionnaire.

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
and an existing model subscription. Apply the decisions using the existing `--with` and `--without`
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
                  Runs here, bare or in the container; this computer must stay awake
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

Local Codex is plain Hermes on its own `openai-codex` provider: the same agent loop, tools, board, skills
and channels as any other model, with the model turn on the owner's ChatGPT allowance. The fleet looks
the same wherever it runs.

- **Bare or in a container:** the host valve asks the installed Codex app-server for the current
  ChatGPT access token. Codex owns storage and refresh, including its configured credential store.
  Run the host service as the signed-in user with the same `CODEX_HOME`. The next request picks up a
  changed login. OA does not copy the login into project secrets or Hermes's home. Hermes receives
  only a stand-in credential and the valve address. Bare execution alone provides no filesystem
  isolation: real autonomous runs require an OS user boundary (the existing `--as` mode) or the container.
  Use synthetic credentials for unisolated rehearsals. Container Git uses the project GitHub App valve.
- **In a world:** the rehearsal engine names the model twin in `HERMES_CODEX_BASE_URL`, and the same
  forwarding points the provider at the twin's Responses door without accessing the host login.

`--with subscription` verifies authentication through the installed Codex and switches profiles that
are not already on `openai-codex` to the kit's starter model. It does not select the owner's exact model.
On upgrade, old protected codex.json copies are unused. Preserve them during migration; any later
credential cleanup is a separate owner decision, never an incidental kit upgrade.
Before activation, the setup agent reconciles **both** `hermes/config.yaml` and
`hermes/profiles/treasurer/config.yaml` with the agreed, locally verified model:

```yaml
model:
  default: <exact model verified in local Codex>
  provider: openai-codex
```

Reconcile the model with the owner's choice and what `codex` offers; do not change the operator's global
Codex configuration. A fleet on the older `codex-valve` custom provider keeps working, forwarded the same
way; switching it to `openai-codex` is one config edit.

Read `GET /v1/catalog` through an authorized standalone platform valve as described below; `GET /v1/models`
lists only the current key's bounds, not the platform's available choices. If no authorized platform
connection exists yet, establish that connection with the existing key tool and standalone valve before
finalizing the model choice. Initial key bounds are provisional, not proof of availability or permission to
spend. If catalog access fails, report the unavailable lookup and resolve it rather than presenting the
template's default as a verified catalog. This discovery does not require starting Hermes or funding a
model call. A missing or unusable subscription should be stated plainly when offering the platform options.

When the owner already selected the subscription, retain that choice and verify its agreed model; a catalog
comparison is not a prerequisite. The platform connection is still needed for reporting. File-based Codex
credentials use `CODEX_HOME` (default `~/.codex`); keyring-only or ephemeral login does not establish a
transferable host credential. Follow [Codex authentication](https://developers.openai.com/codex/auth) for
the installed storage arrangement. Never print the credential or silently change the operator's global
storage policy. The managed subscription step remains incomplete until its protected copy is usable.

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
| GitHub repository | Verify the owner and repository; the helper generates and registers a repository-scoped SSH push key | The agent's key can push its branch; main requires agent review; release requires human approval |
| Project GitHub App | The browser agent handles registration and installation; the standalone credential receiver only saves the key; verify access through the running valve | Through the app/valve, read this repository's issues, PR reviews/checks, workflows and release records |
| Open Autonomy platform | The key tool prepares a repository-control claim; the setup agent lands it through normal Git/PR tools, then reruns setup to provision developer/treasurer credentials into protected host storage | The project account is correct and the actual reporting/model arrangement works |
| Optional communication provider | Guide the chosen provider's application setup, scopes and installation; use protected page capture for displayed credentials, or secure entry when capture is unavailable | Read the agreed history, deliver to the agreed destination, and recognize the owner's reply |
| Development model | Reuse the agreed authorized connection or complete the required provider authorization | A call through the installed runtime succeeds under the intended account and bounds |

Verify these connections before starting the fleet. Run the existing vendored SDK valve CLI on the
host, supplying `--loopback` and the selected `--key`, `--github-app` and optional `--codex` arguments;
this starts only the valve. Credential files stay in protected host storage. The executor reaches the
host valve through its verified local route; never mount credentials into it or publish the valve
publicly. Its placeholder bearer is not an access boundary.

Use actual repository reads and a bounded model request under the agreed funding arrangement; a health
response alone is insufficient. Exercise a PR read through the installed Hermes terminal tool with its
normal unattended approval policy, so a command-scanner rejection is discovered during setup. Resolve
trust for the configured local connection through native policy before activation; do not disable the
scanner or grant blanket command approval. Stop the temporary valve before the normal stack takes its
ports. Verify the effective Git fetch and push routes and selected communication provider through their
native tools as well. Reporter delivery and the loaded Hermes configuration are checked on final startup;
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
agreement. `DISCORD_HOME_CHANNEL` selects a destination; it does not admit inbound messages. For
agreed public project channels, set native `DISCORD_ALLOWED_CHANNELS` in the protected channels.env
to those channel IDs (comma-separated), and set `discord.group_allow_from: ["*"]` in the existing
Hermes config.yaml Discord block. The adapter restricts channels; the gateway separately admits
group senders. Check these settings against the installed Hermes version, then reload through the
runtime's existing lifecycle.
Use the narrower agreed native role/user policy when that is the project policy; do not grant
server-wide or DM access to make a channel test pass. Participation does not grant project authority.
Verify a real inbound mention and thread reply from the confirmed account in the agreed channel,
including native sender metadata and the agent's response, before enabling recurring jobs.
A browser-driven test may use an
authorized existing session; label it as an operator test rather than independent human approval.
A delivered message alone does not prove discovery works. Declining a setup step does not disconnect
an established provider; an agreed removal uses native configuration and lifecycle tools.

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
Request the complete development permission set at initial registration, for every launch mode:

```json
"default_permissions": {
  "contents": "write",
  "workflows": "write",
  "pull_requests": "write",
  "issues": "write",
  "discussions": "write",
  "actions": "write",
  "checks": "write",
  "statuses": "write",
  "metadata": "read"
}
```

This is the template's standard development grant, including Git pushes, workflow edits and agent PR
reviews. Do not reduce it based on the first feature or selected Git transport and add permissions
piecemeal later. Install only on the agreed project repository. Repository administration, environments,
secrets and organization/account permissions are outside this grant; human release authority remains
separate. No webhook or subscribed events are needed. Use the project page as the app homepage and
register a private app under the agreed repository owner.

For an existing App, compare its registration AND installed grant with the complete set above, update
missing permissions together, and accept the update on the existing installation. Registration changes
do not upgrade an installation until accepted. Reuse the App, installation and protected credential;
no reinstall or key replacement is needed. Record the verified grant in the existing setup record.
Verify the first real contribution can push, receive a separate agent's GitHub approval and auto-merge
before declaring setup complete. Use manual operation, never automated tests or synthetic test PRs.
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
command to transfer that one field directly into protected storage. The [vendored SDK README](sdk/README.md)
documents the command and supported browser-controller interface. Reuse the browser skill's existing normal-Chrome connection
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

The model choice does not change the fleet architecture. For the managed setup, World owns one executor
and the host runs `start.ts --container`: credential valves and SDK reporting stay outside, native Hermes
runs inside. Follow `container/README.md` for preparation, activation and supervision. The bare start
script remains the development and twin-rehearsal path; it is not credential isolation.

Verify Bun 1.3.10 or newer and the application's verification tools where the fleet runs before
starting PM. Install locked project dependencies and manually verify the feature in that environment.
The kit image includes `volter-world` on PATH. The host preflight verifies PID 1 reaping, native tool
availability, the checkout write roots, and execution from `$HERMES_HOME/artifact-verification`. Use unique
directories there for extracted installs and release checks; `/tmp` may deliberately be `noexec`.
Do not relax isolation or replace the declared compiler command to make verification pass.
A fresh template includes its compiler; an existing project keeps its own working tooling.

Establish the application's local world using this machine's World instructions. Seed vendor state
through the vendor APIs and script judgments/faults with world handlers. Add twins as product
dependencies emerge. A local folder application can begin with synthetic files and no external
application services. Keep the fleet's real repository/model connections separate from synthetic
customer integrations, even when both happen to use the same vendor.
For a product that operates on user-owned folders, the development checkout and the customer's data
folder are different boundaries. Verify with synthetic workspaces; optional customer Git or storage sync
does not authorize the fleet to read those accounts or require their credentials during development setup.

For a World-managed stack, declare the complete peak resources: memory reservations are machine-wide
and disk reservations belong to the filesystem they occupy. Diagnose capacity refusals through World
before changing requirements. Make service commands safe after partial startup, preserving persistent
volumes and handling an already-absent service. When stopping through a service manager, let the
foreground process and World teardown finish before restarting; verify the native Hermes lifecycle
record rather than assuming the service-unload command means shutdown has finished.

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
For bare deployments using a deploy key, setup also checks on reruns that it remains registered with write access. A revoked,
disabled or read-only key requires the setup agent to reconcile the intended access; setup does not
restore a revoked registration or expand existing permissions automatically.

Before activation, inspect effective main rules: require at least one approving PR review, dismiss stale
approvals when a diff changes, retain existing stronger protections and permit no agent bypass. Existing
rulesets are preserved by setup helpers, so the setup agent must reconcile an older zero-review rule.
Keep the PR author and reviewer identities distinct: the landing workflow opens PRs as GitHub Actions;
the project's GitHub App needs pull_requests write to submit the native reviewer's verdict. Verify that
this reviewer can supply a qualifying approval without requiring a human for every development PR.
Do not require approval from the last pusher when that would make the shared project App unable to act
as reviewer; independent Hermes sessions provide the worker/reviewer separation. Human release approval
remains a separate authority requirement. Verify this flow using the actual first contribution, not a
synthetic test PR or automated tests.

Repository policy has no CODEOWNERS or human development-review gate, including workflow changes.
Remove inherited CODEOWNERS files from root, `.github/` and `docs/` through the normal PR process and
reconcile all effective main rules to disable code-owner review while retaining independent agent
approval, stale-review dismissal and no bypass. Do not regenerate CODEOWNERS during setup or upgrades.
The helper only prepares absent rulesets; the setup agent verifies and reconciles existing repository
and inherited organization rules under the agreed policy before activation. Keep human release reviewers
and production environment gates. Development code receives no production keys; release approval covers
the exact candidate that can use them.

Verify the native reviewer can load `sdlc-review` in the actual Hermes home before activation. Use
Hermes' bundled skill sync when enabled. A Blank Slate home deliberately skips bundled sync: configure
native `skills.external_dirs` to the installed Hermes checkout's `skills/devops/sdlc-review` directory
in `hermes/config.yaml`, and verify `skill_view("sdlc-review")` actually resolves it. Do not vendor a
second copy or enable the whole catalog just for review. Keep the project's manual-verification policy
authoritative over generic skill suggestions about tests.

Before exercising landing, enable the repository's native auto-merge setting (`gh repo edit --enable-auto-merge`)
and verify that its Actions settings permit the landing workflow to create pull requests. Inspect
`repos/<owner>/<repo>/actions/permissions/workflow` through `gh api`; the GitHub setting named
`can_approve_pull_request_reviews` governs Actions creating and approving PRs. Configure the agreed setting
through the owner's repository administration, preserving other workflow permissions and organization policy.
The landing workflow never submits approvals: the independent agent review requirement still applies.
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

Exercise the PM/community helpers through a native Hermes terminal tool, not only an operator shell.
The managed-container profiles use `terminal.shell_init_files` to activate the existing Hermes virtual
environment after login-shell initialization; Docker PATH alone is insufficient. For a host install,
set that native option to its actual activation file when the terminal cannot import Hermes APIs.
Verify that a first GitHub poll discovers known repository activity before acknowledging its cursor.
Also exercise native file creation and patching in a disposable checkout subdirectory. The managed
container’s `HERMES_WRITE_SAFE_ROOT` includes `/opt/data` and `/work/project`; verify unrelated paths
and protected credential paths remain denied. A working terminal does not prove file-tool access.

For a host service, retain the operator's real `HOME` and intended `CODEX_HOME`; use `--home` or
`HERMES_HOME` for Hermes's own state. Only the container process receives the container home.
Verify the installed Codex under that actual service environment. Native startup can perform local
database maintenance before authentication; let it finish. A failure before `initialize` is a Codex
runtime failure, not proof of an invalid login. Diagnose it before asking for another sign-in. Keep
credential storage and conversation history intact; setup does not clone or repair Codex databases.

Record material setup architecture choices in project-owned ADRs under `docs/decisions/`, following
`CONTRIBUTING.md`: include the runtime and credential boundaries, alternatives, sources and constitutional
fit. Complete independent constitution review and normal PR landing before activating those choices.
When adopting an existing project, inspect its records and reconcile conflicting or unreviewed choices;
do not label historical architecture accepted merely because it is already running. Keep project ADRs
and contribution policy intact during kit upgrades; reconcile new guidance through an ordinary PR.

PM starts with the established constitution, roster, communication policy and operating configuration,
plus the project's ordinary source history. It does not need setup notes or the setup agent's chat.
Strategy handles product scope under the established mandate; PM handles authorized delivery,
implementation sequencing and release proposals. The constitution is a conception/merge constraint,
not a backlog generator. PM reconciles historical starter intentions against explicit authority; the
hello seed alone grants none. Strategy's first invocation develops a coherent product-level plan when
requested or triggered under its agreement; on-demand availability does not require running it during
setup. PM can immediately record and deliver explicit authorized requests without a strategy meeting. The historical kanban seed
does not dispatch work on startup. Observe a bounded task through implementation, verification, review,
landing and subsequent PM reconciliation before claiming the development loop works. The actual first
release still needs candidate-specific human review. Local applications and packages follow the artifact
procedure in `.open-autonomy/PRODUCTION.md`; a missing live-service address does not prevent their release
planning. Later production provisioning is not an initial development-setup blocker.
