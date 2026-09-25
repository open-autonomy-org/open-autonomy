#!/usr/bin/env bun
// The community desk's doors, from the shell: this repository's issues and discussions on GitHub, through the API
// the environment names — GITHUB_API_URL and GITHUB_TOKEN. In the running stack that is the valve's GitHub port and
// the word `valve`: the agent's own GitHub App answers, its key never here. Issues over REST; discussions over
// GraphQL, the only API GitHub serves them on.
//
//   bun .open-autonomy/community.ts poll                          # every issue, comment and discussion since the
//                                                                 # last look: NEW lines, then COMMUNITY_POLL_DONE
//   bun .open-autonomy/community.ts comment <issue> <text…>       # a comment on an issue
//   bun .open-autonomy/community.ts discuss <discussion> <text…>  # a comment on a discussion
//   bun .open-autonomy/community.ts mark                          # the last look is now
//   bun .open-autonomy/community.ts latest                        # the newest activity on GitHub, as stable bytes: the
//                                                                 # monitor job's source, so the agent wakes only on change
//   bun .open-autonomy/community.ts read 'pulls/12/reviews?per_page=100' # repository evidence through the agent's door
//   bun .open-autonomy/community.ts who <role> [scope]            # who an ask goes to: the role's current holders, the
//                                                                 # available now first; none is help-wanted (ADR 0013)
//   bun .open-autonomy/community.ts reach [days]                  # the week's numbers the scrum reads (ADR 0013)
//   bun .open-autonomy/community.ts help-wanted <key> <title> <body-file> # an ask no member holds, posted once
//
// The cursor lives in the agent's home ($HERMES_HOME/community-cursor.json), else beside the project.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEAM_SCOPES, currentMembers, membersFor, parseTeamConfig, type TeamScope } from './sdk/team.ts';

// Hermes removes credentials from terminal tools. Re-enter with only its configured
// GitHub door; values remain inside the child environment and are never printed.
if (!process.env.GITHUB_TOKEN && process.env.HERMES_HOME && !process.env.OA_COMMUNITY_DOOR_LOADED) {
  const script = `import os, sys
from hermes_cli.config import load_env
saved = load_env()
for name in ("GITHUB_TOKEN", "GITHUB_API_URL"):
    if saved.get(name): os.environ.setdefault(name, saved[name])
os.environ["OA_COMMUNITY_DOOR_LOADED"] = "1"
os.execvpe(sys.argv[1], sys.argv[1:], os.environ)`;
  const child = Bun.spawnSync({ cmd: ['python', '-c', script, process.execPath, ...process.argv.slice(1)], stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(child.exitCode);
}

const api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
const token = process.env.GITHUB_TOKEN ?? '';
// No GITHUB_TOKEN: the desk has no GitHub door (a github-app.json beside the keys gives it one through the valve). That
// is a fact, not a failure: a look finds nothing on GitHub and says so, and the channel alone is the desk's.
const doorless = !token;
const project = resolve(import.meta.dir, '..');
const account = /^account:\s*(\S+)/m.exec(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8'))?.[1] ?? '';
if (!account) throw new Error('community: .open-autonomy/config.yaml names no account');
const [owner, name] = account.split('/');
const [command, ...rest] = process.argv.slice(2);
const desk = (command === 'poll' || command === 'mark') ? (rest[0] ?? 'community') : 'community';
if (!['community', 'pm'].includes(desk)) throw new Error('cursor desk must be community or pm');
const cursorFile = resolve(process.env.HERMES_HOME ?? project, `${desk}-cursor.json`);
const pendingFile = `${cursorFile}.pending`;
if (command === 'poll') rmSync(pendingFile, { force: true });
const pollStarted = new Date().toISOString();
const cursor = (): string => (existsSync(cursorFile) ? (JSON.parse(readFileSync(cursorFile, 'utf8')) as { since: string }).since : '1970-01-01T00:00:00Z');
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' };
async function github<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${api}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}
async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${api}/graphql`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const out = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || out.errors?.length) throw new Error(`graphql → ${res.status} ${out.errors?.map((e) => e.message).join('; ') ?? ''}`);
  return out.data as T;
}
interface Page<T> { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
interface Reply { id: string; body: string; createdAt: string | null; updatedAt?: string; url?: string; author?: { login: string } }
interface Discussion { id: string; number: number; title: string; body: string; createdAt: string | null; updatedAt?: string; url?: string; author?: { login: string }; comments: Page<Reply> }
const replyFields = 'id body createdAt updatedAt url author { login }';
const pageFields = 'pageInfo { hasNextPage endCursor }';
async function discussions(): Promise<Discussion[]> {
  const all: Discussion[] = [];
  let next: string | null = null;
  do {
    const data: { repository: { discussions: Page<Discussion> } } = await graphql(
      `query($owner: String!, $name: String!, $after: String) { repository(owner: $owner, name: $name) { discussions(first: 50, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id number title body createdAt updatedAt url author { login } comments(first: 50) { nodes { ${replyFields} } ${pageFields} } } ${pageFields} } } }`,
      { owner, name, after: next });
    const page = data.repository.discussions;
    if (!page.pageInfo) throw new Error('GitHub discussions returned no pagination information');
    for (const d of page.nodes) {
      let comments = d.comments;
      if (!comments.pageInfo) throw new Error('GitHub discussion comments returned no pagination information');
      while (comments.pageInfo.hasNextPage) {
        const cursor = comments.pageInfo.endCursor;
        if (!cursor) throw new Error('GitHub discussion comments omitted the next cursor');
        const more: { repository: { discussion: { comments: Page<Reply> } } } = await graphql(
          `query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { discussion(number: $number) { comments(first: 50, after: $after) { nodes { ${replyFields} } ${pageFields} } } } }`,
          { owner, name, number: d.number, after: cursor });
        comments = more.repository.discussion.comments;
        if (comments.pageInfo.hasNextPage && comments.pageInfo.endCursor === cursor) throw new Error('GitHub discussion comment cursor did not advance');
        d.comments.nodes.push(...comments.nodes);
      }
      all.push(d);
    }
    const previous: string | null = next;
    next = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo.hasNextPage && (!next || next === previous)) throw new Error('GitHub discussion cursor did not advance');
  } while (next);
  return all;
}
const after = (at: string | null | undefined, since: string): boolean => !at || at >= since;
async function pages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const rows = await github<T[]>('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

if (command === 'poll' && doorless) {
  console.log(`NOTE no GitHub door (no GITHUB_TOKEN): issues and discussions are not read; the channel alone is the desk's`);
  console.log(`COMMUNITY_POLL_DONE since ${cursor()}`);
} else if (['comment', 'discuss', 'issue', 'pull-request', 'read', 'help-wanted'].includes(command) && doorless) {
  console.error('community: no GitHub door (no GITHUB_TOKEN) — this GitHub operation is unavailable');
  process.exit(3);
} else if (command === 'read') {
  if (rest.length !== 1 || !rest[0]) throw new Error('read requires one repository-relative API path, including pagination when needed');
  const base = new URL(`${api}/repos/${account}/`);
  const target = new URL(rest[0], base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.hash || target.username || target.password) throw new Error('read must stay within this repository');
  console.log(JSON.stringify(await github('GET', target.pathname.slice(new URL(api).pathname.replace(/\/$/, '').length) + target.search)));
} else if (command === 'pull-request' && /^land\/kit-\d+\.\d+\.\d+$/.test(rest[0] ?? '')) {
  // Landing-created PRs carry the branch in their title or their fixed body. The
  // issues endpoint includes PRs and uses the App's existing issues-read permission.
  let found: { number: number; url: string } | null = null;
  for (let page = 1; ; page++) {
    const issues = await github<Array<{ number: number; title: string; body?: string; html_url: string; pull_request?: { html_url?: string } }>>('GET', `/repos/${account}/issues?state=open&per_page=100&page=${page}`);
    const match = issues.find((i) => i.pull_request && (i.title === rest[0] || i.body?.includes(`Opened by the landing workflow for \`${rest[0]}\``)));
    if (match) found = { number: match.number, url: match.pull_request?.html_url ?? match.html_url };
    if (found || issues.length < 100) break;
  }
  console.log(JSON.stringify(found));
} else if (command === 'issue' && rest[0] === 'update' && /^\d+$/.test(rest[1] ?? '') && rest[2] && rest[3]) {
  if (!/^[a-z0-9_-]+$/i.test(rest[2])) throw new Error('issue update: invalid task id');
  console.log(JSON.stringify(await github('PATCH', `/repos/${account}/issues/${rest[1]}`, { body: `<!-- open-autonomy:blocked:${rest[2]} -->\n${rest[3]}` })));
} else if (command === 'issue' && rest[0] === 'open' && rest.length === 5) {
  const [, task, title, body, assignee] = rest;
  if (!/^[a-z0-9_-]+$/i.test(task!)) throw new Error('issue open: invalid task id');
  const marker = `<!-- open-autonomy:blocked:${task} -->`;
  // Reconcile against GitHub too: a crash after POST must not create a second issue.
  let existing: { number: number; body?: string } | undefined;
  for (let page = 1; ; page++) {
    const issues = await github<Array<{ number: number; body?: string; pull_request?: unknown }>>('GET', `/repos/${account}/issues?state=open&per_page=100&page=${page}`);
    existing = issues.find((i) => !i.pull_request && i.body?.includes(marker));
    if (existing || issues.length < 100) break;
  }
  const issue = existing ?? await github('POST', `/repos/${account}/issues`, { title, body: `${marker}\n${body}`, assignees: [assignee] });
  console.log(JSON.stringify(issue));
} else if (command === 'issue' && rest[0] === 'close' && /^\d+$/.test(rest[1] ?? '')) {
  console.log(JSON.stringify(await github('PATCH', `/repos/${account}/issues/${rest[1]}`, { state: 'closed' })));
} else if (command === 'issue' && rest[0] === 'remind' && /^\d+$/.test(rest[1] ?? '') && rest[2]) {
  console.log(JSON.stringify(await github('POST', `/repos/${account}/issues/${rest[1]}/comments`, { body: rest[2] })));
} else if (command === 'latest') {
  // The monitor job's source: when the newest issue, pull request or discussion last changed. Stable bytes between
  // arrivals, so the scheduler wakes the agent once per arrival and never for nothing. No cursor is touched.
  if (doorless) console.log('latest: no GitHub door');
  else {
    const [issue] = await github<Array<{ updated_at: string; number: number }>>('GET', `/repos/${account}/issues?state=all&sort=updated&direction=desc&per_page=1`);
    const d = await graphql<{ repository: { discussions: { nodes: Array<{ number: number; updatedAt: string }> } } }>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { number updatedAt } } } }`, { owner, name });
    const disc = d.repository?.discussions?.nodes?.[0];
    console.log(`latest issue ${issue ? `#${issue.number} ${issue.updated_at}` : 'none'}`);
    console.log(`latest discussion ${disc ? `#${disc.number} ${disc.updatedAt}` : 'none'}`);
  }
} else if (command === 'poll') {
  const since = cursor();
  // GitHub can return an empty page for the epoch sentinel. The first poll has
  // no lower bound; only send a since filter after a real poll was acknowledged.
  const sinceQuery = since === '1970-01-01T00:00:00Z' ? '' : `since=${encodeURIComponent(since)}`;
  type Issue = { number: number; title: string; body: string | null; state: string; html_url: string; updated_at: string; pull_request?: unknown; user?: { login?: string } };
  const issues = await pages<Issue>(`/repos/${account}/issues?state=all${sinceQuery ? `&${sinceQuery}` : ''}`);
  for (const i of issues) {
    console.log(`NEW ${i.pull_request ? 'pull request' : 'issue'} ${JSON.stringify(i)}`);
    const comments = await pages<{ body: string; html_url: string; created_at: string; updated_at: string; user?: { login?: string } }>(`/repos/${account}/issues/${i.number}/comments${sinceQuery ? `?${sinceQuery}` : ''}`);
    for (const c of comments) if (after(c.updated_at ?? c.created_at, since)) console.log(`NEW comment on #${i.number} ${JSON.stringify(c)}`);
  }
  for (const d of await discussions()) {
    if (after(d.updatedAt ?? d.createdAt, since)) console.log(`NEW discussion ${JSON.stringify(d)}`);
    else for (const c of d.comments.nodes) if (after(c.updatedAt ?? c.createdAt, since)) console.log(`NEW reply on discussion #${d.number} ${JSON.stringify(c)}`);
  }
  // Acknowledge the beginning of the successful poll, not the later mark time:
  // arrivals while the agent reads and replies must remain visible next time.
  writeFileSync(pendingFile, `${JSON.stringify({ since: pollStarted })}\n`);
  console.log(`COMMUNITY_POLL_DONE desk ${desk} since ${since}`);
} else if (command === 'comment' && rest.length >= 2) {
  const n = Number(rest[0]);
  const c = await github<{ id: number }>('POST', `/repos/${account}/issues/${n}/comments`, { body: rest.slice(1).join(' ') });
  console.log(`commented on #${n} (${c.id})`);
} else if (command === 'review' && /^\d+$/.test(rest[0] ?? '') && ['approve', 'request-changes'].includes(rest[1] ?? '') && /^[0-9a-f]{40}$/.test(rest[2] ?? '') && rest.length >= 4) {
  // The reviewer's verdict on a pull request, as the project's own App: the merge gate GitHub enforces. The commit is
  // the exact head reviewed, so a later push cannot inherit the approval.
  const n = Number(rest[0]);
  const r = await github<{ id: number; state: string }>('POST', `/repos/${account}/pulls/${n}/reviews`, { event: rest[1] === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES', commit_id: rest[2], body: rest.slice(3).join(' ') });
  console.log(`reviewed #${n} at ${rest[2].slice(0, 8)}: ${r.state} (${r.id})`);
} else if (command === 'discuss' && rest.length >= 2) {
  const n = Number(rest[0]);
  const d = (await discussions()).find((x) => x.number === n);
  if (!d) throw new Error(`no discussion #${n}`);
  const out = await graphql<{ addDiscussionComment: { comment: { id: string } } }>(`mutation($discussionId: ID!, $body: String!) { addDiscussionComment(input: { discussionId: $discussionId, body: $body }) { comment { id } } }`, { discussionId: d.id, body: rest.slice(1).join(' ') });
  console.log(`replied on discussion #${n} (${out.addDiscussionComment.comment.id})`);
} else if (command === 'discussion-new' && rest.length >= 3) {
  // A new discussion in one of this repository's categories, as the project's own App: the organization skew's
  // memo, or any post a skill makes on its own repository. The body comes from a file, never an argument.
  const [slug, title, file] = rest;
  if (!/^[a-z0-9-]+$/.test(slug) || !existsSync(file)) throw new Error('discussion-new <category-slug> <title> <body-file>');
  const r = await graphql<{ repository: { id: string; discussionCategories: { nodes: Array<{ id: string; slug: string }> } } }>(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id discussionCategories(first: 25) { nodes { id slug } } } }`, { owner, name });
  const category = r.repository.discussionCategories.nodes.find((c) => c.slug === slug);
  if (!category) throw new Error(`no discussion category ${slug} on ${account} (have: ${r.repository.discussionCategories.nodes.map((c) => c.slug).join(', ')})`);
  const out = await graphql<{ createDiscussion: { discussion: { number: number; url: string } } }>(`mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) { createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) { discussion { number url } } }`, { repositoryId: r.repository.id, categoryId: category.id, title, body: readFileSync(file, 'utf8') });
  console.log(`discussion #${out.createDiscussion.discussion.number}: ${out.createDiscussion.discussion.url}`);
} else if (command === 'who' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(rest[0] ?? '') && (!rest[1] || /^[a-z-]+$/.test(rest[1]))) {
  // Who an ask goes to (ADR 0013): the current holders of a role, those within one of their windows now first; with a
  // scope, only holders of that authority, since a role is work, not authority. No one: the ask is help-wanted, posted
  // where members and users see it, and never goes to the owner by default.
  if (rest[1] && !(TEAM_SCOPES as readonly string[]).includes(rest[1])) throw new Error(`who: scope is one of ${TEAM_SCOPES.join(', ')}`);
  const team = parseTeamConfig(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8'));
  const found = membersFor(team, rest[0]!, new Date(), rest[1] as TeamScope | undefined);
  const card = (m: (typeof found.available)[number]) => ({ id: m.id, name: m.name, github: m.github?.login ?? null, discord: m.discord?.name ?? null, availability: m.availability ?? null });
  console.log(JSON.stringify({ role: rest[0], scope: rest[1] ?? null, available: found.available.map(card), later: found.later.map(card), help_wanted: !found.available.length && !found.later.length }));
} else if (command === 'help-wanted' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(rest[0] ?? '') && rest[1] && rest[2]) {
  // An ask no current member's role covers (ADR 0013), posted where members and users see it, prepared so it costs its
  // taker one decision. Once per key: a rerun finds the open issue rather than posting a second.
  const [key, title, file] = rest;
  if (!existsSync(file!)) throw new Error('help-wanted <key> <title> <body-file>: the body comes from a file');
  const marker = `<!-- open-autonomy:help-wanted:${key} -->`;
  let existing: { number: number; html_url: string } | undefined;
  for (let page = 1; ; page++) {
    const issues = await github<Array<{ number: number; html_url: string; body?: string; pull_request?: unknown }>>('GET', `/repos/${account}/issues?state=open&per_page=100&page=${page}`);
    existing = issues.find((i) => !i.pull_request && i.body?.includes(marker));
    if (existing || issues.length < 100) break;
  }
  const issue = existing ?? await github<{ number: number; html_url: string }>('POST', `/repos/${account}/issues`, { title, body: `${marker}\n${readFileSync(file!, 'utf8')}`, labels: ['help wanted'] });
  console.log(`${existing ? 'already posted' : 'posted'}: #${issue.number} ${issue.html_url}`);
} else if (command === 'reach' && (!rest[0] || /^[1-9]\d{0,2}$/.test(rest[0]))) {
  // The numbers the scrum reads beside the board (ADR 0013), each from where it is kept. A count no door reaches is
  // reported unavailable with the reason, never estimated.
  const days = Number(rest[0] ?? 7);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const config = readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8');
  const team = parseTeamConfig(config);
  const current = currentMembers(team);
  const rosterLogins = new Set(current.flatMap((m) => (m.github ? [m.github.login.toLowerCase()] : [])));
  const unavailable = (why: string) => ({ unavailable: why });
  const out: Record<string, unknown> = { account, window_days: days, since, at: new Date().toISOString() };
  if (doorless) out.github = unavailable('no GitHub door (no GITHUB_TOKEN)');
  else try {
    const repo = await github<{ stargazers_count: number; forks_count: number; subscribers_count: number }>('GET', `/repos/${account}`);
    const releases = await pages<{ tag_name: string; published_at: string | null; draft: boolean; assets: Array<{ download_count: number }> }>(`/repos/${account}/releases`);
    const published = releases.filter((r) => !r.draft);
    const issues = await pages<{ user?: { login: string; type?: string }; created_at: string; pull_request?: unknown }>(`/repos/${account}/issues?state=all&since=${since}`);
    const people = new Set<string>();
    const outside = (login?: string, type?: string) => { if (login && type !== 'Bot' && !login.endsWith('[bot]') && !rosterLogins.has(login.toLowerCase())) people.add(login); };
    for (const i of issues) if (i.created_at >= since) outside(i.user?.login, i.user?.type);
    for (const d of await discussions()) {
      if (after(d.createdAt, since) && d.createdAt) outside(d.author?.login);
      for (const c of d.comments.nodes) if (c.createdAt && c.createdAt >= since) outside(c.author?.login);
    }
    out.github = {
      stars: repo.stargazers_count, forks: repo.forks_count, watchers: repo.subscribers_count,
      releases: published.length, latest_release: published[0] ? { tag: published[0].tag_name, published_at: published[0].published_at } : null,
      release_downloads: published.reduce((n, r) => n + r.assets.reduce((m, a) => m + a.download_count, 0), 0),
      // everyone outside the team who opened or replied in the window; whether it was their first time is not read
      outside_authors_in_window: [...people].sort(),
      traffic: unavailable('GitHub traffic (views, clones, referrers) needs the Administration permission, which the kit does not grant its App'),
    };
  } catch (e) { out.github = unavailable((e as Error).message); }
  // The books: public wherever the owner's word opens them. Money the project holds, burns and has left.
  const platform = /^platform:\s*(\S+)/m.exec(config)?.[1]?.replace(/\/$/, '');
  try {
    if (!platform) throw new Error('config.yaml names no platform');
    const res = await fetch(`${platform}/v1/accounts/${encodeURIComponent(account)}`);
    if (!res.ok) throw new Error(`the books answered ${res.status}`);
    const b = (await res.json()) as { balance_usd_cents?: number; burn_per_day_usd_cents?: number; runway_days?: number | null; granted_in_usd_cents?: number };
    out.books = { balance_usd_cents: b.balance_usd_cents ?? null, burn_per_day_usd_cents: b.burn_per_day_usd_cents ?? null, runway_days: b.runway_days ?? null, granted_in_usd_cents: b.granted_in_usd_cents ?? null };
  } catch (e) { out.books = unavailable((e as Error).message); }
  // The backers: the patrons wall as the page shows it (the platform's patronage door). Its money comes only where the
  // books are open; the share of the metered burn they cover is computed only from two figures both present.
  try {
    if (!platform) throw new Error('config.yaml names no platform');
    const res = await fetch(`${platform}/v1/accounts/${encodeURIComponent(account)}/patronage`);
    if (res.status === 404) throw new Error('the platform has no patrons wall open to everyone for this project');
    if (!res.ok) throw new Error(`the patronage door answered ${res.status}`);
    const p = (await res.json()) as { patron_count: number; monthly_usd_cents?: number };
    const burn = (out.books as { burn_per_day_usd_cents?: number | null }).burn_per_day_usd_cents;
    out.backers = {
      patrons: p.patron_count,
      monthly_usd_cents: p.monthly_usd_cents ?? unavailable('the books are not open to everyone'),
      covers_metered_burn: typeof p.monthly_usd_cents === 'number' && typeof burn === 'number' && burn > 0 ? Math.round((p.monthly_usd_cents / (burn * 30)) * 100) / 100 : null,
    };
  } catch (e) { out.backers = unavailable((e as Error).message); }
  // The team: who is on it, what they give, and which roles have someone to ask.
  const roles: Record<string, { holders: number; with_windows: number }> = {};
  for (const m of current) for (const r of m.roles ?? []) { roles[r] ??= { holders: 0, with_windows: 0 }; roles[r].holders++; if (m.availability) roles[r].with_windows++; }
  out.team = {
    members: current.length, give_time: current.filter((m) => m.contributes?.includes('time')).length,
    give_machine: current.filter((m) => m.contributes?.includes('machine')).length,
    joined: current.filter((m) => m.joined && m.joined >= since.slice(0, 10)).map((m) => m.id),
    left: team.members.filter((m) => m.left && m.left >= since.slice(0, 10)).map((m) => m.id),
    roles,
  };
  console.log(JSON.stringify(out, null, 2));
} else if (command === 'mark') {
  if (!existsSync(pendingFile)) throw new Error('mark requires a successful poll for this desk');
  writeFileSync(cursorFile, readFileSync(pendingFile, 'utf8'));
  rmSync(pendingFile);
  console.log(`marked: the last look is now (${cursorFile})`);
} else {
  console.error('usage: community poll [pm] | read <repository-relative-api-path> | who <role> [scope] | reach [days] | help-wanted <key> <title> <body-file> | comment <issue> <text…> | review <pr> approve|request-changes <full-sha> <text…> | discuss <discussion> <text…> | discussion-new <category-slug> <title> <body-file> | mark [pm] | pull-request <kit-branch> | issue open <task> <title> <body> <owner> | issue close <number> | issue remind <number> <body> | issue update <number> <task> <body>');
  process.exit(2);
}
