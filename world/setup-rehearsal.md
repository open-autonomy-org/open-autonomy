# Setup rehearsal

Use this procedure when changing the kit's onboarding, credential handling or activation behavior.
The [template setup guide](../packages/kit-hermes/template/.open-autonomy/SETUP.md) remains the procedure
for setting up a project. This document describes how contributors verify that procedure locally.

## Environment and scenario

Start the [local world](README.md) and run kit commands through `bun world/run.ts env -- <command>`.
Keep disposable projects outside the monorepo and their credential directories outside every checkout.
Use the world's synthetic identities and a separate GitHub CLI configuration. Verify Git and CLI traffic
reaches the twin before running mutating setup commands. Seed provider state through the vendor APIs.

For a sample brief, use an open-source SOC 2 readiness workbench for firms and their clients. Its data is
a user-owned folder of documented JSON, CSV, Markdown and evidence attachments. For the rehearsal,
select GitHub coordination and platform-funded development; decline Discord and a model subscription.
The product initially has no external application services. These are fixture choices, not a registered
project or an approved roadmap. Use synthetic customer data throughout.

Create the fixture with the source CLI, then inspect its setup plan:

```sh
bun world/run.ts env -- bun packages/kit-hermes/src/cli.ts create /absolute/scratch/setup-project --project setup-rehearsal --account cookbook/setup-rehearsal
bun world/run.ts env -- bun packages/kit-hermes/src/cli.ts setup /absolute/scratch/setup-project --plan --without discord,subscription --secrets /absolute/scratch/setup-credentials
```

Replace the example paths with disposable locations on the world host. Run mutating cases only against
the synthetic repository. Reset or recreate fixtures between cases that change their opening state.

## Cases to exercise

| Case | Expected behavior |
|---|---|
| Fresh project | Includes the setup guide; the CLI directs the setup agent to it. A plan writes no setup state and does not activate the fleet. |
| Connection choices | An available token does not select Discord. A deployment manifest does not select production. Unknown, contradictory or unsupported choices fail before credential collection. |
| Resume | Historical production selection does not repeat production setup. Missing files for completed credential steps stop setup without changing its record or issuing replacements. |
| Git identity and access | Wrong fetch/push targets, nested checkouts, inaccessible repositories and failed Git commands stop setup. A saved marker does not bypass current checks. |
| Repository policy | Staged work and stricter existing rules remain intact. Owner-rule preparation waits for the intended CODEOWNERS file to land. The setup agent verifies effective human authority separately. |
| Credential destination | Default and explicit directories work outside Git. Project directories, including before Git initialization, other checkouts and symlink aliases into them are refused before state or credential writes. |
| Credential handoff | In normal Chrome, a synthetic token saves as an owner-only file with a non-secret receipt. Wrong origin/state and overwrite attempts fail. GitHub registration, saving and installation remain separate steps; resume reuses the existing app. |
| Platform key storage | Minting into a new nested directory prepares the actual destination. Rotation preserves owner-only storage. Neither operation accepts a repository or symlink output. |
| Optional Discord | An explicitly selected existing destination is verified. Missing or inaccessible destinations fail; native participation settings and per-job delivery remain intact, including when setup is declined. |
| Upgrade | Normal kit upgrades update the guide and runtime in generated projects, including the cookbooks. Project-owned constitution, planning, communication policy and model choices remain intact. |
| Activation | Missing developer credentials stop startup before services or runtime-home writes; a treasurer credential alone is insufficient. With valid credentials, the supported lifecycle loads the intended home and native schedules. |

For the PM handoff, use the existing [scrum and release scenarios](README.md#roadmap-scrum-rehearsal).
Verify source discovery, actual human outreach and replies, a bounded task through landing, and subsequent
PM reconciliation. A printed start command or successful cron exit does not prove the loop works.
Release review remains specific to the candidate; initial development setup does not authorize publication.

## Evidence and coverage

Record exercised cases, results, simulated/skipped steps and remaining gaps in the change's PR description.
Keep this procedure reusable rather than appending a history of individual runs. File presence and health
responses alone do not prove authenticated access; verify through the installed connection.

The GitHub twin currently lacks manifest conversion and repository-installation lookup, so it cannot
prove the complete GitHub App handoff. Native GitHub CLI certificate support can also limit a local
rehearsal. Report these as coverage gaps; a substituted success response is not verification. Provider
authorization must ultimately be verified through the actual selected flow during authorized setup.
