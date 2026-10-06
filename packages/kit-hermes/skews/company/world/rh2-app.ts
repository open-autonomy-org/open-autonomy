#!/usr/bin/env bun
// One of RH2's installable integration apps (runhuman-2 bots/<VO_BOT>: arcs-rooms, cards-tasks; the mirrored ontology's
// M1 and M3), run as a service of the review World and installed as an organization installs it: registered and
// installed by the owner on both sides from the app's own registrations (its rh2-app.json in the RH2 organization, its
// teams-app.json in the Teams team), each one-time code exchanged for the app's token by the app, the tokens kept in
// the app's own custody file, and the app run on its config. RFC 0021 row 2: a card's Room sits on the Floor of its
// first floor tag, its Task linked into every tagged Floor.
//
// Environment: PORT (the World's), VO_BOT, VO_RH2_URL, VO_RH2_ORGANIZATION, VO_RH2_OWNER_TOKEN, VO_RH2_ROOT,
// TEAMS_URL, VO_SUPERCODE_BIN (signed in to the World's team as the owner), VOLTER_WORLD_DATA.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const need = (name: string): string => { const v = process.env[name]; if (!v) throw new Error(`world/rh2-app.ts: ${name} is required`); return v; };
const bot = need('VO_BOT');
const rh2 = need('VO_RH2_URL').replace(/\/$/, '');
const organization = need('VO_RH2_ORGANIZATION');
const owner = need('VO_RH2_OWNER_TOKEN');
const teams = need('TEAMS_URL').replace(/\/$/, '');
const bin = need('VO_SUPERCODE_BIN');
const botDir = resolve(need('VO_RH2_ROOT'), 'bots', bot);
const dir = resolve(need('VOLTER_WORLD_DATA'), bot);
mkdirSync(dir, { recursive: true });
const registration = (side: string) => JSON.parse(readFileSync(resolve(botDir, `${side}-app.json`), 'utf8'));
const tokenEnv = `${bot.toUpperCase().replaceAll('-', '_')}`;

async function door<T>(path: string, body?: unknown, bearer = owner): Promise<T> {
  const res = await fetch(`${rh2}/api/v3${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), 'x-rh2-organization': organization, origin: rh2, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`RH2 ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { data: T }).data;
}
const cli = (args: string[], file?: [string, unknown]): any => {
  if (file) writeFileSync(resolve(dir, file[0]), JSON.stringify(file[1]));
  const done = Bun.spawnSync({ cmd: [bin, ...args, ...(file ? ['--body-file', resolve(dir, file[0])] : []), '--json'], stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`supercode ${args.slice(0, 3).join(' ')}: ${done.stderr.toString().trim().split('\n').at(-1)}`);
  const parsed = JSON.parse(done.stdout.toString());
  return parsed.data ?? parsed;
};

// 1. RH2: the owner registers the app in the organization and installs it; the app trades the code for its token.
const rh2App = registration('rh2');
const redirectUri = rh2App.redirectUrls[0] as string;
const registered = await door<{ app: { appId: string }; clientId: string; clientSecret: string }>('/automation/apps', rh2App);
const installed = await door<{ redirectTo: string }>(`/automation/apps/${registered.app.appId}/install`, { redirectUri });
const rh2Code = new URL(installed.redirectTo).searchParams.get('code');
if (!rh2Code) throw new Error(`RH2's install sent no code back: ${installed.redirectTo}`);
const access = await door<{ accessToken: string; principalId: string }>('/automation/apps/oauth/access', { clientId: registered.clientId, clientSecret: registered.clientSecret, code: rh2Code }, '');
// 2. Teams: the owner registers the app in the team and installs it with consent; the app redeems the code.
const teamsApp = registration('teams');
const made = cli(['teams', 'apps', 'register'], ['teams-app.json', teamsApp]);
const appId = made.app?.id ?? made.id;
const secret = made.secret ?? made.app?.secret;
if (!appId || !secret) throw new Error(`Teams registered no app id and secret: ${Object.keys(made).join(', ')}`);
const consent = cli(['teams', 'apps', 'install', appId], ['teams-consent.json', { redirect_url: teamsApp.redirect_urls[0], state: crypto.randomUUID(), actions: teamsApp.actions }]);
const code = consent.code ?? consent.installation?.code;
if (!code) throw new Error(`Teams' install sent no code: ${Object.keys(consent).join(', ')}`);
const redeemed = await (await fetch(`${teams}/api/v1/apps/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_id: appId, app_secret: secret, code, redirect_url: teamsApp.redirect_urls[0] }) })).json() as any;
const teamsToken = redeemed.credential?.token ?? redeemed.data?.credential?.token;
const team = redeemed.installation?.team_id ?? redeemed.data?.installation?.team_id ?? consent.installation?.team_id;
if (!teamsToken || !team) throw new Error(`Teams redeemed no token and team: ${JSON.stringify(redeemed).slice(0, 200)}`);

// 3. The app's custody and config, then the app.
const envFile = resolve(dir, 'custody.env');
writeFileSync(envFile, `${tokenEnv}_TEAMS_TOKEN=${teamsToken}\n${tokenEnv}_RH2_TOKEN=${access.accessToken}\n`, { mode: 0o600 });
const config = resolve(dir, 'config.json');
writeFileSync(config, JSON.stringify({
  teams: { server: teams, team, tokenEnv: `${tokenEnv}_TEAMS_TOKEN` },
  rh2: { baseUrl: rh2, organization, tokenEnv: `${tokenEnv}_RH2_TOKEN`, principalId: access.principalId },
  envFile, stateFile: resolve(dir, 'state.json'),
}, null, 2));
const child = Bun.spawn({ cmd: ['node', resolve(botDir, 'main.mjs'), config], stdout: 'inherit', stderr: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
Bun.serve({ port: Number(need('PORT')), hostname: '127.0.0.1', fetch: () => Response.json({ bot, team, principalId: access.principalId }) });
console.log(`${bot}: installed in the organization (${access.principalId}) and the team (${team})`);
process.exit(await child.exited);
