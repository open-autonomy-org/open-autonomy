import { fromMilestones, parseRoadmapConfig, type Milestone } from '@open-autonomy/sdk/drivers';
import { parseRoadmap } from '@open-autonomy/sdk/roadmap';
import { LedgerClient } from './ledger.js';
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
}

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
      if (repo.private) return false;
    } else if (res.status === 404) {
      return false;
    } else {
      console.warn(`sync: ${account} metadata ${res.status}; syncing the config only`);
    }
    const cover = repo ? (await firstReadmeImage(env, account)) ?? '' : undefined;
    const config = await fetchRepoText(env, account, '.open-autonomy/config.yaml', 8_000);
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
