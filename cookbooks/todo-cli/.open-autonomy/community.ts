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
//   bun .open-autonomy/community.ts read 'pulls/12/reviews?per_page=100' # repository evidence through the agent's door
//
// The cursor lives in the agent's home ($HERMES_HOME/community-cursor.json), else beside the project.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
} else if (['comment', 'discuss', 'issue', 'pull-request', 'read'].includes(command) && doorless) {
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
} else if (command === 'poll') {
  const since = cursor();
  type Issue = { number: number; title: string; body: string | null; state: string; html_url: string; updated_at: string; pull_request?: unknown; user?: { login?: string } };
  const issues = await pages<Issue>(`/repos/${account}/issues?state=all&since=${encodeURIComponent(since)}`);
  for (const i of issues) {
    console.log(`NEW ${i.pull_request ? 'pull request' : 'issue'} ${JSON.stringify(i)}`);
    const comments = await pages<{ body: string; html_url: string; created_at: string; updated_at: string; user?: { login?: string } }>(`/repos/${account}/issues/${i.number}/comments?since=${encodeURIComponent(since)}`);
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
} else if (command === 'discuss' && rest.length >= 2) {
  const n = Number(rest[0]);
  const d = (await discussions()).find((x) => x.number === n);
  if (!d) throw new Error(`no discussion #${n}`);
  const out = await graphql<{ addDiscussionComment: { comment: { id: string } } }>(`mutation($discussionId: ID!, $body: String!) { addDiscussionComment(input: { discussionId: $discussionId, body: $body }) { comment { id } } }`, { discussionId: d.id, body: rest.slice(1).join(' ') });
  console.log(`replied on discussion #${n} (${out.addDiscussionComment.comment.id})`);
} else if (command === 'mark') {
  if (!existsSync(pendingFile)) throw new Error('mark requires a successful poll for this desk');
  writeFileSync(cursorFile, readFileSync(pendingFile, 'utf8'));
  rmSync(pendingFile);
  console.log(`marked: the last look is now (${cursorFile})`);
} else {
  console.error('usage: community poll [pm] | read <repository-relative-api-path> | comment <issue> <text…> | discuss <discussion> <text…> | mark [pm] | pull-request <kit-branch> | issue open <task> <title> <body> <owner> | issue close <number> | issue remind <number> <body> | issue update <number> <task> <body>');
  process.exit(2);
}
