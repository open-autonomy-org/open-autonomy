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
//
// The cursor lives in the agent's home ($HERMES_HOME/community-cursor.json), else beside the project.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
const token = process.env.GITHUB_TOKEN ?? '';
// No GITHUB_TOKEN: the desk has no GitHub door (a github-app.json beside the keys gives it one through the valve). That
// is a fact, not a failure: a look finds nothing on GitHub and says so, and the channel alone is the desk's.
const doorless = !token;
const project = resolve(import.meta.dir, '..');
const account = /^account:\s*(\S+)/m.exec(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8'))?.[1] ?? '';
if (!account) throw new Error('community: .open-autonomy/config.yaml names no account');
const [owner, name] = account.split('/');
const cursorFile = resolve(process.env.HERMES_HOME ?? project, process.env.HERMES_HOME ? 'community-cursor.json' : '.community-cursor.json');
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
interface Discussion { id: string; number: number; title: string; body: string; createdAt: string | null; category: { name: string } | null; comments: { nodes: Array<{ id: string; body: string; createdAt: string | null }> } }
const discussions = () => graphql<{ repository: { discussions: { nodes: Discussion[] } } }>(
  `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 50) { nodes { id number title body createdAt category { name } comments(first: 50) { nodes { id body createdAt } } } } } }`,
  { owner, name },
).then((d) => d.repository.discussions.nodes);
const after = (at: string | null | undefined, since: string): boolean => !at || at > since;
const firstLine = (s: string): string => (s ?? '').split('\n')[0]!.slice(0, 120);

const [command, ...rest] = process.argv.slice(2);
if (command === 'poll' && doorless) {
  console.log(`NOTE no GitHub door (no GITHUB_TOKEN): issues and discussions are not read; the channel alone is the desk's`);
  console.log(`COMMUNITY_POLL_DONE since ${cursor()}`);
} else if ((command === 'comment' || command === 'discuss') && doorless) {
  console.error('community: no GitHub door (no GITHUB_TOKEN) — nothing can be posted on GitHub');
  process.exit(3);
} else if (command === 'poll') {
  const since = cursor();
  const issues = await github<Array<{ number: number; title: string; body: string | null; created_at: string; pull_request?: unknown; user?: { login?: string } }>>('GET', `/repos/${account}/issues?state=open&per_page=50&since=${encodeURIComponent(since)}`);
  for (const i of issues) if (!i.pull_request && after(i.created_at, since)) console.log(`NEW issue #${i.number} ${JSON.stringify(i.title)} by ${i.user?.login ?? 'someone'}: ${firstLine(i.body ?? '')}`);
  for (const i of issues) {
    if (i.pull_request) continue;
    const comments = await github<Array<{ body: string; created_at: string; user?: { login?: string } }>>('GET', `/repos/${account}/issues/${i.number}/comments?per_page=50&since=${encodeURIComponent(since)}`);
    for (const c of comments) if (after(c.created_at, since)) console.log(`NEW comment on #${i.number} by ${c.user?.login ?? 'someone'}: ${firstLine(c.body)}`);
  }
  for (const d of await discussions()) {
    if (after(d.createdAt, since)) console.log(`NEW discussion #${d.number} ${JSON.stringify(d.title)} (${d.category?.name ?? 'general'}): ${firstLine(d.body)}`);
    for (const c of d.comments.nodes) if (after(c.createdAt, since)) console.log(`NEW reply on discussion #${d.number}: ${firstLine(c.body)}`);
  }
  console.log(`COMMUNITY_POLL_DONE since ${since}`);
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
  writeFileSync(cursorFile, `${JSON.stringify({ since: new Date().toISOString() })}\n`);
  console.log(`marked: the last look is now (${cursorFile})`);
} else {
  console.error('usage: community poll | comment <issue> <text…> | discuss <discussion> <text…> | mark');
  process.exit(2);
}
