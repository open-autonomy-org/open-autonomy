import { expect, test } from 'bun:test';
import { parseTeamConfig, replaceTeamConfig, teamOwner, validateTeam, type Team } from '../src/team.ts';

const team: Team = { members: [{ id: 'owner', name: 'Owner', github: { id: '42', login: 'owner' }, discord: { id: '605505624226136074', name: 'owner' }, scopes: ['owner'], source: 'Owner-confirmed setup account link.' }] };

test('roster edits preserve the other owner bounds exactly, including Unicode and comments', () => {
  const before = '# Owner bounds — café\naccount: acme/app\nmodels: [permitted]\nspend:\n  limits: [{ window: 1d, usd_cents: 500 }]\n';
  const config = replaceTeamConfig(before, team) + '\nrails:\n  card: { max_usd_cents: 0 }\n';
  expect(parseTeamConfig(config)).toEqual(team);
  const changed = structuredClone(team); changed.members[0].name = 'Renamed owner';
  const next = replaceTeamConfig(config, changed);
  expect(next.startsWith(before)).toBe(true);
  expect(next.endsWith('\nrails:\n  card: { max_usd_cents: 0 }\n')).toBe(true);
  expect(parseTeamConfig(next).members[0].github?.id).toBe('42');
});

test('authority resolves by stable ID, not display name, moderation or empty setup', () => {
  expect(teamOwner(team, '42')).toBe(true);
  expect(teamOwner(team, 'owner')).toBe(false);
  expect(teamOwner(parseTeamConfig('account: acme/app\n'), '42')).toBe(false);
  const moderated = { members: [...team.members, { ...team.members[0], id: 'mod', github: { id: '43', login: 'mod' }, discord: undefined, scopes: ['moderation'] }] };
  expect(teamOwner(validateTeam(moderated), '43')).toBe(false);
});

test('ambiguous identities, unknown grants and malformed authority records fail closed', () => {
  expect(() => validateTeam({ members: [...team.members, { ...team.members[0], id: 'duplicate' }] })).toThrow('two team members');
  for (const patch of [{ source: '' }, { scopes: ['admin'] }, { github: { id: 42, login: 'owner' } }, { scopes: ['moderation'] }]) {
    expect(() => validateTeam({ members: [{ ...team.members[0], ...patch }] })).toThrow();
  }
  const config = replaceTeamConfig('account: acme/app\n', team);
  expect(() => parseTeamConfig(config + 'team: {"members":[]}\n')).toThrow('Duplicate');
  expect(() => replaceTeamConfig('team: broken\n', team)).toThrow('Invalid team');
});
