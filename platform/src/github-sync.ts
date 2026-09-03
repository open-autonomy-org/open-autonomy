import { LimitLedgerClient } from './limit-ledger.js';
import type { Env } from './types.js';

// Pull a project's display metadata from its own GitHub repo (description, owner avatar, social
// preview, homepage) and cache it on the account. The project is self-describing: editing its repo
// description updates the funding page. Unauthenticated read → only public repos sync, which is
// exactly the gate for appearing on the public storefront. Best-effort: failures are swallowed.

const STALE_MS = 24 * 60 * 60 * 1000;

interface GitHubRepo {
  description?: string | null;
  homepage?: string | null;
  html_url?: string;
  private?: boolean;
  owner?: { avatar_url?: string };
}

export function isStale(syncedAt?: string): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  return !Number.isFinite(t) || Date.now() - t > STALE_MS;
}

// GitHub REST headers. With GITHUB_TOKEN set the worker gets the authenticated rate limit; without it the
// worker's shared Cloudflare egress IPs share GitHub's 60/hour anonymous budget, which is why the docs are
// fetched from raw.githubusercontent.com (not rate-limited that way) and metadata failures are logged, not
// swallowed.
function ghHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-funding' };
  if (env.GITHUB_TOKEN) h.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

export async function syncProfile(env: Env, account: string): Promise<boolean> {
  if (!account.includes('/')) return false; // named roots are internal funding nodes, not repos
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}`, {
      headers: ghHeaders(env),
    });
    let repo: GitHubRepo | undefined;
    if (res.ok) {
      repo = await res.json() as GitHubRepo;
      if (repo.private) return false;
    } else if (res.status === 404) {
      return false; // absent or private → not eligible for the public storefront
    } else {
      // Rate-limited or transient: keep the cached metadata, still refresh the docs (they come from raw).
      console.warn(`github-sync: ${account} metadata ${res.status}; syncing docs only`);
    }
    // Cover = the first real image in the README (a proper banner) if the repo has one; otherwise leave
    // it empty so the page renders a clean, deterministic coral gradient (the GitHub OG social card is
    // a busy link-preview card with its own text, so it makes a poor banner).
    const cover = repo ? (await firstReadmeImage(env, account)) ?? '' : undefined;
    // The project's identity docs, read from its own repo. A repo that ships none simply has empty
    // panels — the page degrades cleanly. Size-capped so the cached profile record stays small.
    const [charter, roadmap, changelog] = await Promise.all([
      fetchRepoText(env, account, 'docs/VISION.md'),
      fetchRepoText(env, account, 'ROADMAP.yml'),
      fetchRepoText(env, account, 'CHANGELOG.md'),
    ]);
    await new LimitLedgerClient(env.LIMITS).setProfile(account, {
      tagline: repo?.description ?? undefined,
      avatar_url: repo?.owner?.avatar_url ?? undefined,
      cover_url: cover,
      homepage: repo ? repo.homepage || repo.html_url || undefined : undefined,
      synced_at: new Date().toISOString(),
      charter_md: charter ?? '',
      roadmap_yml: roadmap ?? '',
      changelog_md: changelog ?? '',
    });
    return true;
  } catch {
    return false;
  }
}

// Fetch a UTF-8 text file from the repo (default branch) via the contents API, decoded and size-capped.
// Returns undefined when the file is absent (so the page omits that panel). Best-effort; never throws.
export async function fetchRepoText(env: Env, account: string, path: string, maxBytes = 24_000): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  // raw.githubusercontent.com first: no REST rate limit, and it serves the default branch's HEAD.
  try {
    const raw = env.GITHUB_RAW_BASE ?? 'https://raw.githubusercontent.com';
    const r = await fetch(`${raw}/${account}/HEAD/${path}`, { headers: { 'user-agent': 'open-autonomy-funding' } });
    if (r.ok) return (await r.text()).slice(0, maxBytes);
    if (r.status === 404) return undefined;
    console.warn(`github-sync: raw ${account}/${path} ${r.status}; falling back to the contents API`);
  } catch {
    /* fall through to the contents API */
  }
  try {
    const res = await fetch(`${base}/repos/${account}/contents/${path}`, {
      headers: ghHeaders(env),
    });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; encoding?: string };
    if (!j.content || j.encoding !== 'base64') return undefined;
    const bin = atob(j.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).slice(0, maxBytes);
  } catch {
    return undefined;
  }
}

// Roll up each roadmap item's child issues in ONE API call → {id → {total, done, issues[]}}. Tracking issues
// all carry `origin:roadmap-planner` and the parent link label `roadmap:<id>` (1 item → many issues). We bucket
// every `roadmap:*` label seen; the page looks up by item id, so unrelated labels (e.g. a phase label) just
// never match. This is the two-layer roadmap's execution source — no status is stored in roadmap.yml: the
// counts derive item state and the per-issue list lets the panel expand an item into its actual child issues.
// We keep a bounded slice of issues per item (open first, so the actionable work shows); `total`/`done` still
// reflect the FULL count, and the panel links to GitHub for the rest. Best-effort: undefined on any failure.
const ROADMAP_ISSUES_PER_ITEM = 8;

// Find the first non-badge image referenced in the repo's README and resolve it to an absolute URL.
async function firstReadmeImage(env: Env, account: string): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}/readme`, {
      headers: ghHeaders(env),
    });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; encoding?: string; download_url?: string };
    if (!j.content) return undefined;
    const bin = atob(j.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const md = new TextDecoder().decode(bytes);
    const found = extractFirstImage(md);
    return found ? resolveImageUrl(found, j.download_url) : undefined;
  } catch {
    return undefined;
  }
}

// Skip badges / status shields — they're images but make terrible cover banners.
function isBadge(url: string): boolean {
  return /shields\.io|badgen|img\.shields|\/badge|badge\.|\/workflows\/|actions\/workflow|coveralls|codecov|circleci|travis-ci|app\.netlify\.com\/.*\/deploys|herokucdn|gitpod|opencollective\.com\/.*\/badge|data:/i.test(url);
}

function extractFirstImage(md: string): string | undefined {
  const candidates: Array<[number, string]> = [];
  const mdImg = /!\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const htmlImg = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(md)) !== null) candidates.push([m.index, m[1]]);
  while ((m = htmlImg.exec(md)) !== null) candidates.push([m.index, m[1]]);
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [, url] of candidates) if (!isBadge(url)) return url;
  return undefined;
}

function resolveImageUrl(url: string, readmeDownloadUrl?: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (!readmeDownloadUrl) return undefined;
  try {
    // readmeDownloadUrl is the raw README URL (…/{branch}/README.md); relative paths resolve against it.
    return new URL(url, readmeDownloadUrl).toString();
  } catch {
    return undefined;
  }
}

// Cron: refresh every known public project's metadata.
export async function syncAllStale(env: Env): Promise<number> {
  const { entries } = await new LimitLedgerClient(env.LIMITS).directory();
  let synced = 0;
  for (const e of entries) {
    if (e.is_project && isStale(e.profile.synced_at)) {
      if (await syncProfile(env, e.account)) synced += 1;
    }
  }
  return synced;
}
