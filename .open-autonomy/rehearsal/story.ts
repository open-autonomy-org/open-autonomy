#!/usr/bin/env bun
// A story, driven through the world one line at a time: the client's acts on the twins, the brain's monitors ticked
// after each act, and polled conditions with a budget sized for a scripted brain (seconds, not a quarter hour). A
// story is JSONL, one act or wait per line:
//   {"github":"issue"|"comment"|"pr"|"review"|"merge", "key":…, "title":…, "body":…, "state":"APPROVE"|"REQUEST_CHANGES", "login":…}
//   {"jira":"ticket"|"assign"|"comment"|"move", "key":…, "summary":…, "criteria":[…], "text":…, "status":…, "alias":"T1"}
//   {"say":"text", "channel":"discord"|"slack"}          a person speaks in the brain's channel on the twin
//   {"clock":"3d"}                                       the world clock advances (every twin stamps from it)
//   {"job":"pm"}                                         one of the brain's jobs runs now, by name
//   {"act":"<name>", …}                                  the project's own act (rehearsal/hooks.ts acts)
//   {"until":{…}, "budget":90}   {"expect":{…}}         a polled condition; an expectation checked once
// Conditions: {"key":…, "status":"…"} (the tracker's status), {"comment":"substring"} (a client-visible comment),
// {"pr":"draft"|"ready"|"merged"}, {"board":{"title":"substring","status":"done"}} (the brain's board),
// {"channel":"substring"} (the brain's channel on the twin), and the project's own (hooks conditions).
// An alias set on a `ticket`/`issue` act names the key the twin minted, from then on ("key":"T1").
// A vendor's own API is the only door; nothing here reads a twin's files. Report at the end; exit = failures.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, REHEARSAL, STACK, api, context, hooks, twinCli, sh } from './lib.ts';

const file = process.argv[2];
if (!file) { console.error('usage: story.ts <story.jsonl>'); process.exit(2); }
const ctx = context((m) => say(m));
const world = ctx.world;
const h = await hooks();
const t0 = Date.now();
const say = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`);
const aliases: Record<string, string> = {};
const gh = world.GITHUB_TWIN_URL ? api(world.GITHUB_TWIN_URL, { authorization: 'Bearer twin:client' }) : undefined;
const jiraAuth = { authorization: `Basic ${Buffer.from(`${process.env.REHEARSAL_CLIENT ?? 'client@example.test'}:twin`).toString('base64')}` };
const jira = world.JIRA_TWIN_URL ? api(world.JIRA_TWIN_URL, jiraAuth) : undefined;
const branchOf = (key: string): string => (process.env.REHEARSAL_BRANCH_PREFIX ?? 'agent') + '/' + key;
const clientRepo = process.env.REHEARSAL_CLIENT_REPO ?? ACCOUNT;

// The brain's monitors run now, so the story never waits on a wall-clock schedule; a monitor whose listing did not
// change suppresses its own run, so a tick costs nothing when nothing moved.
const hermes = (...args: string[]) => sh(['bun', resolve(import.meta.dir, 'stack.ts'), 'hermes', ...args], { quiet: true, check: false });
function jobs(): Array<{ id: string; name: string; monitor_script?: string; monitor_url?: string }> {
  try { const d = JSON.parse(readFileSync(resolve(STACK, 'home', 'cron', 'jobs.json'), 'utf8')); return (Array.isArray(d) ? d : d.jobs) ?? []; } catch { return []; }
}
function tick(): void {
  const all = jobs();
  const names = h.ticks ?? all.filter((j) => j.monitor_script || j.monitor_url).map((j) => j.name);
  for (const j of all) if (names.includes(j.name)) hermes('cron', 'run', '--accept-hooks', j.id);
}
async function twinCall(vendor: 'github' | 'jira', line: Record<string, any>): Promise<void> {
  if (vendor === 'github') {
    if (!gh) throw new Error('no GitHub twin in this world');
    const repo = String(line.repo ?? clientRepo); const key = String(line.key ?? '');
    const prOf = async () => ((await gh.get(`/repos/${repo}/pulls?state=all&head=${repo.split('/')[0]}:${branchOf(key)}&per_page=1`)).body?.[0]);
    switch (line.github) {
      case 'issue': { const r = await gh.post(`/repos/${repo}/issues`, { title: line.title, body: line.body ?? '' }); if (line.alias) aliases[line.alias] = String(r.body?.number); say(`  issue #${r.body?.number}`); return; }
      case 'comment': { await gh.post(`/repos/${repo}/issues/${key}/comments`, { body: line.text ?? line.body }); return; }
      case 'pr': { const existing = await prOf(); if (existing) { say(`  pr #${existing.number} (exists)`); return; }
        const sha = new Bun.CryptoHasher('sha1').update(`${key}${Date.now()}`).digest('hex');
        await gh.post(`/repos/${repo}/git/refs`, { ref: `refs/heads/${branchOf(key)}`, sha });
        const r = await gh.post(`/repos/${repo}/pulls`, { title: line.title ?? `${key}: the change`, head: branchOf(key), base: line.base ?? 'main', draft: line.draft ?? true, body: line.body ?? 'Opened by the story.' });
        say(`  pr #${r.body?.number} ${r.body?.html_url ?? ''}`); return; }
      case 'review': { const pr = await prOf(); if (!pr) throw new Error(`no pull request for ${key}`); const head = (await gh.get(`/repos/${repo}/pulls/${pr.number}`)).body?.head?.sha;
        const login = String(line.login ?? 'reviewer'); const r = await gh.post(`/repos/${repo}/pulls/${pr.number}/reviews`, { event: line.state ?? 'APPROVE', body: line.body ?? '', commit_id: head, user: { login, type: login.endsWith('[bot]') ? 'Bot' : 'User' } });
        say(`  review ${r.body?.state ?? r.status} by ${login}`); return; }
      case 'merge': { const pr = await prOf(); if (!pr) throw new Error(`no pull request for ${key}`); const r = await gh.put(`/repos/${repo}/pulls/${pr.number}/merge`, { merge_method: line.method ?? 'squash' }); say(`  merge #${pr.number} → ${r.status}`); return; }
    }
    throw new Error(`unknown github act ${line.github}`);
  }
  if (!jira) throw new Error('no Jira twin in this world');
  const key = String(line.key ?? '');
  switch (line.jira) {
    case 'ticket': { const desc = line.description ?? `Acceptance criteria:\n${(line.criteria ?? []).map((c: string) => `- ${c}`).join('\n')}`;
      const r = await jira.post('/rest/api/2/issue', { fields: { project: { key: line.project ?? process.env.REHEARSAL_JIRA_PROJECT ?? 'PROJ' }, issuetype: { name: line.type ?? 'Task' }, summary: line.summary, description: desc, ...(line.reporter ? { reporter: { accountId: line.reporter } } : {}) } });
      const k = r.body?.key; if (!k) throw new Error(`jira twin: create → ${r.status} ${r.text.slice(0, 200)}`); if (line.alias) aliases[line.alias] = k; say(`  ticket ${k}`); return; }
    case 'assign': { const r = await jira.put(`/rest/api/2/issue/${key}`, { fields: { assignee: { accountId: line.to ?? process.env.REHEARSAL_ASSIGNEE ?? 'twin:agent' }, status: { name: line.status ?? 'To Do' } } }); say(`  assign → ${r.status}`); return; }
    case 'comment': { const r = await jira.post(`/rest/api/2/issue/${key}/comment`, { body: line.text }); say(`  comment ${r.body?.id ?? r.status}`); return; }
    case 'move': { const ts = (await jira.get(`/rest/api/2/issue/${key}/transitions`)).body?.transitions ?? []; const want = String(line.status).toLowerCase(); const t = ts.find((x: any) => (x.to?.name ?? x.name).toLowerCase() === want); if (!t) throw new Error(`no transition to ${line.status}`); await jira.post(`/rest/api/2/issue/${key}/transitions`, { transition: { id: t.id } }); say(`  moved → ${line.status}`); return; }
  }
  throw new Error(`unknown jira act ${line.jira}`);
}
async function condition(c: Record<string, any>, line: Record<string, unknown>): Promise<boolean> {
  const key = c.key ? String(c.key) : undefined;
  if (c.status !== undefined || c.comment !== undefined) {
    if (!jira || !key) return false;
    const t = (await jira.get(`/rest/api/2/issue/${key}`)).body; if (!t) return false;
    if (c.status !== undefined && (t.fields?.status?.name ?? t.status) !== c.status) return false;
    if (c.comment !== undefined) { const cs = (await jira.get(`/rest/api/2/issue/${key}/comment`)).body?.comments ?? []; if (!cs.some((x: any) => String(x.body ?? '').includes(c.comment))) return false; }
  }
  if (c.pr !== undefined) {
    if (!gh || !key) return false;
    const repo = String(c.repo ?? clientRepo); const p = (await gh.get(`/repos/${repo}/pulls?state=all&head=${repo.split('/')[0]}:${branchOf(key)}&per_page=1`)).body?.[0];
    if (!p) return false;
    if (c.pr === 'draft' && !p.draft) return false; if (c.pr === 'ready' && p.draft) return false; if (c.pr === 'merged' && !p.merged_at) return false;
  }
  if (c.board !== undefined) {
    const out = hermes('kanban', 'list', '--json').out; let tasks: any[] = []; try { const d = JSON.parse(out); tasks = Array.isArray(d) ? d : d.tasks ?? []; } catch { /* no board */ }
    const want = c.board; if (!tasks.some((t) => String(t.title ?? '').includes(want.title ?? '') && (!want.status || t.status === want.status))) return false;
  }
  if (c.channel !== undefined) {
    const text = String(c.channel);
    if (world.SLACK_TWIN_URL && process.env.REHEARSAL_SLACK_CHANNEL) { const r = await api(world.SLACK_TWIN_URL, { authorization: 'Bearer twin' }).get(`/conversations.history?channel=${process.env.REHEARSAL_SLACK_CHANNEL}&limit=30`); if (!(r.body?.messages ?? []).some((m: any) => String(m.text ?? '').includes(text))) return false; }
    else if (world.DISCORD_TWIN_URL) { const home = process.env.DISCORD_HOME_CHANNEL ?? '1000000000000000001'; const r = await api(world.DISCORD_TWIN_URL, { authorization: 'Bot maintainer' }).get(`/api/v10/channels/${home}/messages?limit=30`); if (!(r.body ?? []).some((m: any) => String(m.content ?? '').includes(text))) return false; }
    else return false;
  }
  for (const [name, fn] of Object.entries(h.conditions ?? {})) if (c[name] !== undefined && !(await fn(ctx, c[name], line))) return false;
  return true;
}
const resolveAliases = (o: any): any => { if (Array.isArray(o)) return o.map(resolveAliases); if (o && typeof o === 'object') { const out: any = {}; for (const [k, v] of Object.entries(o)) out[k] = (k === 'key' || k === 'pr') && typeof v === 'string' && aliases[v] ? aliases[v] : resolveAliases(v); return out; } return o; };

let fails = 0;
tick(); say('the brain\'s monitors primed');
for (const raw of readFileSync(file, 'utf8').split('\n')) {
  if (!raw.trim()) continue;
  const line = resolveAliases(JSON.parse(raw)) as Record<string, any>;
  const shown = JSON.stringify(line).slice(0, 140);
  try {
    if (line.github) { say(`github: ${shown}`); await twinCall('github', line); tick(); }
    else if (line.jira) { say(`jira: ${shown}`); await twinCall('jira', line); tick(); }
    else if (line.say) { say(`say: ${shown}`); const ch = line.channel ?? (world.SLACK_TWIN_URL ? 'slack' : 'discord');
      if (ch === 'slack') await api(world.SLACK_TWIN_URL!, { authorization: 'Bearer twin' }).post('/chat.postMessage', { channel: process.env.REHEARSAL_SLACK_CHANNEL, text: line.say });
      else await api(world.DISCORD_TWIN_URL!, { authorization: 'Bot maintainer' }).post(`/api/v10/channels/${process.env.DISCORD_HOME_CHANNEL ?? '1000000000000000001'}/messages`, { content: line.say });
      tick(); }
    else if (line.clock) { say(`clock +${line.clock}`); sh(['bun', twinCli('world'), 'clock', ctx.name, 'advance', String(line.clock), '--root', resolve(ctx.root === process.cwd() ? ctx.root : ctx.root)], { quiet: true, check: false }); tick(); }
    else if (line.job) { say(`job: ${line.job}`); const j = jobs().find((x) => x.name === line.job); if (!j) throw new Error(`no job ${line.job}`); hermes('cron', 'run', '--accept-hooks', j.id); }
    else if (line.act) { say(`act: ${shown}`); const fn = h.acts?.[String(line.act)]; if (!fn) throw new Error(`no act ${line.act} in rehearsal/hooks.ts`); await fn(ctx, line); tick(); }
    else if (line.until) { say(`until: ${shown}`); const budget = Number(line.budget ?? 90); const start = Date.now(); let met = false;
      while (Date.now() - start < budget * 1000) { if (await condition(line.until, line)) { met = true; break; } tick(); await Bun.sleep(3000); }
      if (met) say(`  met`); else { say(`  NOT met in ${budget}s`); fails++; } }
    else if (line.expect) { say(`expect: ${shown}`); if (await condition(line.expect, line)) say('  PASS'); else { say('  FAIL'); fails++; } }
    else throw new Error(`unknown line ${shown}`);
  } catch (e) { say(`  ERROR ${(e as Error).message.split('\n')[0]}`); fails++; }
}
say(`story ${file.split('/').pop()}: ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
