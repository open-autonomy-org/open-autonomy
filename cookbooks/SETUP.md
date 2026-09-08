# Rehearsing setup for a fresh local application

Use the [kit's setup guide](../packages/kit-hermes/template/.open-autonomy/SETUP.md) as the procedure.
This walkthrough is a disposable scenario for finding setup gaps, not a new registered project or
an approved product roadmap. The existing todo-cli, notes-api and lexicon cookbooks use the same guide
in their own .open-autonomy directories after upgrade.

## Scenario and owner choices

The owner wants an open-source SOC 2 readiness workbench for companies and CPA firms. Its complete
workspace is a user-owned folder with documented JSON, CSV and Markdown records and original evidence
attachments. People edit it through the UI or their own tools and AI. They choose their synchronization
mechanism. Git, Drive or Dropbox can transport the folder without requiring those providers' APIs.

For this rehearsal only, choose the Hermes operating defaults, a public synthetic repository,
GitHub for human coordination, and platform-funded development. No Discord connection is selected.
The application begins with local files; optional evidence collectors will later use vendor twins.
The app's eventual live connections belong to deployment or customer activation, not this setup.

The setup agent should be able to fill the product definition from this brief, retain architecture
questions for PM, prepare provisional branding, and proceed with the few owner choices above. It must
not require a customer cloud account, a final product specification, or a new routing/configuration
framework. Research belongs in sourced setup material; PM writes the notable plan after handoff.

## Exercise in the world

Bring up the Open Autonomy world using [its instructions](../world/README.md). Keep disposable projects
beside the application checkout; do not point the fleet at a real firm's evidence. Run every kit command
through the world's env command. Use the world's inert GitHub credential and a separate CLI config
directory so the scenario does not depend on the setup operator's real GitHub account.

1. Create a fresh kit project outside the monorepo. Verify it includes the setup guide and the CLI
   directs the setup agent to it. Inspect the generated project without starting its fleet.
2. Run setup with --plan and the agreed declined Discord/subscription choices. It should recommend
   the project GitHub App and explain that application services are deferred. No setup state is written.
3. Supply a synthetic Discord token while leaving that connection unselected. The recommendation must
   remain off. Explicitly selecting it should change only that choice; it is not evidence of authorization
   for any real application or server.
4. Add a synthetic deployment manifest, then inspect a fresh plan. It must still defer production.
   Select --with production explicitly to inspect the later setup. Do not provide real credentials.
5. Inspect --with release, then invoke that unsupported setup against the disposable project. It must
   fail clearly before writing setup state or collecting a release credential. Likewise reject an
   unknown or contradictory connection choice rather than silently choosing a default.
6. Rehearse a resumed setup with historical production selection but no current production request.
   Verify the initial development flow does not re-enter production. Preserve unrelated setup notes.
7. Upgrade this repository and the three cookbooks with the normal kit upgrade. Verify the shared guide
   arrives while project-owned constitution, roadmap, communication policy and model settings remain intact.
8. Resume with a saved GitHub completion marker after changing the checkout's origin or push URL to
   another repository. Setup must stop before writing state or changing the remote. Also try a project
   nested inside another checkout, a missing origin for an existing repository, inaccessible GitHub
   access, and failed Git commit/fetch commands. Restore the intended origin and verify a real fetch
   from the twin succeeds; the saved marker alone must never bypass these checks.
9. Exercise the standalone credential receiver from outside a project. Use only a synthetic token in
   normal Chrome. Verify the destination is outside Git, the saved file is owner-only, and the receipt
   contains no credential. Reject cross-origin entry and an existing destination. For GitHub, prepare
   the manifest with the browser agent and use the receiver's callback; creation and installation are
   separate steps, and a rerun must reuse the saved app. The receiver ends at saving the credential;
   the browser agent completes installation and verifies repository access through the running valve.
   A saved file or structural health response is not proof of access. Report missing twin endpoints explicitly.
10. With Discord selected, provide an explicitly agreed existing channel and a synthetic token in the
    protected credential directory. Verify that setup uses that channel, preserves native participation
    settings and per-job delivery, and refuses a missing or inaccessible destination. Declining Discord
    must also preserve previously authored cron delivery rather than deleting it.

Use the existing world scenarios for real Git landing, PM source reconciliation, native review, and
human outreach through the chosen skill. A setup plan proves choice handling, not installed credentials,
an agent's ability to understand arbitrary product requirements, or a successful autonomous project.
Browser authorization is separately verified in the actual selected provider flow when setting up a
real project. The owner should be involved only when the provider requires a human-only action or a
material owner decision is unresolved.

## Handoff and later activation

Setup completes when the development connections, runtime, owner identity and human contact path are
verified. The first PM scrum receives the brief and setup evidence, reconciles the generic seed, and
queues a bounded task. Observe that task through landing and the next scrum.

The release policy identifies the human reviewer during setup. Actual artifact publication setup and
production credentials wait for the appropriate activation work; the current CLI does not scaffold
package publication. Missing optional application credentials must not block local development or
be reported as completed production setup.

## Rehearsal evidence — September 7, 2026

The current source CLI created a fresh 53-file project outside the monorepo. Dry runs left setup state
absent; a synthetic Discord token did not select Discord, while explicit selection did. A Worker
manifest did not select production, while an explicit later request did. Unsupported package setup,
unknown choices and contradictory choices refused before state writes. A simulated previously completed
development setup retained its notes and historical production choice without executing production.

Normal upgrades installed identical setup guides in this repository and all three cookbooks; no
project-owned planning, constitution, model or communication files changed. A packed rehearsal kit was
published only to the registry twin as version 2.8.3, then used to create and inspect another fresh
project outside the monorepo. That version is a world fixture, not a proposed production release.
These observations cover setup behavior and artifact delivery; no real credential authorization,
new live project, or new end-to-end PM cycle is claimed by this rehearsal.

A subsequent Git rehearsal reproduced false success after a completed setup's origin was replaced
with an unrelated repository. The corrected helper rejected wrong fetch/push targets and a nested
checkout before state writes. It also stopped on a missing origin, inaccessible repository, rejected
commit hook and failed fetch; the rejected commit did not create a repository. A valid resumed setup
fetched the seeded main branch successfully. These checks used native Git and GitHub CLI against the
GitHub twin. A temporary host-side URL adapter routed CLI API calls to the twin because the native
macOS CLI did not trust the world's HTTPS certificate; no provider responses were fabricated. Other
completed setup steps were simulated, so this verifies the Git step, not the entire credential flow.

The credential receiver was then exercised in normal Chrome inside the world. The first form submission
exposed a referrer-policy/Origin mismatch that HTTP-only tests did not reveal. After correction, a
synthetic token was saved with mode 0600 and only its destination was printed. Credential-boundary tests
also cover origin/state rejection, overwrite refusal and repository/symlink destinations. The receiver
only receives, exchanges and saves credentials; installation lookup now belongs to the valve when it
uses the app key. A world request without an available installation failed safely, and requests for a
different repository were refused. These prove local handoff and isolation boundaries, not live provider
authorization. The GitHub twin currently lacks the manifest conversion and repository installation
lookup needed to prove the complete GitHub handoff; do not label that flow verified yet.

A further replay put a rejecting commit hook in a disposable checkout. Owner-rule setup still reported
prepared and wrote its completion marker despite that failed commit. The corrected flow stops at failed
Git operations and waits for the intended CODEOWNERS file to land. Existing rulesets are preserved;
the setup agent remains responsible for verifying effective human authority and review policy.
The world then exercised staged-work refusal and a pending landing. After the failed hook was repaired,
the world's normal landing workflow merged the owner-rules branch; setup then succeeded. An existing
requirement to resolve review threads remained enabled across the rerun.

The Discord replay then used the synthetic bot and an explicitly selected existing channel. A missing
destination stopped setup; the selected destination and a subsequent saved-destination rerun succeeded.
An inaccessible replacement channel was refused while the prior destination remained intact. Native
allowed-user and free-response settings and an explicitly local PM report stayed unchanged, including
when Discord setup was declined. No channel creation or provider-branding mutation was needed.
