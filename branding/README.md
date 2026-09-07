# Project branding

This is the project's working identity, shared by its integrations. It can be provisional.

During initial setup, the setup agent reuses any existing project name, logo and description. If none
exist, it creates a first pass from the README and constitution: a recognizable square icon and a short
blurb saying what the project does. Prepare this before creating new integrations where practical;
finish the pass during setup, without waiting for a final brand decision or creating an extra approval gate.
Existing integrations are evidence to reconcile, not a reason to create replacements.

Fill `brand.json` with the project display name and a one-line description (up to 200 characters).
Keep the display name within 32 characters for reuse across providers. Export the icon as a square
PNG named icon.png in this directory, at least 512 pixels across and under 1 MB; 1024 pixels is a useful
default. Retain an editable source such as icon.svg alongside it. Check that the mark remains recognizable
at avatar size and survives a circular crop. Make another size only when a provider actually requires it.

Use that name, blurb and icon for the project's GitHub App, Discord application **and bot profile**,
OAuth application, project-specific funding pages, and other project integrations. Provider-required
unique handles may use the project or repository qualifier; record the chosen handle in existing setup
notes. Preserve application IDs, installations and credentials across branding changes and harness upgrades.
Human accounts and shared organization/provider accounts keep their own identities.

GitHub's manifest sets the name and description; upload the PNG in the existing app's settings afterward.
Discord has separate application metadata and bot username/avatar: verify both. Where a provider has no
API for a field, the setup agent uses its existing browser session. Reuse established project integrations
and verify ownership before changing one. Describe the project in the blurb; do not name its runtime as
the project's identity. Record unresolved provider fields in setup notes and return to them before declaring
setup complete. Later branding refinements update this bundle and the same integrations.

This installation reuses the existing Open Autonomy coral open-loop mark from the platform.
The first-pass blurb follows the project constitution.
