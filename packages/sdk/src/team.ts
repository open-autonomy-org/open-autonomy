// The repository's human roster. JSON is also YAML: the editor keeps one JSON-valued `team:`
// section in config.yaml, preserving every byte outside it. No platform account database is authoritative.
export const TEAM_SCOPES = ['owner', 'direction', 'moderation', 'release-review'] as const;
export type TeamScope = typeof TEAM_SCOPES[number];
export const TEAM_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type TeamDay = typeof TEAM_DAYS[number];
/** A weekly window a member expects to be available, in their own time zone: `from` before `to`, both `HH:MM`. */
export interface TeamWindow { days: TeamDay[]; from: string; to: string }
export interface TeamMember {
  id: string;
  name: string;
  github?: { id: string; login: string };
  discord?: { id: string; name: string };
  /** Authority: what the member may decide. */
  scopes: TeamScope[];
  source: string;
  /** The project's own names for the work the member takes on (`triage`, `docs`, `outreach`); never authority. */
  roles?: string[];
  /** What the member gives, in the project's own words: their `time`, and any resource (a `machine` the project's
   *  Open Autonomy runs on, a `gpu`, a `domain`, a tool's seat). */
  contributes?: string[];
  /** When the member expects to be available; absent, nothing is assumed. */
  availability?: { tz: string; windows: TeamWindow[] };
}
export interface Team { members: TeamMember[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v);
const clock = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const zone = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(v)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; }
};
const MEMBER_KEYS = ['id', 'name', 'github', 'discord', 'scopes', 'source', 'roles', 'contributes', 'availability'];

function validateContribution(m: Record<string, unknown>): Pick<TeamMember, 'roles' | 'contributes' | 'availability'> {
  const out: Pick<TeamMember, 'roles' | 'contributes' | 'availability'> = {};
  if (m.roles !== undefined) {
    if (!Array.isArray(m.roles) || m.roles.length > 10 || m.roles.some(r => typeof r !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(r)) || new Set(m.roles).size !== m.roles.length) throw new Error('Roles are at most ten distinct lowercase names (letters, digits, hyphens).');
    if (m.roles.length) out.roles = m.roles as string[];
  }
  if (m.contributes !== undefined) {
    if (!Array.isArray(m.contributes) || m.contributes.length > 10 || m.contributes.some(c => typeof c !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(c)) || new Set(m.contributes).size !== m.contributes.length) throw new Error('Contributions are at most ten distinct lowercase names (letters, digits, hyphens): time, and each resource given.');
    if (m.contributes.length) out.contributes = m.contributes as string[];
  }
  if (m.availability !== undefined) {
    const a = m.availability;
    if (!record(a) || Object.keys(a).some(k => !['tz', 'windows'].includes(k)) || !zone(a.tz) || !Array.isArray(a.windows) || !a.windows.length || a.windows.length > 14) throw new Error('Availability needs an IANA time zone and one to fourteen weekly windows.');
    const windows = a.windows.map((w): TeamWindow => {
      if (!record(w) || Object.keys(w).some(k => !['days', 'from', 'to'].includes(k)) || !Array.isArray(w.days) || !w.days.length || w.days.some(d => !TEAM_DAYS.includes(d)) || new Set(w.days).size !== w.days.length || !clock(w.from) || !clock(w.to) || w.from >= w.to) throw new Error('Each availability window names its days and a from time before its to time (HH:MM); a window past midnight is two windows.');
      return { days: TEAM_DAYS.filter(d => (w.days as string[]).includes(d)), from: w.from, to: w.to };
    });
    out.availability = { tz: a.tz, windows };
  }
  return out;
}

export function validateTeamMember(value: unknown): TeamMember {
  const m = value;
  if (!record(m) || Object.keys(m).some(k => !MEMBER_KEYS.includes(k)) || !label(m.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(m.id) || !label(m.name, 80) || !label(m.source, 500)) throw new Error('Each member needs a stable record ID, name and source for their identity and authority.');
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
    scopes: TEAM_SCOPES.filter(s => (m.scopes as string[]).includes(s)), source: m.source, ...validateContribution(m) };
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

// A JSON-valued top-level section of config.yaml (`<key>: {...}`, continued on indented lines), with its span, so a
// writer can replace it and keep every other byte. Shared by the roster and the seams declaration.
export function configSection(config: string, key: string): { start: number; end: number; value: string } | undefined {
  const lines = config.split(/(?<=\n)/);
  let offset = 0, found: ReturnType<typeof configSection>;
  for (let i = 0; i < lines.length; i++) {
    const match = new RegExp(`^${key}:[ \\t]*(.*)`).exec(lines[i]);
    if (!match) { offset += lines[i].length; continue; }
    if (found) throw new Error(`Duplicate ${key} section in project configuration.`);
    const start = offset;
    let value = match[1].trim(), end = offset + lines[i].length;
    while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) { value += `\n${lines[++i].trim()}`; end += lines[i].length; }
    found = { start, end, value };
    offset = end;
  }
  return found;
}

export function parseTeamConfig(config: string): Team {
  const block = configSection(config, 'team');
  if (!block) return { members: [] };
  try { return validateTeam(JSON.parse(block.value)); }
  catch (e) { throw new Error(`Invalid team section: ${(e as Error).message} Use the Team editor's JSON-valued team section.`); }
}

export function replaceTeamConfig(config: string, team: Team): string {
  parseTeamConfig(config); // Never overwrite an unreadable or ambiguous authority record.
  const block = configSection(config, 'team');
  const replacement = `team: ${JSON.stringify(validateTeam(team), null, 2).replaceAll('\n', '\n  ')}\n`;
  return block ? config.slice(0, block.start) + replacement + config.slice(block.end) : `${config}${config.endsWith('\n') ? '' : '\n'}\n${replacement}`;
}

export const teamOwner = (team: Team, githubId: string): boolean => team.members.some(m => m.github?.id === githubId && m.scopes.includes('owner'));
