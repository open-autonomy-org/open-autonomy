#!/usr/bin/env bun
// The roadmap's owner-side driver tool. The agent stays tracker-blind: it works and narrates ROADMAP.yml.
// When the project's roadmap lives in a tracker (`roadmap.source` in config.yaml), this tool keeps the file
// and the tracker in step, with the owner's credential, which never enters the agent's reach.
//
//   bun .open-autonomy/roadmap.ts pull        # the tracker → ROADMAP.yml (the file the agent works)
//   bun .open-autonomy/roadmap.ts push        # the tracker → the platform, as a revision (jira: the only way
//                                             #   the platform learns a Jira roadmap; needs a steer key)
//   bun .open-autonomy/roadmap.ts reconcile   # ROADMAP.yml → the tracker: items the agent marked done close
//                                             #   their milestone / transition their epic
//
// Credentials, from the environment: GITHUB_TOKEN (reconcile only; pull is public), JIRA_EMAIL + JIRA_TOKEN,
// OPEN_AUTONOMY_STEER_KEY (push). `file` source needs none of this: the platform pulls the file itself.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAutonomy } from './sdk/client.ts';
import { CONFORMANCE, fromJira, fromMilestones, jiraChanges, milestoneChanges, parseRoadmapConfig, type JiraEpic, type Milestone } from './sdk/drivers.ts';
import { parseRoadmap, renderRoadmap, type Roadmap } from './sdk/roadmap.ts';

const here = import.meta.dir;
const root = resolve(here, '..');
const config = readFileSync(resolve(here, 'config.yaml'), 'utf8');
const account = /^account:\s*(\S+)/m.exec(config)?.[1] ?? '';
const platform = (process.env.OPEN_AUTONOMY_URL ?? /^platform:\s*(\S+)/m.exec(config)?.[1] ?? 'https://open-autonomy.org').replace(/\/$/, '');
const cfg = parseRoadmapConfig(config);
const file = resolve(root, cfg.path);
const verb = process.argv[2];
const need = (name: string): string => { const v = process.env[name]; if (!v) { console.error(`${name} is not set`); process.exit(2); } return v; };
const github = (process.env.GITHUB_API_BASE ?? 'https://api.github.com').replace(/\/$/, '');

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-roadmap', 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetch(`${github}${path}`, { ...init, headers });
}
async function milestones(): Promise<Milestone[]> {
  const res = await gh(`/repos/${cfg.github?.repo ?? account}/milestones?state=all&per_page=100`);
  if (!res.ok) { console.error(`milestones → ${res.status}`); process.exit(1); }
  return (await res.json()) as Milestone[];
}
async function jira(path: string, init: RequestInit = {}): Promise<Response> {
  const base = (cfg.jira?.base_url ?? need('JIRA_BASE_URL')).replace(/\/$/, '');
  const auth = btoa(`${need('JIRA_EMAIL')}:${need('JIRA_TOKEN')}`);
  return fetch(`${base}${path}`, { ...init, headers: { authorization: `Basic ${auth}`, accept: 'application/json', 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
}
// Epics of the project, ranked: Jira's own search, one page of 100.
async function epics(): Promise<JiraEpic[]> {
  const jql = cfg.jira?.jql ?? `project = ${cfg.jira?.project ?? need('JIRA_PROJECT')} AND issuetype = Epic ORDER BY Rank ASC`;
  const res = await jira(`/rest/api/3/search/jql`, { method: 'POST', body: JSON.stringify({ jql, maxResults: 100, fields: ['summary', 'description', 'status', 'priority'] }) });
  if (!res.ok) { console.error(`jira search → ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  const body = (await res.json()) as { issues: Array<{ key: string; fields: { summary: string; description?: unknown; status: { statusCategory: { key: string } }; priority?: { name?: string } | null } }> };
  return body.issues.map((i, rank) => ({ key: i.key, summary: i.fields.summary, description: plain(i.fields.description), statusCategory: i.fields.status.statusCategory.key, rank, priority: i.fields.priority?.name ?? null }));
}
// Atlassian document format → its text, paragraphs and bullets kept as lines.
function plain(doc: unknown): string {
  if (typeof doc === 'string') return doc;
  if (!doc || typeof doc !== 'object') return '';
  const walk = (n: any): string => {
    if (!n) return '';
    if (n.type === 'text') return String(n.text ?? '');
    const inner = (n.content ?? []).map(walk).join('');
    if (n.type === 'listItem') return `- ${inner.trim()}\n`;
    if (n.type === 'paragraph' || n.type === 'heading') return `${inner}\n\n`;
    return inner;
  };
  return walk(doc).trim();
}

async function pulled(): Promise<Roadmap> {
  if (cfg.source === 'github-milestones') return fromMilestones(await milestones());
  if (cfg.source === 'jira') return fromJira(await epics());
  return parseRoadmap(readFileSync(file, 'utf8'));
}

if (verb === 'pull') {
  if (cfg.source === 'file') { console.log(`roadmap: source is the file itself (${cfg.path}); nothing to pull`); process.exit(0); }
  const r = await pulled();
  const header = `The roadmap the agent works, top to bottom, in phase order — a mirror of ${cfg.source}, written by\n\`bun .open-autonomy/roadmap.ts pull\`. The agent updates \`status\` as it finishes an item; \`reconcile\` carries that\nback to the tracker. What ${cfg.source} cannot say: ${CONFORMANCE[cfg.source].join('; ') || 'nothing'}.`;
  writeFileSync(file, renderRoadmap(r, header));
  console.log(`roadmap: ${r.items.length} item(s) from ${cfg.source} → ${cfg.path}`);
} else if (verb === 'push') {
  const r = await pulled();
  const oa = new OpenAutonomy({ baseUrl: `${platform}/v1`, key: need('OPEN_AUTONOMY_STEER_KEY') });
  const out = await oa.pushRoadmap(r, cfg.source, process.env.USER);
  if (!out.ok) { console.error(`push → ${out.status} ${out.error ?? ''}`); process.exit(1); }
  console.log(out.unchanged ? `roadmap: the platform already holds this revision (${out.revision?.revision})` : `roadmap: revision ${out.revision?.revision} on the platform (${out.revision?.changes.length} change(s))`);
} else if (verb === 'reconcile') {
  if (!existsSync(file)) { console.error(`${cfg.path} is missing`); process.exit(1); }
  const r = parseRoadmap(readFileSync(file, 'utf8'));
  if (cfg.source === 'github-milestones') {
    const changes = milestoneChanges(r, await milestones());
    for (const c of changes) {
      const res = await gh(`/repos/${cfg.github?.repo ?? account}/milestones/${c.number}`, { method: 'PATCH', body: JSON.stringify({ state: c.state }) });
      console.log(`milestone #${c.number} ${c.title} → ${c.state}${res.ok ? '' : ` FAILED (${res.status})`}`);
    }
    if (!changes.length) console.log('roadmap: the milestones already match');
  } else if (cfg.source === 'jira') {
    const changes = jiraChanges(r, await epics());
    for (const c of changes) {
      const transitions = (await (await jira(`/rest/api/3/issue/${c.key}/transitions`)).json()) as { transitions: Array<{ id: string; name: string; to: { statusCategory: { key: string } } }> };
      const want = c.to === 'done' ? 'done' : 'indeterminate';
      const t = transitions.transitions.find((x) => (cfg.jira?.done_transition && c.to === 'done' ? x.name === cfg.jira.done_transition : x.to.statusCategory.key === want));
      if (!t) { console.log(`${c.key}: no transition to ${c.to}`); continue; }
      const res = await jira(`/rest/api/3/issue/${c.key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: t.id } }) });
      console.log(`${c.key} → ${t.name}${res.ok ? '' : ` FAILED (${res.status})`}`);
    }
    if (!changes.length) console.log('roadmap: the epics already match');
  } else {
    console.log(`roadmap: source is the file itself (${cfg.path}); nothing to reconcile`);
  }
} else {
  console.error('usage: bun .open-autonomy/roadmap.ts pull | push | reconcile');
  process.exit(2);
}
