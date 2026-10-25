#!/usr/bin/env bash
# The release door: publish each package version npm lacks (@open-autonomy/sdk, @open-autonomy/backend,
# create-open-autonomy, @open-autonomy/cli, in that order: the kit and the CLI depend on the SDK), from a checkout of
# the `publish` branch, as supercode's scripts/npm-publish-missing.sh does. An npm package is published only with the
# keys sweep over its exact tarball ("for the npms, we can carve out an exception to allow public release IF we have
# the keys sweep"). In order, before anything is uploaded:
#   1. the release scan (.github/release-scan.mjs, company decision 0038) of the lockfiles the kit ships, against the
#      last `release-v*` tag;
#   2. each version npm lacks packed once, from the files git tracks at this commit, its workspace dependencies pinned
#      to this checkout's versions and group/other write dropped from every file mode, into one tarballs folder;
#   3. every tarball installed fresh and its modules resolved from that install (scripts/npm-verify-tarballs.mjs);
#   4. the keys sweep over every file of every tarball (scripts/npm-keys-sweep.mjs: gitleaks, this machine's custody
#      values and Teams' token forms).
# Any failure publishes nothing. Then each swept tarball, and only it, is uploaded (`npm publish <file>.tgz`), npm's
# integrity for it is read back against the file's, and a new kit version is recorded as a `release-v<version>` tag and
# GitHub release. npm's own login (`npm whoami`) is the publisher.
#
#   scripts/npm-publish-missing.sh           publish (on `publish`, at origin/publish, VOLTER_PUBLICATION_AUTHORIZED=1)
#   scripts/npm-publish-missing.sh --check   list the versions npm lacks; publishes nothing
set -euo pipefail
cd "$(dirname "$0")/.."
PACKAGES="packages/sdk packages/backend packages/kit-hermes packages/cli"
REGISTRY=https://registry.npmjs.org/
version_of() { node -p "require('./$1/package.json').version"; }
name_of() { node -p "require('./$1/package.json').name"; }
on_npm() { npm view "$1@$2" version --registry "$REGISTRY" --fetch-retries=0 --fetch-timeout=15000 >/dev/null 2>&1 </dev/null; }

if [ "${1:-}" = "--check" ]; then
  for p in $PACKAGES; do
    name=$(name_of "$p"); v=$(version_of "$p")
    if on_npm "$name" "$v"; then echo "on npm: $name@$v"; else echo "to publish: $name@$v"; fi
  done
  exit 0
fi

# Publication is its own act, cut from the publish branch the owner merged, never from main or a tree with edits.
[ "$(git symbolic-ref --quiet --short HEAD)" = publish ] || { echo "Publication requires a checkout of the publish branch" >&2; exit 2; }
[ "${VOLTER_PUBLICATION_AUTHORIZED:-}" = 1 ] || { echo "Explicit publication authorization is required (VOLTER_PUBLICATION_AUTHORIZED=1)" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "The publish checkout has uncommitted changes; nothing is published" >&2; exit 2; }
git fetch --quiet --tags origin publish </dev/null
[ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] || { echo "HEAD is not origin/publish; nothing is published" >&2; exit 2; }
head=$(git rev-parse HEAD)

# 1. The release scan, before anything installs.
since=$(git describe --tags --abbrev=0 --match 'release-v*' HEAD 2>/dev/null) || { echo "No release-v* tag to scan the lockfiles against; nothing is published" >&2; exit 1; }
RELEASE_SCAN_SINCE=$(git rev-list -n 1 "$since") node .github/release-scan.mjs bun.lock packages/kit-hermes/base/.open-autonomy/bun.lock </dev/null

# 2. Pack each version npm lacks, once.
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
: > "$T/packed"
for p in $PACKAGES; do
  name=$(name_of "$p"); v=$(version_of "$p")
  if on_npm "$name" "$v"; then echo "$name@$v is already on npm"; continue; fi
  src="$T/src/$p"; mkdir -p "$T/src"
  # the files git tracks at this commit, nothing else from the tree
  git archive --format=tar HEAD "$p" | tar -x -C "$T/src"
  # A workspace dependency is pinned to the version in this checkout, not left to the packer's substitution:
  # create-open-autonomy vendors the SDK it was built with into every project it makes, and a stale pin ships a client
  # that cannot read what the project needs.
  node -e '
    const fs = require("fs");
    const [p, src] = process.argv.slice(1), file = src + "/package.json", m = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const [name, range] of Object.entries(m[field] ?? {})) {
        if (typeof range !== "string" || !range.startsWith("workspace:")) continue;
        const v = JSON.parse(fs.readFileSync(name.replace("@open-autonomy/", "packages/") + "/package.json", "utf8")).version;
        m[field][name] = v; console.log(`pinned ${name} ${range} -> ${v}`);
      }
    }
    fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
  ' "$p" "$src"
  # `bun pm pack` copies each file's mode from disk: group and other lose write, so the tarball's modes are git's
  # (0644, or 0755 where git marks a file executable) on every machine.
  find "$src" -exec chmod go-w {} +
  d=$(mktemp -d "$T/pack.XXXXXX"); (cd "$src" && bun pm pack --destination "$d" </dev/null)
  set -- "$d"/*.tgz
  [ "$#" = 1 ] && [ -f "$1" ] || { echo "bun pm pack left no single tarball for $name@$v" >&2; exit 1; }
  kept="$T/$(printf '%s' "$name" | tr / +)@$v.tgz"; mv "$1" "$kept"
  printf '%s\t%s\t%s\n' "$p" "$name" "$v" >> "$T/packed"
done
[ -s "$T/packed" ] || { echo "every version is already on npm"; exit 0; }

# 3. and 4. Every tarball loads as npm will serve it, and holds no key, custody value or Teams token.
node scripts/npm-verify-tarballs.mjs "$T" </dev/null
node scripts/npm-keys-sweep.mjs "$T" </dev/null

# Upload the swept tarballs, and only them.
echo "publishing as $(npm whoami --registry "$REGISTRY" </dev/null)"
kit_version=""
while IFS="$(printf '\t')" read -r p name v; do
  file="$T/$(printf '%s' "$name" | tr / +)@$v.tgz"
  integrity="sha512-$(openssl dgst -sha512 -binary "$file" | openssl base64 -A)"
  (cd "$T" && npm publish "$file" --access public --registry "$REGISTRY" </dev/null)
  served=$(npm view "$name@$v" dist.integrity --registry "$REGISTRY" --prefer-online </dev/null 2>/dev/null || true)
  if [ "$served" = "$integrity" ]; then echo "npm serves the swept bytes: $name@$v $integrity"
  elif [ -z "$served" ]; then echo "uploaded, not yet readable on npm: $name@$v (expect $integrity)"
  else echo "npm serves other bytes for $name@$v: $served, not the swept $integrity" >&2; exit 1; fi
  if [ "$p" = packages/kit-hermes ]; then kit_version="$v"; fi
done < "$T/packed"

# A new kit version, recorded as a tag and a GitHub release on the commit it was packed from.
if [ -n "$kit_version" ]; then
  tag="release-v$kit_version"
  repo=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
  if gh release view "$tag" --repo "$repo" >/dev/null 2>&1 </dev/null; then echo "$tag already has a GitHub release"
  else
    notes=$(printf 'Published to npm: [create-open-autonomy@%s](https://www.npmjs.com/package/create-open-autonomy/v/%s).\n\nStart a project: `bun create open-autonomy <dir>`. What changed: [the commits](https://github.com/%s/commits/%s).' "$kit_version" "$kit_version" "$repo" "$tag")
    gh release create "$tag" --repo "$repo" --target "$head" --latest --title "Open Autonomy kit $kit_version" --notes "$notes" </dev/null
  fi
fi
