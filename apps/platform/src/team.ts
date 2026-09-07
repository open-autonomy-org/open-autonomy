// Human roster edits become GitHub pull requests using the human's transient OAuth token.
// Never use the platform's reader token to write, never merge, and never grant authority from a draft.
import { parseTeamConfig, replaceTeamConfig, teamOwner, validateTeam, validateTeamMember, type Team, type TeamMember } from '@open-autonomy/sdk/team';
import type { Env } from './types.js';

export interface TeamEdit { account: string; sha: string; member: TeamMember; remove: boolean; resolveGithub?: boolean }
export interface TeamFile { team: Team; text: string; sha: string; head: string; branch: string }
export const validTeamAccount = (account: string): boolean => /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(account) && !['.', '..'].includes(account.split('/')[1]);
const path = '.open-autonomy/config.yaml';

async function github(env: Env, route: string, token?: string, method = 'GET', body?: unknown): Promise<Record<string, any>> {
  const response = await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}${route}`, {
    method, headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${route.split('?')[0]} returned ${response.status}.`);
  return await response.json() as Record<string, any>;
}
const decode = (value: string): string => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
const encode = (value: string): string => btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join(''));

export async function readTeamFile(env: Env, account: string, token = env.GITHUB_TOKEN): Promise<TeamFile> {
  if (!validTeamAccount(account)) throw new Error('Invalid project repository.');
  const repo = await github(env, `/repos/${account}`, token);
  if (repo.private !== false || typeof repo.default_branch !== 'string') throw new Error('The team directory requires a public repository with a default branch.');
  const branch = repo.default_branch;
  const ref = await github(env, `/repos/${account}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const head = ref.object?.sha;
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/i.test(head)) throw new Error('GitHub did not return the default branch commit.');
  const file = await github(env, `/repos/${account}/contents/${path}?ref=${head}`, token);
  if (file.encoding !== 'base64' || typeof file.content !== 'string' || typeof file.sha !== 'string' || file.size > 64_000) throw new Error('Project configuration is missing, too large or unreadable.');
  const text = decode(file.content);
  if (new TextEncoder().encode(text).length > 64_000) throw new Error('Project configuration exceeds 64 KB.');
  return { team: parseTeamConfig(text), text, sha: file.sha, head, branch };
}

export function readTeamEdit(account: string, form: FormData): TeamEdit {
  const field = (name: string) => String(form.get(name) ?? '').trim();
  if (!validTeamAccount(account) || !/^[0-9a-f]{40}$/i.test(field('sha'))) throw new Error('Reload the Team page before editing.');
  const login = field('github_login');
  const discord = field('discord_id').replace(/^https:\/\/discord.com\/users\//, '');
  const member: TeamMember = { id: field('id') || crypto.randomUUID(), name: field('name'), scopes: form.getAll('scopes').map(String) as TeamMember['scopes'], source: field('source').replace(/\s+/g, ' '),
    ...(login ? { github: { id: field('github_id') || '1', login } } : {}),
    ...(discord ? { discord: { id: discord, name: field('discord_name') } } : {}),
  };
  validateTeamMember(member);
  if (field('attest') !== 'yes') throw new Error('Confirm the identity links and authority source before continuing.');
  // The placeholder ID in a new-account form is never committed: the callback resolves it first.
  return { account, sha: field('sha'), member, remove: field('operation') === 'remove', resolveGithub: !field('github_id') };
}

export async function proposeTeamEdit(env: Env, edit: TeamEdit, token: string, actor: { id: string; login: string }, nonce: string): Promise<string> {
  const current = await readTeamFile(env, edit.account, token);
  if (!teamOwner(current.team, actor.id)) throw new Error('Only an owner in the committed roster can authorize a team change. Establish the first owner during project setup.');
  if (current.sha !== edit.sha) throw new Error('The project configuration changed while you were editing. Reload Team and apply your change to the current roster.');
  const member = structuredClone(edit.member);
  const previous = current.team.members.find(m => m.id === member.id);
  if (edit.remove && !previous) throw new Error('That team member no longer exists.');
  if (!edit.remove && member.github) {
    const user = await github(env, `/users/${encodeURIComponent(member.github.login)}`, token);
    if (user.type !== 'User' || !Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw new Error('GitHub account must identify a human user.');
    // A supplied stable ID cannot silently be rebound by a renamed or recycled login.
    if (!edit.resolveGithub && member.github.id !== String(user.id)) throw new Error('That GitHub login does not match the recorded ID. Clear the ID only when explicitly linking a different account.');
    member.github = { id: String(user.id), login: user.login };
  }
  const members = current.team.members.filter(m => m.id !== member.id);
  if (!edit.remove) members.splice(previous ? current.team.members.indexOf(previous) : members.length, 0, member);
  const team = validateTeam({ members });
  if (!team.members.some(m => m.scopes.includes('owner'))) throw new Error('The last owner cannot be removed.');
  if (JSON.stringify(team) === JSON.stringify(current.team)) throw new Error('There are no changes to propose.');
  const text = replaceTeamConfig(current.text, team);
  const branch = `team/${nonce}`; // Deliberately outside automatic agent/** and land/** landing workflows.
  await github(env, `/repos/${edit.account}/git/refs`, token, 'POST', { ref: `refs/heads/${branch}`, sha: current.head });
  await github(env, `/repos/${edit.account}/contents/${path}`, token, 'PUT', { branch, sha: current.sha, content: encode(text), message: `team: ${edit.remove ? 'remove' : previous ? 'update' : 'add'} ${member.name}\n\nAuthorized by @${actor.login} (GitHub user ID ${actor.id}) through the Team editor.\n\n${member.source}` });
  const pr = await github(env, `/repos/${edit.account}/pulls`, token, 'POST', { head: branch, base: current.branch, title: `Team: ${edit.remove ? 'remove' : previous ? 'update' : 'add'} ${member.name}`, body: `@${actor.login} (GitHub user ID ${actor.id}) confirmed this identity and authority change in the Team editor.\n\nSource: ${member.source}\n\nReview the roster diff before merging. The committed roster remains authoritative until then. This does not approve a release or change native GitHub/Discord permissions.`, draft: true });
  if (!Number.isSafeInteger(pr.number)) throw new Error(`The roster branch ${branch} was created, but GitHub returned no pull request number. Check that branch before retrying.`);
  return `https://github.com/${edit.account}/pull/${pr.number}`;
}
