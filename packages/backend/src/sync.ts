import { fromMilestones, parseRoadmapConfig, type Milestone } from '@open-autonomy/sdk/drivers';
import { LedgerClient, type LiveDeployment } from './ledger.js';
import type { Env } from './types.js';

// The sync: what a project's page takes from its repository — its metadata (tagline, avatar, homepage), a
// cover from the README, and the owner's `.open-autonomy/config.yaml` (the bounds the platform enforces, which
// must come from the repository and not from a key). Everything else a page shows arrives through the SDK.
// Unauthenticated reads: only public repos sync, which is exactly the gate for appearing on the public site.
// Best-effort, never throws.

const STALE_MS = 10 * 60 * 1000;


interface GitHubRepo {
  description?: string | null;
  homepage?: string | null;
  html_url?: string;
  private?: boolean;
  owner?: { avatar_url?: string };
  default_branch?: string;
}

const shortSha = (value: unknown): string | undefined => typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value) ? value.slice(0, 7).toLowerCase() : undefined;

// `live` is one owner-controlled top-level URL. Keep this parser deliberately narrower than YAML rather than
// accepting an indented rail or publish value by accident.
export function parseLiveAddress(config: string): string | undefined {
  const line = config.split('\n').find((candidate) => /^live\s*:/.test(candidate));
  if (!line) return undefined;
  const value = line.slice(line.indexOf(':') + 1).replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : undefined; } catch { return undefined; }
}

async function liveDeployment(env: Env, account: string, repo: GitHubRepo | undefined, address: string): Promise<LiveDeployment> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  const branch = repo?.default_branch ?? 'main';
  const headResponse = await fetch(`${base}/repos/${account}/commits/${encodeURIComponent(branch)}`, { headers: ghHeaders(env) }).catch(() => undefined);
  const headBody = headResponse?.ok ? await headResponse.json().catch(() => ({})) as GitHubCommit : {};
  const head = shortSha(headBody.sha) ?? null;
  let commit: string | undefined;
  for (const path of ['/api', '/healthz']) {
    try {
      const response = await fetch(`${address}${path}`, { headers: { accept: 'application/json', 'user-agent': 'open-autonomy' }, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) continue;
      const body = await response.json().catch(() => ({})) as { commit?: unknown; version?: unknown };
      commit = shortSha(body.commit) ?? shortSha(body.version);
      if (commit) break;
    } catch { /* try the other conventional service endpoint */ }
  }
  if (!commit) return { commit: null, head, ahead: null };
  const comparison = await fetch(`${base}/repos/${account}/compare/${commit}...${headBody.sha ?? branch}`, { headers: ghHeaders(env) }).catch(() => undefined);
  const compared = comparison?.ok ? await comparison.json().catch(() => ({})) as { status?: string; ahead_by?: number } : {};
  // GitHub's answer is authoritative. The twin's deliberately sparse compare returns `identical` for two real
  // git-plane commits, so walk first parents only in that contradictory case; a missing ancestor stays unknown.
  const ahead = compared.status === 'ahead' && Number.isInteger(compared.ahead_by)
    ? compared.ahead_by!
    : compared.status === 'identical' && commit === head
      ? 0
      : compared.status === 'identical'
        ? await firstParentDistance(env, account, headBody, commit)
        : null;
  return { commit, head, ahead };
}

interface GitHubCommit { sha?: string; parents?: Array<{ sha?: string }> }

async function firstParentDistance(env: Env, account: string, head: GitHubCommit, ancestor: string): Promise<number | null> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  let current = head;
  for (let distance = 0; distance <= 100; distance++) {
    if (shortSha(current.sha) === ancestor) return distance;
    const parent = current.parents?.[0]?.sha;
    if (!parent) return null;
    const response = await fetch(`${base}/repos/${account}/commits/${parent}`, { headers: ghHeaders(env) }).catch(() => undefined);
    if (!response?.ok) return null;
    current = await response.json().catch(() => ({})) as GitHubCommit;
  }
  return null;
}

// What the deployment admits: the backend reads any repository it can, private ones through GITHUB_TOKEN. An app
// whose pages are public refuses private repositories at load (`configureSync`), so nothing private is served by it.
export interface SyncPolicy { privateRepositories: 'allow' | 'refuse' }
let sync: SyncPolicy = { privateRepositories: 'allow' };
export function configureSync(policy: Partial<SyncPolicy>): void { sync = { ...sync, ...policy }; }

export function isStale(syncedAt?: string): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  return !Number.isFinite(t) || Date.now() - t > STALE_MS;
}

function ghHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy' };
  if (env.GITHUB_TOKEN) h.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

export async function syncProfile(env: Env, account: string): Promise<boolean> {
  if (!account.includes('/')) return false; // named roots are funding nodes, not repositories
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}`, { headers: ghHeaders(env) });
    let repo: GitHubRepo | undefined;
    if (res.ok) {
      repo = await res.json() as GitHubRepo;
      if (repo.private && sync.privateRepositories === 'refuse') return false;
    } else if (res.status === 404) {
      return false;
    } else {
      console.warn(`sync: ${account} metadata ${res.status}; syncing the config only`);
    }
    const cover = repo ? (await firstReadmeImage(env, account)) ?? '' : undefined;
    const config = await fetchRepoText(env, account, '.open-autonomy/config.yaml', 8_000);
    const liveAddress = parseLiveAddress(config ?? '');
    const profile: Record<string, string | undefined> = {
      tagline: repo?.description ?? undefined,
      avatar_url: repo?.owner?.avatar_url ?? undefined,
      cover_url: cover,
      homepage: repo ? repo.homepage || repo.html_url || undefined : undefined,
      synced_at: new Date().toISOString(),
      config_yaml: config ?? '',
    };
    const ledger = new LedgerClient(env.LIMITS);
    await ledger.setProfile(account, profile);
    await ledger.setDeployment(account, liveAddress ? await liveDeployment(env, account, repo, liveAddress) : undefined);
    // The roadmap arrives through the SDK: a substrate narrates the file it works, an owner-side driver pushes
    // its own revisions. The one platform-pulled driver is GitHub milestones, a public tracker with no credential.
    const roadmapCfg = parseRoadmapConfig(config ?? '');
    if (roadmapCfg.source === 'github-milestones') {
      const milestones = await fetchMilestones(env, roadmapCfg.github?.repo ?? account);
      if (milestones) await ledger.roadmapSet(account, fromMilestones(milestones), 'github-milestones', 'sync');
    }
    return true;
  } catch {
    return false;
  }
}

// The milestones driver's pull: the repository's milestones, open and closed, through the public API.
export async function fetchMilestones(env: Env, repo: string): Promise<Milestone[] | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${repo}/milestones?state=all&per_page=100`, { headers: ghHeaders(env) });
    if (!res.ok) return undefined;
    const raw = await res.json() as Array<Record<string, unknown>>;
    return raw.filter((m) => typeof m.number === 'number' && typeof m.title === 'string').map((m) => ({ number: m.number as number, title: m.title as string, description: (m.description as string | null) ?? null, state: m.state === 'closed' ? 'closed' : 'open', due_on: (m.due_on as string | null) ?? null, created_at: typeof m.created_at === 'string' ? m.created_at : undefined }));
  } catch {
    return undefined;
  }
}

// A UTF-8 text file from the repository's default branch, size-capped; undefined when absent.
export async function fetchRepoText(env: Env, account: string, path: string, maxBytes = 24_000): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const raw = env.GITHUB_RAW_BASE ?? 'https://raw.githubusercontent.com';
    const r = await fetch(`${raw}/${account}/HEAD/${path}`, { headers: { 'user-agent': 'open-autonomy' } });
    if (r.ok) return (await r.text()).slice(0, maxBytes);
    if (r.status === 404) return undefined;
  } catch { /* fall through to the contents API */ }
  try {
    const res = await fetch(`${base}/repos/${account}/contents/${path}`, { headers: ghHeaders(env) });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; encoding?: string };
    if (!j.content || j.encoding !== 'base64') return undefined;
    const bin = atob(j.content.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))).slice(0, maxBytes);
  } catch {
    return undefined;
  }
}

// The first non-badge image in the README, as the page's cover.
async function firstReadmeImage(env: Env, account: string): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}/readme`, { headers: ghHeaders(env) });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; download_url?: string };
    if (!j.content) return undefined;
    const md = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
    const candidates: Array<[number, string]> = [];
    for (const m of md.matchAll(/!\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g)) candidates.push([m.index ?? 0, m[1]]);
    for (const m of md.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) candidates.push([m.index ?? 0, m[1]]);
    candidates.sort((a, b) => a[0] - b[0]);
    const isBadge = (url: string) => /shields\.io|badgen|img\.shields|\/badge|badge\.|\/workflows\/|actions\/workflow|coveralls|codecov|\.svg\?|data:/i.test(url) || /open-autonomy\.org\/v1\//.test(url);
    const found = candidates.map(([, u]) => u).find((u) => !isBadge(u));
    if (!found) return undefined;
    if (/^https?:\/\//i.test(found)) return found;
    if (found.startsWith('//')) return `https:${found}`;
    return j.download_url ? new URL(found, j.download_url).toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function syncAllStale(env: Env): Promise<number> {
  const { entries } = await new LedgerClient(env.LIMITS).directory();
  let synced = 0;
  for (const e of entries) if (e.is_project && isStale(e.profile.synced_at) && (await syncProfile(env, e.account))) synced += 1;
  return synced;
}
