---
name: front-door
description: The bar for the project's front door — its GitHub README, the repository's description, topics, homepage and social preview, and its docs once they outgrow the README — and how it stays true to what ships. Consult when a change alters what a user sees or does, and at every scrum and release.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, docs]
    category: devops
---

# The front door

A project's front door is its GitHub page: `README.md` and the repository's own metadata. It is where a
person decides in seconds whether this project is for them, and where they succeed or fail at first use.
The project's Open Autonomy page shows how it is built; the front door shows what it is. Posts, dev logs
and announcements on the project's channels are the community skill's.

## The bar

Idiomatic: it reads like the best projects of its kind in its ecosystem. Before writing, look at two or three
leading projects in the same category (the same kind of CLI, library, service or app) and follow their
conventions: an npm package shows install and a first import, a CLI its install and one real command with its
output, a deployable service its deploy path. Note in the change what they do that this README does not.

Best in class: a newcomer can answer, from the top of the page, what it is, whether it is for them, and how to
get to a first success. In this order:

1. **Name and one line** saying what it is, the same line as the repository description. The project's own
   status badges (version, build, license), if any, sit just under it.
2. **The product itself, shown**: a screenshot, an animated capture or a terminal recording of the real
   product doing its main job (see Media). A project with nothing visual shows its shortest real use.
3. **Who it is for and why**, in two to four plain lines. No machinery, no process, no adjectives it has not
   earned.
4. **Quick start**: what it needs first (runtime, accounts, versions), then the shortest real path from nothing
   to a first success. Every command works as written, in order, on a fresh setup: follow it literally in the
   project's verification world before landing it.
5. **What it does**: the main capabilities, each in a line or two, shown where showing is clearer.
6. **More**: the docs (when they exist), configuration, how it works in brief, status and version.
7. **Getting help**: where to ask (its discussions, issues or support channel) and where to report a security
   problem.
8. **Contributing and license**, briefly, linking `CONTRIBUTING.md` and the license, and `CODE_OF_CONDUCT.md`,
   `SECURITY.md` or `SUPPORT.md` where the project has them. Last: that it is built in the open with Open
   Autonomy, linking its page, with the Open Autonomy widgets. Nothing about the agent or the kit comes before
   the product.

Clear: short sentences, the reader's words, concrete examples over claims. Cut what a newcomer does not need
at the door; it belongs in the docs.

## Media

Show the real product, never a mockup. Capture it while verifying the feature it shows, in the project's
verification world, and name the feature in the change. Stale media is worse than none: when a feature's
look or behaviour changes, its captures are retaken in the same change.

- Images: PNG, or an animated GIF for a short flow, under `docs/media/`, referenced by relative path, with alt
  text that says what it shows. Keep each small (compressed, sized for the page, a few MB at most): what is
  committed stays in the history. Look at the rendered page before landing.
- Terminal: record a real session and render it to an animated SVG or GIF. Keep the capture script that
  drove it, so it can be retaken: it records and asserts nothing, and is never a test.
- Video: never commit it; GitHub plays a video inline only when it was uploaded through its web interface.
  Link a hosted clip or a release asset, with a still image that opens it.
- Social preview: 1280×640, PNG, JPG or GIF under 1 MB, the product and the project's brand (`branding/`).
  GitHub takes it only in the repository's settings, outside the agent's integrations (see below).

## The repository's metadata

The description matches the README's one line; the topics name its category, ecosystem and platform; the
homepage points at the docs site or the running product, when either exists. Read them with
`gh repo view --json description,homepageUrl,repositoryTopics`.

What the front door touches goes through the project's integrations: the README, docs, media and Pages through
its GitHub App as ordinary changes; posts through the channels `project-communications` records. A setting or
a channel no integration reaches (the repository's description, topics, homepage and social preview, which
the App is not given the administration permission to change; a publishing platform with no integration) is
coordinated with the team: the member `project-communications` names for it, else the team's agreed
coordination channel, with the exact values or file ready. Ask once, record it on the roadmap until done, and
do not route it to the owner unless the owner is that member.

## Docs

The README gets someone started; docs answer everything after. When the README turns into a manual (long
reference, several guides, configuration tables), move that material to `docs/`, with `docs/index.md` its
home, and keep the README's bar. The kit's `.github/workflows/pages.yml` publishes `docs/` once the team sets
the repository's Pages source to GitHub Actions (a setting, coordinated as above; a private repository needs
a paid plan for Pages); then link the site as the homepage and check a change actually appears there. Docs
follow the same rules as the README: written from the real product, updated in the same change as the
behaviour they describe.

## Keeping it true

- A change that alters what a user sees or does (a command, an option, an output, a screen, an install or
  deploy step, a limit) updates the README, the docs and their media in the same change.
- Every scrum compares the front door with what landed since the last one (`CHANGELOG.md`, merged PRs) and
  fixes what it no longer tells truly.
- A release candidate is not ready while its front door describes anything else: what ships is what the page
  shows, down to the quick start.
