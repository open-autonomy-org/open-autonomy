// The repository's human roster. JSON is also YAML: the editor keeps one JSON-valued `team:`
// section in config.yaml, preserving every byte outside it. No platform account database is authoritative.
export const TEAM_SCOPES = ['owner', 'direction', 'moderation', 'release-review'] as const;
export type TeamScope = typeof TEAM_SCOPES[number];
export interface TeamMember {
  id: string;
  name: string;
  github?: { id: string; login: string };
  discord?: { id: string; name: string };
  scopes: TeamScope[];
  source: string;
}
export interface Team { members: TeamMember[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v);

export function validateTeamMember(value: unknown): TeamMember {
  const m = value;
  if (!record(m) || Object.keys(m).some(k => !['id', 'name', 'github', 'discord', 'scopes', 'source'].includes(k)) || !label(m.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(m.id) || !label(m.name, 80) || !label(m.source, 500)) throw new Error('Each member needs a stable record ID, name and source for their identity and authority.');
  if (!Array.isArray(m.scopes) || m.scopes.some(s => !TEAM_SCOPES.includes(s)) || new Set(m.scopes).size !== m.scopes.length) throw new Error('Unknown or duplicate team authority scope.');
  for (const platform of ['github', 'discord'] as const) {
    const account = m[platform];
    if (account !== undefined && (!record(account) || !id(account.id) || !label(account[platform === 'github' ? 'login' : 'name'], 80) || Object.keys(account).some(k => !['id', platform === 'github' ? 'login' : 'name'].includes(k)))) throw new Error(`Invalid ${platform} account: IDs must be decimal strings, with a readable name.`);
    if (platform === 'github' && record(account) && !/^[a-z\d][a-z\d-]{0,38}$/i.test(String(account.login))) throw new Error('Invalid GitHub login.');
  }
  if (!m.github && !m.discord) throw new Error('Each member needs at least one verified platform account.');
  if (m.scopes.includes('owner') && !m.github) throw new Error('An owner needs a verified GitHub account to manage the roster.');
  return { id: m.id, name: m.name,
    ...(m.github ? { github: { id: String((m.github as Record<string, unknown>).id), login: String((m.github as Record<string, unknown>).login) } } : {}),
    ...(m.discord ? { discord: { id: String((m.discord as Record<string, unknown>).id), name: String((m.discord as Record<string, unknown>).name) } } : {}),
    scopes: TEAM_SCOPES.filter(s => (m.scopes as string[]).includes(s)), source: m.source };
}

export function validateTeam(value: unknown): Team {
  if (!record(value) || Object.keys(value).some(k => k !== 'members') || !Array.isArray(value.members) || value.members.length > 50) throw new Error('Team must contain at most 50 members.');
  const seen = new Set<string>();
  const members = value.members.map(validateTeamMember);
  for (const m of members) {
    if (seen.has(`member:${m.id}`)) throw new Error('Duplicate team member ID.');
    seen.add(`member:${m.id}`);
    for (const platform of ['github', 'discord'] as const) {
      const account = m[platform];
      if (account) { const key = `${platform}:${account.id}`; if (seen.has(key)) throw new Error('A platform account cannot belong to two team members.'); seen.add(key); }
    }
  }
  if (members.length && !members.some(m => m.scopes.includes('owner'))) throw new Error('The roster must retain at least one owner.');
  return { members };
}

function section(config: string): { start: number; end: number; value: string } | undefined {
  const lines = config.split(/(?<=\n)/);
  let offset = 0, found: ReturnType<typeof section>;
  for (let i = 0; i < lines.length; i++) {
    const match = /^team:[ \t]*(.*)/.exec(lines[i]);
    if (!match) { offset += lines[i].length; continue; }
    if (found) throw new Error('Duplicate team section in project configuration.');
    const start = offset;
    let value = match[1].trim(), end = offset + lines[i].length;
    while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) { value += `\n${lines[++i].trim()}`; end += lines[i].length; }
    found = { start, end, value };
    offset = end;
  }
  return found;
}

export function parseTeamConfig(config: string): Team {
  const block = section(config);
  if (!block) return { members: [] };
  try { return validateTeam(JSON.parse(block.value)); }
  catch (e) { throw new Error(`Invalid team section: ${(e as Error).message} Use the Team editor's JSON-valued team section.`); }
}

export function replaceTeamConfig(config: string, team: Team): string {
  parseTeamConfig(config); // Never overwrite an unreadable or ambiguous authority record.
  const block = section(config);
  const replacement = `team: ${JSON.stringify(validateTeam(team), null, 2).replaceAll('\n', '\n  ')}\n`;
  return block ? config.slice(0, block.start) + replacement + config.slice(block.end) : `${config}${config.endsWith('\n') ? '' : '\n'}\n${replacement}`;
}

export const teamOwner = (team: Team, githubId: string): boolean => team.members.some(m => m.github?.id === githubId && m.scopes.includes('owner'));
